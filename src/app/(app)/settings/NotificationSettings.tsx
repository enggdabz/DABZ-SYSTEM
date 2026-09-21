"use client";

/**
 * Turning notifications on for the phone you are holding (Phase 11).
 *
 * Only the browser can do the first part: ask the person for permission, and
 * hand back an endpoint plus the two keys the payload gets encrypted with. So
 * this is a client component, and the Server Action beside it only stores
 * what the browser produced.
 *
 * WHAT IT WILL NOT DO
 * It does not ask for permission on load. A permission prompt nobody invited
 * is the fastest way to have it denied for ever - once a browser is refused,
 * the prompt cannot be raised again from code, and the person has to go into
 * their settings to undo it. So nothing happens until the button is pressed.
 */
import { useActionState, useState, useSyncExternalStore } from "react";

import { Button, Notice, TAP_AREA } from "@/components/ui";

import {
  subscribeAction,
  unsubscribeAction,
  type NotificationState,
} from "./notifications";

export interface PhoneRow {
  id: string;
  userAgent: string | null;
  createdAt: string;
  active: boolean;
  lastError: string | null;
  /** True for the browser this page is being read on. */
  isThisPhone?: boolean;
}

/**
 * The VAPID public key arrives base64url; the browser wants raw bytes.
 *
 * Built over an explicit ArrayBuffer rather than with `Uint8Array.from`,
 * because `applicationServerKey` will not take the `ArrayBufferLike` the
 * shorthand produces - it has to be backed by a real ArrayBuffer, not
 * possibly a SharedArrayBuffer.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));

  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

function bufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

type Support = "checking" | "ready" | "unsupported" | "denied";

/*
  What this browser can do, read through useSyncExternalStore.

  It has to be read from the browser - `navigator` and `Notification` do not
  exist while the page is rendered on the server - and an effect that called
  setState would be a cascading render. useSyncExternalStore is the sanctioned
  way round that: it renders the server snapshot ("checking"), then swaps to
  the real answer on the client without a hydration mismatch.

  Nothing subscribes, because permission cannot change under us: the browser
  only changes it through the prompt we raise ourselves, and `enable()` records
  that result directly.
*/
const NEVER_CHANGES = () => () => {};

function readSupport(): Support {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  return Notification.permission === "denied" ? "denied" : "ready";
}

const readSupportOnServer = (): Support => "checking";

