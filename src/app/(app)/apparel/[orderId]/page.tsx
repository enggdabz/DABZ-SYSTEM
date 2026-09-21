import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { Card, Notice, TAP_AREA, Tag } from "@/components/ui";
import {
  ORDER_FLOW,
  ORDER_STATUS_LABELS,
  downPaymentAdvice,
  isOpenOrder,
} from "@/lib/apparel";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { paymentKindLabel } from "@/lib/collections";
import {
  getApparelOptions,
  getApparelOrder,
  getApparelProducts,
  getSizePrices,
  getVoidedPayments,
} from "@/lib/data/apparel";
import { getCustomers } from "@/lib/data/pos";
import { MONEY_SOURCE_LABELS } from "@/lib/ledger";
import { formatPesos } from "@/lib/money";
import { formatCivilDate, parseISODate, civilDateToISO, manilaToday } from "@/lib/period";

import {
  AddLineForm,
  OrderDetailsForm,
  PaymentForm,
  RemoveLineForm,
  RemoveRosterEntryForm,
  RosterForm,
  StatusForm,
  VoidPaymentForm,
} from "../ApparelForms";

export const metadata = { title: "Job order · Dabz System" };

function showDate(iso: string | null): string {
  if (!iso) return "not set";
  const date = parseISODate(iso);
  return date ? formatCivilDate(date) : iso;
}

