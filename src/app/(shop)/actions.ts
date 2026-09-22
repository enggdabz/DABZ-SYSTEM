"use server";

/**
 * What a stranger may cause to happen (docs/spec.md 8, 12).
 *
 * Three things, and no more: attach a file, place an order, look their own
 * order up. Every one of them runs as NOBODY, so every one of them is written
 * the way the enquiry form was in Phase 9 - checked, capped, honeypotted,
 * rate-limited, and then written with the service-role client because RLS
 * would quite rightly refuse a visitor.
 *
 * THIS IS THE FOURTH SANCTIONED USE OF THAT KEY (see AGENTS.md), and the
 * specification asks for it in as many words: "Orders are created and tracked
 * only through server code using the service role after validation and rate
 * limiting." The boundary is written down: the catalogue, order creation, the
 * track lookup and the customer's file upload, and nothing else. Every order
 * table stays shut, `anon` cannot execute `create_online_order`, and the
 * function re-reads every price out of the database anyway.
 */
import { headers } from "next/headers";

import { isMailConfigured, sendMail, siteUrl } from "@/lib/mail";
import { formatPesos } from "@/lib/money";
import {
  checkCheckout,
  isOrderRateLimited,
  isTrackRateLimited,
  normaliseMobile,
  normaliseOrderNo,
  TRACK_NOT_FOUND,
  type CheckoutForm,
} from "@/lib/online/checkout";
import { ORDER_FILES_BUCKET } from "@/lib/online/storage";
import {
  checkUpload,
  cleanOriginalName,
  ORDER_FILE_KINDS,
  storageKey,
  UPLOAD_LIMITS,
} from "@/lib/online/uploads";
import { getSubscriptionsForOwnersAndAdmins } from "@/lib/data/notifications";
import { onlineOrderAlert } from "@/lib/notifications";
import { isPushConfigured, sendPushToAll } from "@/lib/push";
import { manilaToday } from "@/lib/period";
import {
  createSupabaseAdminClient,
  isAdminClientConfigured,
} from "@/lib/supabase/admin";

/**
 * Who is asking, as far as the limits are concerned.
 *
 * Behind Vercel the real address is the first entry in x-forwarded-for. With
 * no header at all - a local run - everybody looks the same, which makes the
 * limit STRICTER rather than looser, and that is the safe direction.
 */
async function callerAddress(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first || store.get("x-real-ip") || "unknown";
}

const UPLOADS_PER_HOUR = 20;

/**
 * Is the shop taking orders? Asked here as well as on every page.
 *
 * A Server Action is a public endpoint: somebody who kept the checkout page
 * open, or who has read the page source, can call one whether or not a screen
 * offered it. So the switch is checked where the work actually happens, not
 * only where the button was.
 *
 * Read with the admin client because the caller is nobody, exactly as the
 * rest of this file does - and it FAILS SHUT: a settings row that cannot be
 * read at all leaves the shop closed rather than open, because a stranger
 * placing an order into a database the server cannot read is the worse of the
 * two wrong answers.
 */
async function shopIsOpen(
  admin: ReturnType<typeof createSupabaseAdminClient>,
): Promise<boolean> {
  const { data, error } = await admin
    .from("app_settings")
    .select("online_shop_enabled")
    .eq("id", 1)
    .maybeSingle();

  if (error) return false;
  // A database still behind 0019 has no column and no row to read; the column
  // ships `not null default true`, so only an explicit false closes the shop.
  return data?.online_shop_enabled !== false;
}

const SHOP_CLOSED =
  "We are not taking online orders just now. Please message us on Facebook.";

// ---------------------------------------------------------------------------
// Attaching a file
// ---------------------------------------------------------------------------

export interface UploadState {
  error?: string;
  file?: {
    storagePath: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  };
}

/**
 * The customer's artwork, logo or reference photo.
 *
 * It goes through the SERVER rather than straight into storage with a signed
 * URL as docs/spec.md 6.5 sketches, for the reason the same section gives two
 * lines later: check the type by content, not by extension. A browser holding
 * an upload URL can put anything at the other end of it; a server holding the
 * bytes can look at them.
 *
 * It lands in `tmp/`, because the order does not exist yet. Order creation
 * claims it; `/api/online/purge-uploads` throws away what nobody claimed.
 */