export function NotificationSettings({
  publicKey,
  phones,
  missingKeys,
}: {
  /** Null when the owner has not generated the VAPID keys yet. */
  publicKey: string | null;
  phones: PhoneRow[];
  /** The env var names still to be set, for the not-set-up message. */
  missingKeys: string[];
}) {
  const detected = useSyncExternalStore(
    NEVER_CHANGES,
    readSupport,
    readSupportOnServer,
  );
  // Set only by `enable()`, when the person answers the permission prompt.
  const [answered, setAnswered] = useState<Support | null>(null);
  const support = answered ?? detected;

  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const [onState, turnOn] = useActionState<NotificationState, FormData>(
    subscribeAction,
    {},
  );
  const [offState, turnOff, turningOff] = useActionState<
    NotificationState,
    FormData
  >(unsubscribeAction, {});

  /**
   * Register the worker, ask for permission, subscribe, and post the result to
   * the server as an ordinary form submission.
   */
  async function enable() {
    setProblem(null);
    setBusy(true);

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setAnswered(permission === "denied" ? "denied" : "ready");
        setProblem(
          permission === "denied"
            ? null
            : "Notifications were not allowed. Nothing has changed.",
        );
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        // Required by every browser: a push that shows nothing is not allowed.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey ?? ""),
      });

      const json = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };

      const form = new FormData();
      form.set("endpoint", json.endpoint ?? subscription.endpoint);
      form.set(
        "p256dh",
        json.keys?.p256dh ?? bufferToBase64(subscription.getKey("p256dh")),
      );
      form.set(
        "auth",
        json.keys?.auth ?? bufferToBase64(subscription.getKey("auth")),
      );
      form.set("userAgent", navigator.userAgent);

      turnOn(form);
    } catch (error) {
      setProblem(
        error instanceof Error
          ? `This phone refused: ${error.message}`
          : "This phone refused to turn notifications on.",
      );
    } finally {
      setBusy(false);
    }
  }

  // ---- The states where there is nothing to press ------------------------

  if (missingKeys.length > 0) {
    return (
      <Notice tone="attention" title="Notifications are not set up yet">
        <p>
          They need one pair of signing keys, generated once. Run{" "}
          <code className="rounded bg-ink/10 px-1">npm run push:keys</code> and
          follow what it prints &mdash; it adds{" "}
          {missingKeys.map((key, index) => (
            <span key={key}>
              {index > 0 ? " and " : ""}
              <code className="rounded bg-ink/10 px-1">{key}</code>
            </span>
          ))}{" "}
          to your settings. Nothing here works until both exist, and no button
          is shown that would fail.
        </p>
      </Notice>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold tracking-tight">Notifications</h3>
        <p className="mt-1 text-sm text-muted">
          One summary each morning when the shop opens, listing what needs you
          &mdash; bills due, stock low, units not collected, messages waiting.
          If nothing needs you, <strong>nothing is sent</strong>. A customer
          message is the one thing that arrives straight away.
        </p>
      </div>

      {support === "unsupported" ? (
        <Notice tone="info" title="This browser cannot receive notifications">
          <p>
            Open the system on your phone in Chrome or Safari and turn it on
            there. On an iPhone you must first add it to your Home Screen
            &mdash; Apple only allows notifications for an app installed that
            way.
          </p>
        </Notice>
      ) : null}

      {support === "denied" ? (
        <Notice tone="attention" title="This phone has blocked notifications">
          <p>
            The block was made in the browser, so it cannot be undone from
            here. Open your browser&apos;s site settings for this page, allow
            notifications, then come back and press the button.
          </p>
        </Notice>
      ) : null}

      {support === "ready" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={enable} disabled={busy}>
            {busy ? "Asking this phone..." : "Turn on for this phone"}
          </Button>
          <span className="text-xs text-muted">
            You will be asked to allow it. Nothing is sent until you do.
          </span>
        </div>
      ) : null}

      {problem ? <Notice tone="attention" title={problem} /> : null}
      {onState.error ? <Notice tone="attention" title={onState.error} /> : null}
      {onState.success ? <Notice tone="success" title={onState.success} /> : null}
      {offState.error ? <Notice tone="attention" title={offState.error} /> : null}
      {offState.success ? (
        <Notice tone="success" title={offState.success} />
      ) : null}

      {phones.length > 0 ? (
        <div className="border-t border-line/60 pt-4">
          <h4 className="text-sm font-medium">
            Phones receiving notifications ({phones.filter((p) => p.active).length})
          </h4>
          <ul className="mt-3 divide-y divide-line/60">
            {phones.map((phone) => (
              <li
                key={phone.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {describePhone(phone.userAgent)}
                  </span>
                  <span className="block text-xs text-muted">
                    Turned on {new Date(phone.createdAt).toLocaleDateString()}
                    {phone.active ? "" : " · switched off"}
                  </span>
                  {!phone.active && phone.lastError ? (
                    <span className="mt-0.5 flex items-start gap-1.5 text-xs text-attention">
                      <span aria-hidden="true">{"⚠"}</span>
                      <span>{phone.lastError}</span>
                    </span>
                  ) : null}
                </span>

                <form action={turnOff}>
                  <input type="hidden" name="id" value={phone.id} />
                  <button
                    type="submit"
                    disabled={turningOff}
                    className={`text-sm underline ${TAP_AREA}`}
                  >
                    Turn off
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A phone, in words somebody would recognise.
 *
 * Deliberately crude: the point is only to tell two phones apart when turning
 * one off, and a user-agent string parsed in earnest is a library plus a
 * lifetime of keeping up with it.
 */
function describePhone(userAgent: string | null): string {
  if (!userAgent) return "A phone or computer";

  const ua = userAgent.toLowerCase();
  const device = ua.includes("iphone")
    ? "iPhone"
    : ua.includes("ipad")
      ? "iPad"
      : ua.includes("android")
        ? "Android phone"
        : ua.includes("windows")
          ? "Windows computer"
          : ua.includes("mac")
            ? "Mac"
            : "A phone or computer";

  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("chrome")
      ? "Chrome"
      : ua.includes("safari")
        ? "Safari"
        : ua.includes("firefox")
          ? "Firefox"
          : null;

  return browser ? `${device} · ${browser}` : device;
}