export default async function ApparelOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await connection();

  const user = await requirePermission("apparel_job_orders");
  const canVoid = isOwnerOrAdmin(user);

  const { orderId } = await params;

  const [detail, products, options, sizes, customers, settings, voided] =
    await Promise.all([
      getApparelOrder(orderId),
      getApparelProducts(),
      getApparelOptions(),
      getSizePrices(),
      getCustomers(),
      getSettings(),
      getVoidedPayments(orderId),
    ]);

  if (!detail) notFound();

  const { order, totals, warnings } = detail;
  const today = civilDateToISO(manilaToday());

  const advice = downPaymentAdvice({
    totalCentavos: totals.totalCentavos,
    paidCentavos: totals.paidCentavos,
    percent: settings.apparelDownPaymentPercent,
  });

  const sizesWithoutPrice = sizes
    .filter((size) => size.extraCentavos === null)
    .map((size) => size.size);

  const stepIndex = ORDER_FLOW.indexOf(order.status);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/apparel" className={`text-sm text-muted underline ${TAP_AREA}`}>
          &larr; All job orders
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {order.teamName ?? order.orderNumber}
            </h1>
            <p className="mt-1 text-muted">
              {order.orderNumber} &middot; opened {showDate(order.orderedOn)}
              {order.customerName ? ` · ${order.customerName}` : ""}
            </p>
          </div>
          <Link
            href={`/apparel/${order.id}/sheet`}
            className="rounded-control bg-ink/5 px-4 py-2 text-sm font-medium ring-1 ring-line hover:bg-ink/10"
          >
            Print the job order
          </Link>
        </div>
      </div>

      {warnings.length > 0 ? (
        <Notice
          tone="attention"
          title={warnings.length === 1 ? "One thing to look at" : `${warnings.length} things to look at`}
        >
          <ul className="space-y-1">
            {warnings.map((warning) => (
              <li key={warning.kind}>{warning.label}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {order.status === "cancelled" ? (
        <Notice tone="attention" title="This order was cancelled">
          {order.cancelReason ?? "No reason was recorded."}
        </Notice>
      ) : null}

      {/* ---- Where it is up to ------------------------------------------- */}
      <Card title="Where it is up to">
        <ol className="flex flex-wrap gap-2">
          {ORDER_FLOW.map((step, index) => (
            <li key={step}>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                  index < stepIndex
                    ? "bg-success/10 text-success ring-success/20"
                    : index === stepIndex
                      ? "bg-accent/10 text-accent ring-accent/20"
                      : "bg-ink/5 text-muted ring-line"
                }`}
              >
                {index < stepIndex ? "✓ " : ""}
                {ORDER_STATUS_LABELS[step]}
              </span>
            </li>
          ))}
        </ol>

        {order.layoutNote ? (
          <p className="mt-4 text-sm text-ink/80">
            <span className="font-medium">Layout: </span>
            {order.layoutNote}
          </p>
        ) : null}

        <div className="mt-5 space-y-3">
          {order.status !== "cancelled" ? (
            <StatusForm orderId={order.id} status={order.status} />
          ) : null}
          <OrderDetailsForm
            orderId={order.id}
            teamName={order.teamName}
            customerId={order.customerId}
            promisedOn={order.promisedOn}
            layoutNote={order.layoutNote}
            note={order.note}
            customers={customers
              .filter((customer) => customer.active)
              .map((customer) => ({ id: customer.id, name: customer.name }))}
          />
        </div>

        <p className="mt-4 text-xs text-muted">
          Promised {showDate(order.promisedOn)}
          {order.note ? ` · ${order.note}` : ""}
        </p>
      </Card>

      {/* ---- What is being made ------------------------------------------ */}
      <Card
        title="What is being made"
        description="The total adds up these rows. It is never stored, so it cannot disagree with them."
      >
        {totals.lines.length === 0 ? (
          <Notice tone="info" title="Nothing on the order yet">
            Add the jerseys, shirts or jackets being made.
          </Notice>
        ) : (
          <ul className="space-y-6">
            {totals.lines.map((entry) => (
              <li
                key={entry.line.id}
                className="border-t border-line/60 pt-6 first:border-0 first:pt-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <div>
                    <h3 className="font-semibold">{entry.line.name}</h3>
                    <p className="text-xs text-muted">
                      {entry.line.unitPriceCentavos > 0
                        ? `${formatPesos(entry.line.unitPriceCentavos)} each`
                        : "no price set"}
                      {entry.line.fabric ? ` · ${entry.line.fabric}` : ""}
                      {entry.line.collar ? ` · ${entry.line.collar}` : ""}
                      {` · ${entry.quantity} piece${entry.quantity === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {formatPesos(entry.totalCentavos)}
                    </p>
                    {entry.sizeExtrasCentavos > 0 ? (
                      <p className="text-xs text-muted">
                        includes {formatPesos(entry.sizeExtrasCentavos)} of size
                        add-ons
                      </p>
                    ) : null}
                  </div>
                </div>

                {entry.line.unitPriceCentavos === 0 ? (
                  <p className="mt-2 text-xs text-attention">
                    <span aria-hidden="true">{"⚠"} </span>
                    Nobody has priced this, so it adds nothing to the total.
                  </p>
                ) : null}

                {entry.roster.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[22rem] text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted">
                          <th className="pb-1 pr-3 font-medium">Name</th>
                          <th className="pb-1 pr-3 font-medium">No.</th>
                          <th className="pb-1 pr-3 font-medium">Size</th>
                          <th className="pb-1 pr-3 font-medium">Add-on</th>
                          <th className="pb-1" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/60">
                        {entry.roster.map((player) => (
                          <tr key={player.id}>
                            <td className="py-1.5 pr-3">
                              {player.playerName ?? "—"}
                            </td>
                            <td className="py-1.5 pr-3 text-muted">
                              {player.playerNumber ?? "—"}
                            </td>
                            <td className="py-1.5 pr-3 font-medium">
                              {player.size}
                            </td>
                            <td className="py-1.5 pr-3 text-muted">
                              {player.sizeExtraCentavos > 0
                                ? formatPesos(player.sizeExtraCentavos)
                                : "—"}
                            </td>
                            <td className="py-1.5 text-right">
                              {isOpenOrder(order.status) ? (
                                <RemoveRosterEntryForm
                                  orderId={order.id}
                                  entryId={player.id}
                                />
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {isOpenOrder(order.status) ? (
                  <div className="mt-4 flex flex-wrap items-start gap-3">
                    <RosterForm
                      orderId={order.id}
                      lineId={entry.line.id}
                      sizesWithoutPrice={sizesWithoutPrice}
                    />
                    <RemoveLineForm orderId={order.id} lineId={entry.line.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {isOpenOrder(order.status) ? (
          <div className="mt-6 border-t border-line/60 pt-6">
            <AddLineForm
              orderId={order.id}
              products={products
                .filter((product) => product.active)
                .map((product) => ({
                  id: product.id,
                  name: product.name,
                  basePriceCentavos: product.basePriceCentavos,
                }))}
              fabrics={options
                .filter((option) => option.kind === "fabric" && option.active)
                .map((option) => option.label)}
              collars={options
                .filter((option) => option.kind === "collar" && option.active)
                .map((option) => option.label)}
            />
          </div>
        ) : null}
      </Card>

      {/* ---- Money ------------------------------------------------------- */}
      <Card title="Money">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-muted">Order comes to</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight">
              {formatPesos(totals.totalCentavos)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Paid</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-success">
              {formatPesos(totals.paidCentavos)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Still owed</dt>
            <dd
              className={`mt-1 text-2xl font-semibold tracking-tight ${
                totals.balanceCentavos > 0 ? "text-attention" : ""
              }`}
            >
              {formatPesos(totals.balanceCentavos)}
            </dd>
          </div>
        </dl>

        {totals.overpaid ? (
          <div className="mt-4">
            <Notice
              tone="attention"
              title={`Paid ${formatPesos(totals.overpaidByCentavos)} more than the order comes to`}
            >
              Either something is missing from the order, or the customer is due
              change. Nothing was adjusted on its own.
            </Notice>
          </div>
        ) : null}

        {advice.policyMissing ? (
          <p className="mt-4 text-sm text-muted">
            No down payment policy is set, so nothing is asked for up front.
            {isOwnerOrAdmin(user) ? (
              <>
                {" "}
                <Link href="/settings" className={`underline ${TAP_AREA}`}>
                  Set one in Settings
                </Link>{" "}
                if you want the system to check.
              </>
            ) : null}
          </p>
        ) : advice.short ? (
          <div className="mt-4">
            <Notice
              tone="attention"
              title={`Down payment is ${formatPesos(advice.shortByCentavos)} short`}
            >
              Your policy asks for {settings.apparelDownPaymentPercent}% up
              front, which is {formatPesos(advice.expectedCentavos ?? 0)}.
            </Notice>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Down payment policy of {settings.apparelDownPaymentPercent}% is met.
          </p>
        )}

        {order.status !== "cancelled" ? (
          <div className="mt-5">
            <PaymentForm
              orderId={order.id}
              balanceLabel={formatPesos(totals.balanceCentavos)}
              today={today}
              isFirstPayment={detail.payments.length === 0}
            />
          </div>
        ) : null}

        {detail.payments.length > 0 ? (
          <ul className="mt-6 divide-y divide-line/60 border-t border-line/60">
            {detail.payments.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
              >
                <span>
                  <span className="font-medium">
                    {formatPesos(payment.amountCentavos)}
                  </span>
                  <span className="ml-2 text-xs text-muted">
                    {paymentKindLabel({ paymentKind: payment.kind })}
                    {" · "}
                    {showDate(payment.paidOn)}
                    {" · "}
                    {MONEY_SOURCE_LABELS[
                      payment.source as keyof typeof MONEY_SOURCE_LABELS
                    ] ?? payment.source}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/apparel/${order.id}/payment/${payment.id}/receipt`}
                    className={`text-sm underline ${TAP_AREA}`}
                  >
                    Receipt
                  </Link>
                  {canVoid ? (
                    <VoidPaymentForm orderId={order.id} paymentId={payment.id} />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {voided.length > 0 ? (
          <div className="mt-4 space-y-1">
            {voided.map((payment) => (
              <p key={payment.id} className="text-xs text-muted">
                <Tag>Voided</Tag>{" "}
                <span className="line-through">
                  {formatPesos(payment.amountCentavos)}
                </span>{" "}
                {payment.voidReason ?? ""}
              </p>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
