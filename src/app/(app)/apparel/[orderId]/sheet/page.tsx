import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { TAP_AREA } from "@/components/ui";
import { ORDER_STATUS_LABELS, summariseOrder } from "@/lib/apparel";
import { requirePermission } from "@/lib/auth/dal";
import { getApparelOrder } from "@/lib/data/apparel";
import { getCustomers } from "@/lib/data/pos";
import { DIVISIONS } from "@/lib/divisions";
import { formatPesos } from "@/lib/money";
import { formatCivilDate, parseISODate } from "@/lib/period";
import { rowPrice, rowTotal } from "@/lib/uniforms";

import { UniformSummaryGrids } from "@/components/UniformSummary";

export const metadata = { title: "Job order sheet · Dabz System" };

function showDate(iso: string | null): string {
  if (!iso) return "not set";
  const date = parseISODate(iso);
  return date ? formatCivilDate(date) : iso;
}

/**
 * The printed job order sheet (spec 8).
 *
 * This is the piece of paper that goes to the person cutting and sewing, and a
 * copy to the customer. So it carries the whole name list, not a summary:
 * production needs every size, and the customer needs to check their own
 * spelling before anything is printed on a shirt.
 *
 * EVERY FIGURE ON IT IS ADDED UP FROM THE ROWS PRINTED ABOVE IT. Nothing is
 * worked backwards from a stored total, because a sheet the customer can check
 * by hand is the only kind worth handing over.
 */
