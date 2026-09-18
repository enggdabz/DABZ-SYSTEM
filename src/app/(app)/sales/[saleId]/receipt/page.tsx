import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getSettings, requireUser } from "@/lib/auth/dal";
import { DIVISIONS } from "@/lib/divisions";
import { getCustomers, getSaleById, getSaleLines } from "@/lib/data/pos";
import { formatManilaDateTime } from "@/lib/datetime";
import { formatPesos } from "@/lib/money";
import { RECEIPT_WIDTH_MM } from "@/lib/settings";

export const metadata = { title: "Receipt · Dabz System" };

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  bank: "Bank",
};

/**
 * A printable receipt (spec 6).
 *
 * Narrow and black-on-white, because it is printed on a 58mm thermal roll by
 * default (open decision 17.3, decided) - the width comes from Settings, so
 * changing printer does not need a code change.
 *
 * Every figure is added up from the lines printed on it, never worked backwards
 * from a stored total, so a customer can check it by hand.
 */
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ saleId: string }>;
}) {
  await connection();

  const { saleId } = await params;
  await requireUser();

  const [sale, settings] = await Promise.all([getSaleById(saleId), getSettings()]);
  // Not found rather than forbidden: if the policies did not return it, this
  // sale is not this person's to know about.
  if (!sale) notFound();

  const [lines, customers] = await Promise.all([
    getSaleLines(saleId),
    sale.customerId ? getCustomers() : Promise.resolve([]),
  ]);

  const customer = customers.find((entry) => entry.id === sale.customerId);
  const widthMm = RECEIPT_WIDTH_MM[settings.receiptPaper];

  const subtotal = lines.reduce((total, line) => total + line.lineTotalCentavos, 0);
  const total = subtotal - sale.discountCentavos;
  const figuresDisagree =
    subtotal !== sale.subtotalCentavos || total !== sale.totalCentavos;

  // A tagline is printed when every line belongs to one division (spec 6).
  const divisions = new Set(lines.map((line) => line.division));
  const onlyDivision = divisions.size === 1 ? [...divisions][0] : null;
  const tagline = onlyDivision ? DIVISIONS[onlyDivision].tagline : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/pos" className="text-sm underline">
          {"←"} Back to the counter
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
          {/* A text wordmark, not the crest: the logos are built for black
              backgrounds and would vanish on white paper (spec 3.3). */}
          <p className="text-base font-bold tracking-tight">DABZ PRINTSHOPPE</p>
          {tagline ? (
            <p className="text-[10px] font-medium">&ldquo;{tagline}&rdquo;</p>
          ) : null}
          {sale.voidedAt ? (
            <p className="mt-2 border border-black py-1 text-sm font-bold">
              VOIDED
            </p>
          ) : null}
        </header>

        <div className="mt-3 border-t border-dashed border-black/40 pt-2 text-[11px]">
          <p className="font-semibold">{sale.saleNumber}</p>
          <p>{formatManilaDateTime(sale.occurredAt)}</p>
          {customer ? <p>Customer: {customer.name}</p> : <p>Walk-in</p>}
        </div>

        <table className="mt-3 w-full border-t border-dashed border-black/40 pt-2 text-[11px]">
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="align-top">
                <td className="py-1 pr-2">
                  {line.name}
                  <span className="block text-[10px]">
                    {line.quantity} &times; {formatPesos(line.unitPriceCentavos)}
                  </span>
                </td>
                <td className="py-1 text-right whitespace-nowrap">
                  {formatPesos(line.lineTotalCentavos)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-2 space-y-0.5 border-t border-dashed border-black/40 pt-2 text-[11px]">
          <Row label="Subtotal" value={formatPesos(subtotal)} />
          {sale.discountCentavos > 0 ? (
            <Row
              label={
                sale.discountKind === "percent" && sale.discountPercent !== null
                  ? `Discount (${sale.discountPercent}%)`
                  : "Discount"
              }
              value={`−${formatPesos(sale.discountCentavos)}`}
            />
          ) : null}
          <div className="border-t border-black pt-1">
            <Row label="TOTAL" value={formatPesos(total)} bold />
          </div>
          {/* For cash, the two rows below already say so; repeating "Cash" as
              the method line just reads as a mistake on the slip. */}
          {sale.moneyGivenCentavos !== null ? (
            <>
              <Row label="Cash given" value={formatPesos(sale.moneyGivenCentavos)} />
              <Row
                label="Change"
                value={formatPesos(sale.changeCentavos ?? 0)}
                bold
              />
            </>
          ) : (
            <Row
              label={`Paid by ${PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}`}
              value={sale.referenceNumber ? `Ref ${sale.referenceNumber}` : ""}
            />
          )}
        </div>

        {figuresDisagree ? (
          <p className="mt-3 border border-black p-2 text-[10px]">
            <strong>{"⚠"} These figures do not match what is recorded.</strong>{" "}
            The lines add up to {formatPesos(total)}, but the sale is stored as{" "}
            {formatPesos(sale.totalCentavos)}. Show this to the owner before
            giving it to the customer.
          </p>
        ) : null}

        <footer className="mt-4 border-t border-dashed border-black/40 pt-2 text-center text-[10px]">
          <p>Thank you!</p>
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
