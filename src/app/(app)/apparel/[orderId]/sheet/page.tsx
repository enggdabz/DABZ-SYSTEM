import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ORDER_STATUS_LABELS } from "@/lib/apparel";
import { requirePermission } from "@/lib/auth/dal";
import { getApparelOrder } from "@/lib/data/apparel";
import { getCustomers } from "@/lib/data/pos";
import { DIVISIONS } from "@/lib/divisions";
import { formatPesos } from "@/lib/money";
import { formatCivilDate, parseISODate } from "@/lib/period";

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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link href={`/apparel/${order.id}`} className="text-sm underline">
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
            {customer ? (
              <p className="text-xs">
                {customer.name}
                {customer.contactNumber ? ` · ${customer.contactNumber}` : ""}
              </p>
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

        {/* ---- The items and their name lists --------------------------- */}
        {totals.lines.map((entry) => (
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
                {entry.quantity} &times;{" "}
                {entry.line.unitPriceCentavos > 0
                  ? formatPesos(entry.line.unitPriceCentavos)
                  : "price not set"}
              </p>
            </div>

            {entry.roster.length > 0 ? (
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-left">
                    <th className="w-8 pb-1 font-semibold">#</th>
                    <th className="pb-1 font-semibold">Name</th>
                    <th className="w-16 pb-1 font-semibold">Number</th>
                    <th className="w-16 pb-1 font-semibold">Size</th>
                    <th className="w-24 pb-1 text-right font-semibold">Add-on</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.roster.map((player, index) => (
                    <tr key={player.id} className="border-t border-black/20">
                      <td className="py-1">{index + 1}</td>
                      <td className="py-1">{player.playerName ?? "—"}</td>
                      <td className="py-1">{player.playerNumber ?? "—"}</td>
                      <td className="py-1 font-bold">{player.size}</td>
                      <td className="py-1 text-right">
                        {player.sizeExtraCentavos > 0
                          ? formatPesos(player.sizeExtraCentavos)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-xs">
                No name list &mdash; {entry.quantity} piece
                {entry.quantity === 1 ? "" : "s"}, plain.
              </p>
            )}

            <div className="mt-1 flex justify-between border-t border-black/40 pt-1 text-xs">
              <span>
                {entry.quantity} &times;{" "}
                {formatPesos(entry.line.unitPriceCentavos)}
                {entry.sizeExtrasCentavos > 0
                  ? ` + ${formatPesos(entry.sizeExtrasCentavos)} size add-ons`
                  : ""}
              </span>
              <span className="font-bold">
                {formatPesos(entry.totalCentavos)}
              </span>
            </div>
          </section>
        ))}

        {/* ---- The money ------------------------------------------------ */}
        <section className="mt-6 border-t-2 border-black pt-2 text-sm">
          <Row label="Order total" value={formatPesos(totals.totalCentavos)} bold />
          <Row label="Paid" value={formatPesos(totals.paidCentavos)} />
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
          Dabz Apparel &middot; Bacolod City &middot; Sizes and spellings are as
          written above. Please check before production starts.
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