export default async function JobOrderSheetPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await connection();

  await requirePermission("apparel_job_orders");
  const { orderId } = await params;

  const [detail, customers] = await Promise.all([
    getApparelOrder(orderId),
    getCustomers(),
  ]);

  // Not found rather than forbidden: if the policies did not return it, this
  // order is not this person's to know about.
  if (!detail) notFound();

  const { order, totals } = detail;
  const customer = customers.find((entry) => entry.id === order.customerId);

  // Counted from the rows on this very sheet, never stored - so the grid and
  // the name lists above it cannot say two different numbers.
  const summary = summariseOrder(totals.lines);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`/apparel/${order.id}`} className={`text-sm underline ${TAP_AREA}`}>
          {"←"} Back to the order
        </Link>
        <span className="text-sm text-muted">
          Use your browser&apos;s Print (Ctrl+P). One copy for production, one
          for the customer.
        </span>
      </div>

      <article className="mx-auto max-w-3xl bg-white p-8 text-black shadow-sm ring-1 ring-black/10 print:rounded-none print:p-0 print:shadow-none print:ring-0">
        {/* A text wordmark, not the crest: the logos are built for black
            backgrounds and would vanish on white paper (spec 3.3). */}
        <header className="border-b-2 border-black pb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-lg font-bold tracking-tight">DABZ APPAREL</p>
              <p className="text-xs font-medium">
                &ldquo;{DIVISIONS.apparel.tagline}&rdquo;
              </p>
            </div>
            <div className="text-right">
              <p className="text-base font-bold">{order.orderNumber}</p>
              <p className="text-xs">{ORDER_STATUS_LABELS[order.status]}</p>
            </div>
          </div>
        </header>

        <section className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide">
              Team / customer
            </p>
            <p className="font-medium">{order.teamName ?? "—"}</p>
            {/*
              The project's OWN contact details, and the linked customer's only
              where the project has none - marked as such, because a sheet the
              customer checks has to say where a figure came from.
            */}
            {order.contactPerson || customer ? (
              <p className="text-xs">
                {order.contactPerson ?? `${customer?.name} (customer record)`}
              </p>
            ) : null}
            {order.contactNumber || customer?.contactNumber ? (
              <p className="text-xs">
                {order.contactNumber ??
                  `${customer?.contactNumber} (customer record)`}
              </p>
            ) : null}
            {order.address || customer?.address ? (
              <p className="text-xs">
                {order.address ?? `${customer?.address} (customer record)`}
              </p>
            ) : null}
            {order.facebookLink ? (
              <p className="break-all text-xs">{order.facebookLink}</p>
            ) : null}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide">
              Dates
            </p>
            <p className="text-xs">Ordered: {showDate(order.orderedOn)}</p>
            <p className="text-xs font-medium">
              Promised: {showDate(order.promisedOn)}
            </p>
          </div>
        </section>

        {order.layoutNote ? (
          <section className="mt-4 border border-black/40 p-2 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide">
              Layout
            </p>
            <p>{order.layoutNote}</p>
          </section>
        ) : null}

        {/* ---- The items and the people on them ------------------------- */}
        {totals.lines
          .filter((entry) => !entry.retired)
          .map((entry) => (
          <section key={entry.line.id} className="mt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black pb-1">
              <h2 className="text-sm font-bold">
                {entry.line.name}
                <span className="ml-2 text-xs font-normal">
                  {entry.line.fabric ?? ""}
                  {entry.line.fabric && entry.line.collar ? " · " : ""}
                  {entry.line.collar ?? ""}
                </span>
              </h2>
              <p className="text-xs">
                {entry.quantity} piece{entry.quantity === 1 ? "" : "s"}
              </p>
            </div>

            {entry.roster.length > 0 ? (
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-left">
                    <th className="w-6 pb-1 font-semibold">#</th>
                    <th className="pb-1 font-semibold">Name</th>
                    <th className="w-12 pb-1 font-semibold">No.</th>
                    <th className="w-12 pb-1 font-semibold">Size</th>
                    <th className="w-14 pb-1 font-semibold">Short</th>
                    <th className="pb-1 font-semibold">Short name</th>
                    <th className="w-20 pb-1 text-right font-semibold">Price</th>
                    {/*
                      pl-3 is not decoration. Price is right-aligned and
                      Remarks is left-aligned, so with no gutter between them
                      the two headings print as one word - "PriceRemarks" -
                      on the sheet the customer checks.
                    */}
                    <th className="pb-1 pl-3 font-semibold">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.roster.map((person, index) => (
                    <tr key={person.id} className="border-t border-black/20">
                      <td className="py-1">{index + 1}</td>
                      <td className="py-1">
                        {person.playerName ?? "—"}
                        {person.quantity > 1 ? (
                          <span className="font-bold"> ×{person.quantity}</span>
                        ) : null}
                      </td>
                      <td className="py-1">{person.playerNumber ?? "—"}</td>
                      <td className="py-1 font-bold">
                        {person.upperIncluded ? person.size ?? "—" : "shorts only"}
                      </td>
                      <td className="py-1 font-bold">{person.shortSize ?? "—"}</td>
                      <td className="py-1">{person.shortName ?? "—"}</td>
                      <td className="py-1 text-right">
                        {/*
                          What this ROW costs, added up from its own figures -
                          never worked backwards from the item's total. A sheet
                          the customer can check by hand is the only kind worth
                          handing over.
                        */}
                        {formatPesos(rowTotal(person, entry.line))}
                        {person.quantity > 1 ? (
                          <span className="block">
                            ({formatPesos(rowPrice(person, entry.line))} each)
                          </span>
                        ) : null}
                      </td>
                      <td className="py-1 pl-3">{person.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-xs">
                Nobody encoded &mdash; {entry.quantity} piece
                {entry.quantity === 1 ? "" : "s"}, plain.
              </p>
            )}

            <div className="mt-1 flex justify-between border-t border-black/40 pt-1 text-xs">
              <span>
                {entry.quantity} piece{entry.quantity === 1 ? "" : "s"}
                {entry.sizeExtrasCentavos > 0
                  ? ` · includes ${formatPesos(entry.sizeExtrasCentavos)} size add-ons`
                  : ""}
              </span>
              <span className="font-bold">
                {formatPesos(entry.totalCentavos)}
              </span>
            </div>
          </section>
        ))}

        {/* ---- The summary cutting and sewing work from ------------------ */}
        <section className="mt-6 border-t-2 border-black pt-2">
          <UniformSummaryGrids summary={summary} title="Summary" print />
        </section>

        {/* ---- The money ------------------------------------------------ */}
        <section className="mt-6 border-t-2 border-black pt-2 text-sm">
          <Row label="Order total" value={formatPesos(totals.totalCentavos)} bold />
          <Row label="Down payment" value={formatPesos(totals.downPaymentCentavos)} />
          <Row
            label="Other payments"
            value={formatPesos(totals.otherPaymentsCentavos)}
          />
          <div className="border-t border-black pt-1">
            <Row
              label="BALANCE"
              value={formatPesos(totals.balanceCentavos)}
              bold
            />
          </div>
          {totals.overpaid ? (
            <p className="mt-1 text-xs font-bold">
              Overpaid by {formatPesos(totals.overpaidByCentavos)}
            </p>
          ) : null}
        </section>

        {order.note ? (
          <p className="mt-4 text-xs">
            <span className="font-semibold">Note: </span>
            {order.note}
          </p>
        ) : null}

        <footer className="mt-8 grid gap-8 text-xs sm:grid-cols-2">
          <div>
            <div className="h-10 border-b border-black" />
            <p className="mt-1">Customer signature over printed name</p>
          </div>
          <div>
            <div className="h-10 border-b border-black" />
            <p className="mt-1">Received by / date</p>
          </div>
        </footer>

        <p className="mt-4 text-center text-[10px]">
          Dabz Apparel &middot; San Carlos City, Pangasinan &middot; Sizes and
          spellings are as written above. Please check before production
          starts.
        </p>
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
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
