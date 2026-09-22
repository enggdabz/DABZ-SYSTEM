import "server-only";

/**
 * Sending an email, when the shop has said where to send it (docs/spec.md 11).
 *
 * NO NEW DEPENDENCY. This posts to Resend's HTTP API with `fetch`, which is
 * all a mailer is: a POST with an API key on it. A library for that would be
 * another package to keep up to date for the sake of four lines.
 *
 * IT FAILS SOFT, ALWAYS. Nothing here ever throws into the caller, because
 * the caller is a customer pressing Place order. Their order is in the
 * database; whether the shop's own email provider is having a good minute is
 * no business of theirs, and turning that into "your order could not be sent"
 * would lose the shop the sale.
 *
 * With no key, or no from address, it does nothing and says so. That is the
 * state it ships in (open decision D7), and the owner is told on the To fill
 * in screen rather than by an email that never arrives.
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain text. Nothing in this system emails HTML. */
  text: string;
}

export type MailOutcome = "sent" | "not_configured" | "failed";

export function isMailConfigured(): boolean {
  return (
    !!process.env.RESEND_API_KEY?.trim() && !!process.env.NOTIFY_FROM_EMAIL?.trim()
  );
}

export async function sendMail(message: MailMessage): Promise<MailOutcome> {
  if (!isMailConfigured()) return "not_configured";
  if (message.to.trim() === "") return "not_configured";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM_EMAIL,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });

    if (!response.ok) {
      console.error(
        "[mail] send failed:",
        response.status,
        await response.text().catch(() => ""),
      );
      return "failed";
    }

    return "sent";
  } catch (caught) {
    console.error(
      "[mail] send failed:",
      caught instanceof Error ? caught.message : caught,
    );
    return "failed";
  }
}

/** Where the shop lives, for a link in an email. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  // Vercel sets this for every deployment, so the link works before the shop
  // has a domain of its own.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : "";
}