export async function uploadOrderFileAction(
  _previous: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file first." };
  }

  if (!isAdminClientConfigured()) {
    return { error: "We cannot take files just now. Message us on Facebook instead." };
  }

  const admin = createSupabaseAdminClient();
  if (!(await shopIsOpen(admin))) return { error: SHOP_CLOSED };

  const address = await callerAddress();

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("online_rate_events")
    .select("id", { count: "exact", head: true })
    .eq("kind", "upload")
    .eq("ip_address", address)
    .gte("created_at", oneHourAgo);

  if ((count ?? 0) >= UPLOADS_PER_HOUR) {
    return {
      error: "That is a lot of files in a short time. Message us on Facebook instead.",
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = checkUpload(bytes, {
    allowed: ORDER_FILE_KINDS,
    maxBytes: UPLOAD_LIMITS.orderFileBytes,
    what: "A file",
  });

  if (!checked.ok) return { error: checked.error };

  const path = storageKey("tmp", checked.kind.extension);
  const { error } = await admin.storage
    .from(ORDER_FILES_BUCKET)
    .upload(path, bytes, { contentType: checked.kind.mime, upsert: false });

  if (error) {
    return { error: "That file could not be saved. Please try again." };
  }

  await admin
    .from("online_rate_events")
    .insert({ kind: "upload", ip_address: address, storage_path: path });

  return {
    file: {
      storagePath: path,
      originalName: cleanOriginalName(file.name),
      mimeType: checked.kind.mime,
      sizeBytes: bytes.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Placing the order
// ---------------------------------------------------------------------------

export interface PlaceOrderState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Where to send them next. The page does the redirect. */
  receiptToken?: string;
}

export interface OrderItemPayload {
  product_id: string;
  variant_label: string | null;
  options: Record<string, string>;
  qty: number;
  sizes: Record<string, number>;
  roster: { player_name: string | null; player_number: string | null; size: string }[];
  design_id: string | null;
  team_colors: string | null;
  notes: string | null;
  files: {
    storage_path: string;
    original_name: string;
    mime_type: string | null;
    size_bytes: number | null;
  }[];
}

export async function placeOrderAction(
  _previous: PlaceOrderState,
  formData: FormData,
): Promise<PlaceOrderState> {
  const form: CheckoutForm = {
    customerName: String(formData.get("customerName") ?? ""),
    mobile: String(formData.get("mobile") ?? ""),
    facebookName: String(formData.get("facebookName") ?? ""),
    method: String(formData.get("method") ?? ""),
    address: String(formData.get("address") ?? ""),
    dateNeeded: String(formData.get("dateNeeded") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    // Invisible to a person, and therefore never filled in by one.
    honeypot: String(formData.get("website") ?? ""),
  };

  if (!isAdminClientConfigured()) {
    return {
      error: "We cannot take orders just now. Please message us on Facebook.",
    };
  }

  const admin = createSupabaseAdminClient();

  const { data: settingsRow } = await admin
    .from("app_settings")
    .select("online_min_days_ahead, online_notify_email, online_shop_enabled")
    .eq("id", 1)
    .maybeSingle();

  // The switch, off the row that was just read. Same reason as above: the
  // page being gone does not mean this cannot still be called.
  if (settingsRow?.online_shop_enabled === false) {
    return { error: SHOP_CLOSED };
  }

  const checked = checkCheckout(form, {
    today: manilaToday(),
    minDaysAhead: Number(settingsRow?.online_min_days_ahead ?? 2),
  });

  if (!checked.ok) {
    /*
      A filled honeypot is thanked and thrown away - but there is nowhere to
      send them, so it is answered with the same refusal a script would get
      from a full rate limit. No person reaches this branch.
    */
    if (checked.silent) {
      return { error: "That order could not be sent. Please message us on Facebook." };
    }
    return { fieldErrors: checked.errors };
  }

  let items: OrderItemPayload[];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]")) as OrderItemPayload[];
  } catch {
    items = [];
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { error: "Your order is empty. Add something to it first." };
  }

  const address = await callerAddress();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("online_orders")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", address)
    .gte("created_at", oneHourAgo);

  if (isOrderRateLimited(count ?? 0)) {
    return {
      error:
        "That is several orders in a short time. Please message us on Facebook and we will take it from there.",
    };
  }

  /*
    ONE CALL, ONE TRANSACTION. The order, its items, its roster, its files and
    the first line of its history all land together or not at all - and every
    price in it is read out of the database inside that function, never taken
    from the browser.
  */
  const { data, error } = await admin.rpc("create_online_order", {
    p_customer_name: checked.checkout.customerName,
    p_mobile: checked.checkout.mobile,
    p_facebook_name: checked.checkout.facebookName,
    p_method: checked.checkout.method,
    p_address: checked.checkout.address,
    p_date_needed: checked.checkout.dateNeeded,
    p_notes: checked.checkout.notes,
    p_items: items,
    p_ip_address: address,
  });

  if (error || !data) {
    /*
      The database's own message is written for a person - "The smallest order
      for Full sublimation jersey is 6 pieces. You have 4." - so it is passed
      straight through rather than replaced with something vaguer.

      ONLY the messages this module raises on purpose, though. Every `raise
      exception` in `create_online_order` arrives as P0001; anything else is a
      constraint name, a column name or a type error, and handing one of those
      to a stranger describes the database to somebody who should not be able
      to see it. Those get the ordinary refusal.
    */
    const spoken = error?.code === "P0001" ? error.message : null;
    return {
      error:
        spoken ?? "That order could not be placed. Please message us on Facebook.",
    };
  }

  const created = data as { id: string; order_no: string; receipt_token: string };

  // Neither of these may hold the customer up, and neither may fail their
  // order. Both swallow everything.
  await tellTheShop(created.id, created.order_no, settingsRow?.online_notify_email ?? null);

  return { receiptToken: created.receipt_token };
}

/**
 * The shop finding out, two ways.
 *
 * The email is what the specification asks for (11). The push is what will
 * actually arrive, because the email address is empty until the owner sets
 * one and a Resend key may never exist at all - and a customer who ordered at
 * nine in the evening should not wait until morning.
 */
async function tellTheShop(
  orderId: string,
  orderNo: string,
  notifyEmail: string | null,
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();

    const { data: order } = await admin
      .from("online_orders")
      .select("customer_name, mobile, date_needed, status")
      .eq("id", orderId)
      .maybeSingle();

    const [{ data: totals }, { data: items }] = await Promise.all([
      admin
        .from("online_order_totals")
        .select("pieces, total_centavos, has_quote_items")
        .eq("order_id", orderId)
        .maybeSingle(),
      admin
        .from("online_order_items")
        .select("product_name, qty, pricing_mode")
        .eq("order_id", orderId)
        .order("position"),
    ]);

    const pieces = Number(totals?.pieces ?? 0);
    const needsQuote = Boolean(totals?.has_quote_items);

    if (notifyEmail && isMailConfigured()) {
      const lines = (items ?? [])
        .map(
          (item) =>
            `  ${item.qty} x ${item.product_name}${
              item.pricing_mode === "quote" ? " (to be quoted)" : ""
            }`,
        )
        .join("\n");

      const link = siteUrl();

      await sendMail({
        to: notifyEmail,
        subject: `New order ${orderNo}: ${order?.customer_name ?? "a customer"} (${pieces} pcs, needed ${order?.date_needed ?? "?"})`,
        text: [
          `${order?.customer_name ?? "A customer"} — ${order?.mobile ?? ""}`,
          `Needed by ${order?.date_needed ?? "?"} · ${pieces} pcs`,
          "",
          lines,
          "",
          needsQuote
            ? "This order needs a quote before it can be confirmed."
            : `Total: ${formatPesos(Number(totals?.total_centavos ?? 0))}`,
          "",
          link ? `${link}/online-orders/${orderNo}` : "Open the Online orders screen.",
        ].join("\n"),
      });
    }

    if (isPushConfigured()) {
      const [phones, waiting] = await Promise.all([
        getSubscriptionsForOwnersAndAdmins(),
        countWaitingOrders(),
      ]);

      if (phones.length > 0) {
        const alert = onlineOrderAlert({ waiting });
        await sendPushToAll(phones, {
          title: alert.title,
          body: alert.body,
          url: alert.url,
          // One tag, so a second order replaces the first rather than burying
          // it - the body already says how many are waiting.
          tag: "dabz-online-order",
        });
      }
    }
  } catch {
    // The order is saved. Nothing here is worth telling the customer.
  }
}

async function countWaitingOrders(): Promise<number> {
  try {
    const admin = createSupabaseAdminClient();
    const { count } = await admin
      .from("online_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["new", "quoted"]);
    return count ?? 0;
  } catch {
    return 1;
  }
}

// ---------------------------------------------------------------------------
// Tracking an order
// ---------------------------------------------------------------------------

export interface TrackResult {
  orderNo: string;
  status: string;
  dateNeeded: string;
  pieces: number;
  method: string;
  customerName: string;
  hasQuoteItems: boolean;
  totalCentavos: number;
  fixedTotalCentavos: number;
  quoteAmountCentavos: number | null;
  paidCentavos: number;
  balanceCentavos: number;
  productionPath: "full" | "dtf";
  doneStages: { stageKey: string; doneAt: string; skipped: boolean }[];
  items: { productName: string; qty: number; pricingMode: "fixed" | "quote" }[];
  showSteps: boolean;
}

export interface TrackState {
  error?: string;
  result?: TrackResult;
}

/**
 * Looking an order up with its number AND the mobile it was placed with.
 *
 * Both have to match, and the refusal is ONE sentence whatever went wrong. A
 * message that distinguished "no such order" from "wrong number" would be a
 * way to find out which order numbers exist, one guess at a time - and an
 * order number carries a name, a phone number and a team.
 *
 * Nothing staff-facing comes back: no internal note, no staff name, no file
 * link, no history. Only what the customer already knows plus where their own
 * order has got to.
 */
export async function trackOrderAction(
  _previous: TrackState,
  formData: FormData,
): Promise<TrackState> {
  const orderNo = normaliseOrderNo(String(formData.get("orderNo") ?? ""));
  const mobile = normaliseMobile(String(formData.get("mobile") ?? ""));

  if (orderNo === "" || mobile === "") return { error: TRACK_NOT_FOUND };

  if (!isAdminClientConfigured()) {
    return { error: "We cannot look that up just now. Please message us on Facebook." };
  }

  const admin = createSupabaseAdminClient();
  const address = await callerAddress();

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("online_rate_events")
    .select("id", { count: "exact", head: true })
    .eq("kind", "track")
    .eq("ip_address", address)
    .gte("created_at", tenMinutesAgo);

  if (isTrackRateLimited(count ?? 0)) {
    return {
      error: "That is a lot of lookups in a few minutes. Please try again shortly.",
    };
  }

  // The lookup itself is counted, so guessing costs the guesser something.
  await admin
    .from("online_rate_events")
    .insert({ kind: "track", ip_address: address });

  const { data: order } = await admin
    .from("online_orders")
    .select(
      "id, order_no, status, date_needed, method, customer_name, mobile, quote_amount_centavos",
    )
    .eq("order_no", orderNo)
    .maybeSingle();

  // Both, or nothing. Checked here rather than in the query so the two
  // failures cannot be told apart by how long the answer takes.
  if (!order || order.mobile !== mobile) return { error: TRACK_NOT_FOUND };

  const [{ data: totals }, { data: items }, { data: production }, { data: settings }] =
    await Promise.all([
      admin
        .from("online_order_totals")
        .select("*")
        .eq("order_id", order.id)
        .maybeSingle(),
      admin
        .from("online_order_items")
        .select("product_name, qty, pricing_mode, production_path")
        .eq("order_id", order.id)
        .order("position"),
      admin
        .from("online_order_production")
        .select("stage_key, done_at, skipped")
        .eq("order_id", order.id),
      admin
        .from("app_settings")
        .select("online_show_steps_to_customers")
        .eq("id", 1)
        .maybeSingle(),
    ]);

  const lines = items ?? [];

  return {
    result: {
      orderNo: order.order_no as string,
      status: order.status as string,
      dateNeeded: order.date_needed as string,
      method: order.method as string,
      customerName: order.customer_name as string,
      pieces: Number(totals?.pieces ?? 0),
      hasQuoteItems: Boolean(totals?.has_quote_items),
      totalCentavos: Number(totals?.total_centavos ?? 0),
      fixedTotalCentavos: Number(totals?.fixed_total_centavos ?? 0),
      quoteAmountCentavos:
        order.quote_amount_centavos === null
          ? null
          : Number(order.quote_amount_centavos),
      paidCentavos: Number(totals?.paid_centavos ?? 0),
      balanceCentavos: Number(totals?.balance_centavos ?? 0),
      productionPath:
        lines.length > 0 && lines.every((item) => item.production_path === "dtf")
          ? "dtf"
          : "full",
      // No staff names here. The customer is told a step is done, not who did
      // it - that is the shop's business, not theirs.
      doneStages: (production ?? []).map((step) => ({
        stageKey: step.stage_key as string,
        doneAt: step.done_at as string,
        skipped: Boolean(step.skipped),
      })),
      items: lines.map((item) => ({
        productName: item.product_name as string,
        qty: Number(item.qty),
        pricingMode: item.pricing_mode as "fixed" | "quote",
      })),
      showSteps: settings?.online_show_steps_to_customers !== false,
    },
  };
}
