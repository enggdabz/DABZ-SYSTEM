/**
 * The morning digest (Phase 11).
 *
 * Vercel's cron calls this once a day. It works out what needs the owner's
 * attention, and sends one notification per phone to anybody who has turned
 * them on.
 *
 * WHY THIS IS A URL AND NOT A SCREEN
 * Nobody is signed in when a cron fires. That is also why it is the one route
 * in the system that cannot re-check the asker the way `/reports/export` does
 * - there is no asker. So it checks a shared secret instead, and everything it
 * reads is read with the service-role key.
 *
 * THAT MAKES THIS A PUBLIC URL THAT READS THE WHOLE SHOP, so the secret is the
 * only thing standing in front of it:
 *
 *   * Without CRON_SECRET set, the route refuses everybody - including Vercel.
 *     Failing shut is the right way round: a missing secret means nobody
 *     configured this, and silently running wide open would be worse than not
 *     running at all.
 *   * It answers the same way to a wrong secret as to no secret, and says
 *     nothing about the shop in either case.
 *   * It only ever SENDS. Nothing here can write a money row; the only columns
 *     it updates are the two that record whether a notification went out.
 */
import { NextResponse } from "next/server";

import { getSettings } from "@/lib/auth/dal";
import {
  getActiveSubscriptionsForDigest,
  markDigestSent,
  readDigestInput,
  recordSendFailure,
} from "@/lib/data/notifications";
import { buildDigest, digestIsDue } from "@/lib/notifications";
import { civilDateToISO, manilaToday } from "@/lib/period";
import { isPushConfigured, sendPush } from "@/lib/push";
import { SHOP_TIMEZONE } from "@/lib/datetime";

// A cron must always run against the live figures, never a cached copy.
export const dynamic = "force-dynamic";

/** The Manila hour right now, 0-23. */
function manilaHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: SHOP_TIMEZONE,
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
}

function refuse() {
  // Deliberately terse, and identical for a wrong secret and a missing one.
  return new NextResponse("Not found", { status: 404 });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();

  // Fail shut. An unconfigured secret must not mean "let anybody in".
  if (!secret) return refuse();

  const offered = request.headers.get("authorization");
  if (offered !== `Bearer ${secret}`) return refuse();

  if (!isPushConfigured()) {
    return NextResponse.json({
      sent: 0,
      skipped: 0,
      note: "Notifications are not set up: the VAPID keys are missing.",
    });
  }

  const [settings, subscriptions] = await Promise.all([
    getSettings(),
    getActiveSubscriptionsForDigest(),
  ]);

  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, note: "No phones are turned on." });
  }

  const todayISO = civilDateToISO(manilaToday());
  const hour = manilaHour();

  const due = subscriptions.filter((subscription) =>
    digestIsDue({
      lastDigestOnISO: subscription.lastDigestOn,
      todayISO,
      manilaHour: hour,
      workDayStart: settings.workDayStart,
    }),
  );

  if (due.length === 0) {
    return NextResponse.json({
      sent: 0,
      skipped: subscriptions.length,
      note: "Nothing due: either already sent today, or the shop has not opened.",
    });
  }

  /*
    Read the shop's warnings ONCE, not once per phone. Two admins with a phone
    each get the same summary, because it is the same shop.
  */
  const digest = buildDigest(
    await readDigestInput({ unclaimedAfterDays: settings.unclaimedUnitDays }),
  );

  if (!digest) {
    /*
      Nothing needs anybody today, so nothing is sent - and today is marked as
      done so a later run does not reconsider and interrupt the owner at four
      in the afternoon with news that there is no news.
    */
    await Promise.all(due.map((entry) => markDigestSent(entry.id, todayISO)));
    return NextResponse.json({
      sent: 0,
      skipped: due.length,
      note: "Nothing needed attention, so nothing was sent.",
    });
  }

  let sent = 0;
  let failed = 0;

  for (const subscription of due) {
    const result = await sendPush(subscription, {
      title: digest.title,
      body: digest.body,
      url: digest.url,
      // One tag for the daily digest, so today's replaces yesterday's on the
      // phone rather than stacking up a week of unread summaries.
      tag: "dabz-digest",
    });

    if (result.sent) {
      sent += 1;
      await markDigestSent(subscription.id, todayISO);
    } else {
      failed += 1;
      await recordSendFailure({
        id: subscription.id,
        keepActive: result.keepActive,
        reason: result.reason,
        failureCount: subscription.failureCount,
      });
    }
  }

  return NextResponse.json({ sent, failed, skipped: subscriptions.length - due.length });
}
