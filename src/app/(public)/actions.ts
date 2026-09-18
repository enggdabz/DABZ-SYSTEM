"use server";

/**
 * Receiving an enquiry from the public page (Phase 9).
 *
 * THE ONE PUBLIC WRITE IN THIS SYSTEM.
 *
 * Everywhere else a write starts with somebody signed in. Here it starts with
 * whoever found the page, so:
 *
 *   - the `enquiries` table has NO insert policy at all, for anyone;
 *   - this action uses the service-role client, which is allowed for work that
 *     happens before anyone is signed in - the same reason sign-in itself may;
 *   - every field is checked and every length capped by `checkEnquiry` before
 *     anything is written;
 *   - an address that has already sent five in an hour is refused;
 *   - anything that fills the honeypot is told it worked and stored nowhere.
 *
 * So the table stays shut and there is exactly one way in, which is code that
 * can be read and tested.
 */
import { headers } from "next/headers";

import { checkEnquiry, isRateLimited, type EnquiryForm } from "@/lib/enquiries";
import {
  createSupabaseAdminClient,
  isAdminClientConfigured,
} from "@/lib/supabase/admin";

export interface EnquiryState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
}

/** The thank-you is the same whether it was stored or silently dropped. */
const THANK_YOU =
  "Thank you — we have your message and will get back to you.";

/**
 * Who sent it, as far as the rate limit is concerned.
 *
 * Behind Vercel the real address is in x-forwarded-for; the first entry is the
 * client and the rest are proxies. When there is no header at all - a local
 * run - everybody looks the same, which makes the limit stricter rather than
 * looser, and that is the safe direction.
 */
async function callerAddress(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first || store.get("x-real-ip") || "unknown";
}

export async function sendEnquiryAction(
  _previous: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  const form: EnquiryForm = {
    name: String(formData.get("name") ?? ""),
    contact: String(formData.get("contact") ?? ""),
    division: String(formData.get("division") ?? ""),
    message: String(formData.get("message") ?? ""),
    heardFrom: String(formData.get("heardFrom") ?? ""),
    honeypot: String(formData.get("website") ?? ""),
  };

  const checked = checkEnquiry(form);

  if (!checked.ok) {
    // A filled honeypot is thanked and thrown away. No person reaches here.
    if (checked.silent) return { success: THANK_YOU };
    return { fieldErrors: checked.errors };
  }

  if (!isAdminClientConfigured()) {
    return {
      error:
        "The message could not be sent just now. Please call or message us on Facebook instead.",
    };
  }

  const admin = createSupabaseAdminClient();
  const address = await callerAddress();

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("enquiries")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", address)
    .gte("created_at", oneHourAgo);

  if (isRateLimited(count ?? 0)) {
    return {
      error:
        "That is several messages in a short time. Please call us or message us on Facebook instead.",
    };
  }

  const { error } = await admin.from("enquiries").insert({
    name: checked.enquiry.name,
    contact: checked.enquiry.contact,
    division: checked.enquiry.division,
    message: checked.enquiry.message,
    heard_from: checked.enquiry.heardFrom,
    ip_address: address,
  });

  if (error) {
    return {
      error:
        "The message could not be sent just now. Please call or message us on Facebook instead.",
    };
  }

  /*
    No audit log entry: the audit log records what STAFF did, and nobody is
    signed in here. The enquiry is its own record, and answering it is the
    thing that gets logged.
  */
  return { success: THANK_YOU };
}
