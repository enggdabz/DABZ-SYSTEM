import Link from "next/link";

import { TAP_AREA } from "@/components/ui";
import { paymentKindLabel } from "@/lib/collections";
import type { PaymentReceipt } from "@/lib/data/receipts";
import { formatManilaDateTime } from "@/lib/datetime";
import { DIVISIONS } from "@/lib/divisions";
import { MONEY_SOURCE_LABELS } from "@/lib/ledger";
import { formatPesos } from "@/lib/money";
import { RECEIPT_WIDTH_MM, type ReceiptPaper } from "@/lib/settings";

/**
 * The slip a customer takes away after a down payment or a balance (spec 3.5).
 *
 * Both divisions print the same sheet: a payment receipt says the same four
 * things whether it is for jerseys or a laptop, and two near-identical files
 * would drift apart within a phase.
 *
 * SAME RULES AS THE COUNTER RECEIPT
 *   * Narrow, black on white, at the width in Settings - it comes off the same
 *     58mm roll by default (open decision 17.3).
 *   * A text wordmark, never the crest: the logos are built for a dark ground
 *     and would vanish on white paper.
 *   * EVERY FIGURE IS ADDED UP FROM THE ROWS PRINTED ON IT. The customer can
 *     check the arithmetic by hand, which is the whole reason a shop hands
 *     over paper.
 *   * A voided payment prints with VOIDED across it and adds nothing to what
 *     has been paid, so it cannot be passed off as a valid slip.
 */
export function PaymentReceiptSheet({
  receipt,
  paper,
  backHref,
  backLabel,
}: {
  receipt: PaymentReceipt;
  paper: ReceiptPaper;
  backHref: string;
  backLabel: string;
}) {
  const widthMm = RECEIPT_WIDTH_MM[paper];
  const division = DIVISIONS[receipt.division];
  const { figures } = receipt;

  const voided = receipt.voidedAt !== null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link href={backHref} className={`text-sm underline ${TAP_AREA}`}>
          {"←"} {backLabel}
        </Link>
        <span className="text-sm text-muted">
          Use your browser&apos;s Print (Ctrl+P). Paper: {widthMm}mm wide.
        </span>
      </div>

      <article
        className="mx-auto bg-white p-4 text-black shadow-sm ring-1 ring-black/10 print:rounded-none print:p-0 print:shadow-none print:ring-0"
        style={{ width: `${widthMm}mm`, maxWidth: "100%" }}
      >
        <header className="text-center">
          <p className="text-base font-bold tracking-tight">
            {division.name.toUpperCase()}
          </p>
          {division.tagline ? (
            <p className="text-[10px] font-medium">
              &ldquo;{division.tagline}&rdquo;
            </p>
          ) : null}
          <p className="mt-1 text-[10px] font-semibold tracking-widest">
            PAYMENT RECEIPT
          </p>
          {voided ? (
            <p className="mt-2 border border-black py-1 text-sm font-bold">
              VOIDED
            </p>
          ) : null}
        </header>

        <div className="mt-3 border-t border-dashed border-black/40 pt-2 text-[11px]">
          <p className="font-semibold">{receipt.reference}</p>
          <p>{formatManilaDateTime(receipt.takenAt)}</p>
          <p>{receipt.customerName}</p>
          {receipt.detail ? <p>{receipt.detail}</p> : null}
        </div>

        <div className="mt-3 space-y-0.5 border-t border-dashed border-black/40 pt-2 text-[11px]">
          <Row
            label={paymentKindLabel({ paymentKind: receipt.kind })}
            value={formatPesos(receipt.amountCentavos)}
            bold
          />
          <Row
            label="Paid with"
            value={MONEY_SOURCE_LABELS[receipt.source] ?? receipt.source}
          />
          {receipt.referenceNumber ? (
            <Row label="Reference" value={receipt.referenceNumber} />
          ) : null}
          {receipt.note ? <Row label="Note" value={receipt.note} /> : null}
        </div>

        {/*
          The four figures, in the order a customer checks them. Each is added
          up from the job's own rows, so "paid before + this payment" is
          visibly "paid so far", and that plus the balance is visibly the
          total.
        */}
        <div className="mt-3 space-y-0.5 border-t border-dashed border-black/40 pt-2 text-[11px]">
          <Row label="Order total" value={formatPesos(figures.totalCentavos)} />
          <Row
            label="Paid before this"
            value={formatPesos(figures.paidBeforeCentavos)}
          />
          <Row
            label="This payment"
            value={
              voided
                ? `${formatPesos(figures.thisPaymentCentavos)} (voided)`
                : formatPesos(figures.thisPaymentCentavos)
            }
          />
          <div className="border-t border-black/40 pt-1">
            <Row label="Paid so far" value={formatPesos(figures.paidAfterCentavos)} />
          </div>
          <div className="border-t border-black pt-1">
            <Row
              label="BALANCE"
              value={formatPesos(figures.balanceRemainingCentavos)}
              bold
            />
          </div>
          {figures.overpaid ? (
            <Row
              label="Overpaid by"
              value={formatPesos(figures.overpaidByCentavos)}
            />
          ) : null}
        </div>

        {voided ? (
          <p className="mt-3 border border-black p-2 text-[10px]">
            <strong>This payment was taken back.</strong> It adds nothing to
            what has been paid, and the balance above is what is owed as though
            it had never happened.
            {receipt.voidReason ? ` Reason: ${receipt.voidReason}` : ""}
          </p>
        ) : null}

        {figures.totalCentavos === 0 ? (
          <p className="mt-3 border border-black p-2 text-[10px]">
            <strong>{"⚠"} Nothing on this job has been priced yet.</strong> The
            payment above was received; the total and the balance cannot be
            worked out until the items are priced.
          </p>
        ) : null}

        <footer className="mt-4 border-t border-dashed border-black/40 pt-2 text-center text-[10px]">
          <p>
            Received by {receipt.takenBy ?? "the shop"} &middot;{" "}
            {receipt.paidOnISO}
          </p>
          <p className="mt-1">Thank you!</p>
          <p className="mt-1">This is not an official BIR receipt.</p>
        </footer>
      </article>
    </div>
  );
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="whitespace-nowrap">{value}</span>
    </div>
  );
}
