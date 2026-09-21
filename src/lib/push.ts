import "server-only";

/**
 * Actually sending a notification (Phase 11).
 *
 * The decision of WHAT to send lives in `src/lib/notifications.ts`, which is
 * pure and tested. This file is only the delivery: signing the message, handing
 * it to Google's or Apple's push service, and writing down what happened.
 *
 * WHY A LIBRARY RATHER THAN OUR OWN CODE
 * Web Push is two pieces of cryptography stacked: a VAPID JWT signed with
 * ES256, and the payload encrypted with aes128gcm through an ECDH key
 * agreement and HKDF (RFC 8291). Getting either subtly wrong does not raise an
 * error - the push service simply answers 400 and the owner never learns why
 * their notifications stopped. That is exactly the class of thing this project
 * does not hand-roll, so `web-push` does it. It is the de facto standard
 * implementation and has no runtime dependencies on anything this app does.
 *
 * WHAT THE PUSH SERVICE CAN SEE
 * Nothing. The payload is encrypted with the browser's own `p256dh` and `auth`
 * keys before it leaves us, so Google and Apple carry the notification without
 * being able to read a peso of it. What they do see is that a message went to
 * a particular browser, and how big it was.
 */
import webpush from "web-push";

import { pushSetup, subscriptionVerdict } from "./notifications";

/** Who the push services should contact about our messages, per the VAPID spec. */
const CONTACT = "mailto:engg.dabz@gmail.com";

export interface PushTarget {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failureCount: number;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  /** Groups notifications on the phone, so today's digest replaces yesterday's. */
  tag: string;
}

export interface PushResult {
  id: string;
  sent: boolean;
  statusCode: number | null;
  keepActive: boolean;
  reason: string | null;
}

/** True when the owner has generated and installed the VAPID keys. */
export function isPushConfigured(): boolean {
  return pushSetup({
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  }).ready;
}

/** The public half, for a browser that is about to subscribe. */
export function pushPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

/**
 * Sends one message to one browser.
 *
 * NEVER THROWS. A notification is the least important thing happening in this
 * system: a customer's message must be saved whether or not the owner's phone
 * can be reached, and a digest that fails for one phone must still go to the
 * other. So every failure comes back as a result to be recorded, not as an
 * exception to be caught by whoever happened to call.
 */
export async function sendPush(
  target: PushTarget,
  message: PushMessage,
): Promise<PushResult> {
  if (!isPushConfigured()) {
    return {
      id: target.id,
      sent: false,
      statusCode: null,
      keepActive: true,
      reason: "Notifications are not set up: the VAPID keys are missing.",
    };
  }

  webpush.setVapidDetails(
    CONTACT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );

  try {
    const response = await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      JSON.stringify(message),
      // A digest is worth nothing tomorrow, so the push service should stop
      // trying after a day rather than delivering yesterday's news.
      { TTL: 60 * 60 * 20 },
    );

    const verdict = subscriptionVerdict({
      statusCode: response.statusCode,
      failureCount: target.failureCount,
    });

    return {
      id: target.id,
      sent: true,
      statusCode: response.statusCode,
      keepActive: verdict.keepActive,
      reason: verdict.reason,
    };
  } catch (error) {
    // web-push throws a WebPushError carrying the status code for anything
    // that is not a 2xx - including the 404 and 410 that mean "this phone is
    // gone", which is a fact worth recording rather than an error.
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode: unknown }).statusCode)
        : null;

    const verdict = subscriptionVerdict({
      statusCode: Number.isFinite(statusCode) ? statusCode : null,
      failureCount: target.failureCount,
    });

    return {
      id: target.id,
      sent: false,
      statusCode: Number.isFinite(statusCode) ? statusCode : null,
      keepActive: verdict.keepActive,
      reason: verdict.reason,
    };
  }
}

/**
 * Sends the same message to every one of a person's phones, at once.
 *
 * `allSettled` rather than `all`: one dead phone must not stop the others, and
 * `sendPush` already turns every failure into a result, so a rejection here
 * would mean a bug rather than a push problem.
 */
export async function sendPushToAll(
  targets: readonly PushTarget[],
  message: PushMessage,
): Promise<PushResult[]> {
  const settled = await Promise.allSettled(
    targets.map((target) => sendPush(target, message)),
  );

  return settled.flatMap((entry, index) =>
    entry.status === "fulfilled"
      ? [entry.value]
      : [
          {
            id: targets[index].id,
            sent: false,
            statusCode: null,
            keepActive: true,
            reason: "The notification could not be sent.",
          },
        ],
  );
}
