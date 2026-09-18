import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { getEnquiries } from "@/lib/data/enquiries";
import { formatManilaDateTime } from "@/lib/datetime";
import { DIVISIONS } from "@/lib/divisions";
import {
  ENQUIRY_STATUS_LABELS,
  heardFromCounts,
  type Enquiry,
} from "@/lib/enquiries";

import { EnquiryReply } from "./EnquiryReply";

export const metadata = { title: "Messages · Dabz System" };

/**
 * Messages sent from the public page (Phase 9).
 *
 * Owner/Admin only, and not because of a checkbox: an enquiry carries a
 * stranger's name and phone number, so the `enquiries` table has no staff
 * policy at all. This screen re-checks anyway - a page is a public endpoint.
 */
export default async function EnquiriesPage() {
  await connection();
  await requireOwnerOrAdmin();

  const enquiries = await getEnquiries();

  const waiting = enquiries.filter((enquiry) => enquiry.status === "new");
  const handled = enquiries.filter((enquiry) => enquiry.status !== "new");
  const sources = heardFromCounts(enquiries);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-2 text-muted">
          What customers sent from your public page. Answer them wherever they
          asked you to - Messenger, a text, a phone call - then record here that
          you did.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Waiting for an answer">
          <p className="text-2xl font-semibold">{waiting.length}</p>
          <p className="mt-1 text-sm text-muted">
            {waiting.length === 0
              ? "Nobody is waiting on you."
              : "Newest first, so nothing that just came in is missed."}
          </p>
        </Card>

        <Card title="Answered or closed">
          <p className="text-2xl font-semibold">{handled.length}</p>
          <p className="mt-1 text-sm text-muted">
            Kept, so &ldquo;I messaged you last week&rdquo; can be checked.
          </p>
        </Card>

        <Card
          title="Where they heard about you"
          description="Typed by the customer, in their own words."
        >
          {sources.length === 0 ? (
            <p className="text-sm text-muted">
              Nobody has answered that question yet.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {sources.slice(0, 6).map((source) => (
                <li key={source.source} className="flex justify-between gap-4">
                  <span className="truncate">{source.source}</span>
                  <span className="font-medium">{source.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="Waiting"
        description="A message here has not been answered yet."
      >
        {waiting.length === 0 ? (
          <Notice tone="success" title="Nothing waiting">
            Every message has been answered or closed.
          </Notice>
        ) : (
          <ul className="space-y-6">
            {waiting.map((enquiry) => (
              <li
                key={enquiry.id}
                className="border-t border-line/60 pt-6 first:border-0 first:pt-0"
              >
                <EnquiryDetail enquiry={enquiry} />
                <div className="mt-4">
                  <EnquiryReply enquiry={enquiry} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {handled.length > 0 ? (
        <Card title="Answered and closed">
          <ul className="space-y-6">
            {handled.map((enquiry) => (
              <li
                key={enquiry.id}
                className="border-t border-line/60 pt-6 first:border-0 first:pt-0"
              >
                <EnquiryDetail enquiry={enquiry} />
                {enquiry.replyNote ? (
                  <p className="mt-2 rounded-card bg-surface-sunken px-3 py-2 text-sm text-ink/80">
                    {enquiry.replyNote}
                  </p>
                ) : null}
                <div className="mt-3">
                  <EnquiryReply enquiry={enquiry} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function EnquiryDetail({ enquiry }: { enquiry: Enquiry }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <h3 className="font-semibold">{enquiry.name}</h3>
          <p className="text-xs text-muted">
            {formatManilaDateTime(enquiry.createdAt)}
            {enquiry.division ? ` · ${DIVISIONS[enquiry.division].name}` : ""}
            {enquiry.heardFrom ? ` · heard from: ${enquiry.heardFrom}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {enquiry.status === "new" ? null : (
            <Tag tone={enquiry.status === "replied" ? "success" : "neutral"}>
              {ENQUIRY_STATUS_LABELS[enquiry.status]}
            </Tag>
          )}
          {/*
            The contact is a link, because the whole point of the screen is to
            get in touch. A number dials from a phone at the counter; anything
            else is shown as it was typed.
          */}
          <ContactLink contact={enquiry.contact} />
        </div>
      </div>

      <p className="mt-3 text-sm whitespace-pre-line">{enquiry.message}</p>
    </>
  );
}

function ContactLink({ contact }: { contact: string }) {
  // Padded, not bare: bare text is a 20px target and this is the one thing on
  // the screen a person actually taps.
  const className = "-mx-1 inline-block px-1 py-1 text-sm underline";

  if (contact.includes("@")) {
    return (
      <a href={`mailto:${contact}`} className={className}>
        {contact}
      </a>
    );
  }

  // A phone number typed any of the ways a Filipino customer writes one:
  // 0917..., +63917..., 0917 123 4567. Anything with letters in it is not a
  // number and is left alone.
  const digits = contact.replace(/[\s()-]/g, "");
  if (/^\+?\d{7,15}$/.test(digits)) {
    return (
      <a href={`tel:${digits}`} className={className}>
        {contact}
      </a>
    );
  }

  return <span className="text-sm text-muted">{contact}</span>;
}
