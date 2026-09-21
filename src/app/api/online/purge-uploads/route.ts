/**
 * Throwing away the files nobody ordered (docs/spec.md 6.5).
 *
 * A customer attaches a logo, thinks better of the whole thing and closes the
 * tab. The file is already in `order-files/tmp/`, and no order will ever point
 * at it. This clears those out after a day.
 *
 * SAME SHAPE AS THE DIGEST CRON, AND FOR THE SAME REASONS. Nobody is signed in
 * when a cron fires, so there is no asker to check; it checks a shared secret
 * instead, and FAILS SHUT - with no CRON_SECRET set it refuses everybody,
 * including Vercel, because a missing secret means nobody configured this
 * rather than that it should run wide open. A wrong secret and a missing one
 * get the same 404.
 *
 * It only ever DELETES A FILE NOBODY CLAIMED. `create_online_order` stamps
 * `claimed_at` on the row as it takes the file, so a file an order points at
 * is never a candidate however old it is - and the query asks for unclaimed
 * rows rather than listing the bucket, so it stays cheap as the shop grows.
 */
import { NextResponse } from "next/server";

import { ORDER_FILES_BUCKET } from "@/lib/online/storage";
import {
  createSupabaseAdminClient,
  isAdminClientConfigured,
} from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** docs/spec.md 6.5: anything in tmp/ older than a day. */
const KEEP_HOURS = 24;

function refuse() {
  return new NextResponse("Not found", { status: 404 });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return refuse();

  const offered = request.headers.get("authorization");
  if (offered !== `Bearer ${secret}`) return refuse();

  if (!isAdminClientConfigured()) {
    return NextResponse.json({ purged: 0, note: "Supabase is not configured." });
  }

  const admin = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - KEEP_HOURS * 60 * 60 * 1000).toISOString();

  const { data: stale, error } = await admin
    .from("online_rate_events")
    .select("id, storage_path")
    .eq("kind", "upload")
    .is("claimed_at", null)
    .lt("created_at", cutoff)
    .limit(500);

  if (error) {
    return NextResponse.json({ purged: 0, error: error.message }, { status: 500 });
  }

  const rows = (stale ?? []).filter((row) => row.storage_path);
  if (rows.length === 0) return NextResponse.json({ purged: 0 });

  const { error: removeError } = await admin.storage
    .from(ORDER_FILES_BUCKET)
    .remove(rows.map((row) => row.storage_path as string));

  if (removeError) {
    return NextResponse.json({ purged: 0, error: removeError.message }, { status: 500 });
  }

  /*
    The row goes too, once its file has. Left behind it would be counted
    against that address's hourly upload limit for ever, which would slowly
    lock out an internet cafe.
  */
  await admin
    .from("online_rate_events")
    .delete()
    .in("id", rows.map((row) => row.id as string));

  return NextResponse.json({ purged: rows.length });
}
