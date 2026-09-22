import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DeleteButton } from "@/components/DeleteButton";
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
  getApparelOrderHasHistory,
  getApparelProducts,
  getSizePrices,
  getVoidedPayments,
} from "@/lib/data/apparel";
import { getCustomers } from "@/lib/data/pos";
import { getProductionSteps, productionFor } from "@/lib/data/production";
import { MONEY_SOURCE_LABELS } from "@/lib/ledger";
import { formatPesos } from "@/lib/money";
import { projectStatusLabel } from "@/lib/production";
import { formatCivilDate, parseISODate, civilDateToISO, manilaToday } from "@/lib/period";
import {
  APPAREL_SIZES,
  UNIFORM_TYPES,
  type ApparelSize,
  type UniformType,
} from "@/lib/uniforms";

import { deleteApparelOrderAction } from "../actions";
import { EncodingTable } from "../EncodingTable";
import {
  CancelProjectForm,
  ItemFabricForm,
  OrderDetailsForm,
  PaymentForm,
  RemoveLineForm,
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

  const [
    detail,
    products,
    options,
    sizes,
    customers,
    settings,
    voided,
    marks,
    orderHasHistory,
  ] = await Promise.all([
    getApparelOrder(orderId),
    getApparelProducts(),
    getApparelOptions(),
    getSizePrices(),
    getCustomers(),
    getSettings(),
    getVoidedPayments(orderId),
    getProductionSteps(),
    // Null to anyone who is not Owner/Admin, and null when it could not be
    // asked. Both mean "do not offer the button" - see below.
    getApparelOrderHasHistory(orderId),
  ]);

  if (!detail) notFound();

  const { order, totals, warnings } = detail;
  const today = civilDateToISO(manilaToday());

  const advice = downPaymentAdvice({
    totalCentavos: totals.totalCentavos,
    paidCentavos: totals.paidCentavos,
    percent: settings.apparelDownPaymentPercent,
  });

  const stepIndex = ORDER_FLOW.indexOf(order.status);

  /*
    Where the shop floor says the work has got to, which is a different
    question from the step above: that one is the order's own journey through
    the counter, this one is its items' journey through the benches. Both are
    shown, and neither is derived from the other - see src/lib/production.ts.
  */
  const production = productionFor(detail, marks.steps);

  /*
    What the encoding table needs to pre-fill a price: the price list tagged by
    uniform type, and what each size adds. Where the owner has tagged nothing,
    the entry is NULL and the table asks for the price instead of inventing
    one.
  */
  const priceByType: Partial<Record<UniformType, number | null>> = {};
  for (const type of UNIFORM_TYPES) {
    const tagged = products.find(
      (product) => product.active && product.uniformType === type,
    );
    priceByType[type] = tagged?.basePriceCentavos ?? null;
  }

  const sizeExtras: Partial<Record<ApparelSize, number | null>> = {};
  for (const size of APPAREL_SIZES) {
    sizeExtras[size] = sizes.find((entry) => entry.size === size)?.extraCentavos ?? null;
  }

  const itemPriceByLine = Object.fromEntries(
    detail.lines.map((line) => [line.id, line.unitPriceCentavos]),
  );

  // Items with nobody encoded on them: a plain block written before Phase 13.
  const unencoded = totals.lines
    .filter((entry) => !entry.retired && entry.roster.length === 0)
    .map((entry) => ({
      lineId: entry.line.id,
      name: entry.line.name,
      quantity: entry.quantity,
    }));

  const customer = customers.find((entry) => entry.id === order.customerId);
  const untaggedTypes = UNIFORM_TYPES.filter((type) => priceByType[type] == null);

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

      {/* ---- The payment record, at the top where the owner asked for it -- */}
      <Card title="The payment record">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Project total" value={formatPesos(totals.totalCentavos)} />
          <Figure
            label="Down payment"
            value={formatPesos(totals.downPaymentCentavos)}
            tone={totals.downPaymentCentavos > 0 ? "success" : undefined}
          />
          <Figure
            label="Other payments"
            value={formatPesos(totals.otherPaymentsCentavos)}
            tone={totals.otherPaymentsCentavos > 0 ? "success" : undefined}
          />
          <Figure
            label="Balance"
            value={formatPesos(totals.balanceCentavos)}
            tone={totals.balanceCentavos > 0 ? "attention" : undefined}
          />
        </dl>
        <p className="mt-3 text-xs text-muted">
          The total adds up the rows below and the balance is the total less what
          has been paid. Neither is stored, so neither can disagree with them.
        </p>
      </Card>

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

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line/60 pt-4 text-sm">
          <span className="font-medium">On the bench:</span>
          {marks.failed ? (
            <span className="text-attention">
              <span aria-hidden="true">{"⚠"} </span>
              not known &mdash; the benches could not be read
            </span>
          ) : (
            <>
              <Tag
                tone={
                  production.complete
                    ? "success"
                    : production.noItems || production.stage === null
                      ? "neutral"
                      : "accent"
                }
              >
                {projectStatusLabel(production)}
              </Tag>
              <span className="text-muted">
                {production.noItems
                  ? "nothing being made yet"
                  : `${production.marksDone} of ${production.marksTotal} benches marked`}
              </span>
            </>
          )}
          <Link
            href={`/production/${order.id}`}
            className={`underline underline-offset-2 ${TAP_AREA}`}
          >
            Open the production report
          </Link>
        </div>

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
            contact={{
              contactPerson: order.contactPerson,
              contactNumber: order.contactNumber,
              address: order.address,
              facebookLink: order.facebookLink,
            }}
            customers={customers
              .filter((customer) => customer.active)
              .map((entry) => ({ id: entry.id, name: entry.name }))}
          />
        </div>

        <p className="mt-4 text-xs text-muted">
          Promised {showDate(order.promisedOn)}
          {order.note ? ` · ${order.note}` : ""}
        </p>
      </Card>

      {/* ---- Who to contact ---------------------------------------------- */}
      <Card
        title="Who to contact"
        description="This project's own details. Anything left empty stays empty."
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail
            label="Contact person"
            value={order.contactPerson}
            fallback={customer?.name ?? null}
          />
          <Detail
            label="Contact number"
            value={order.contactNumber}
            fallback={customer?.contactNumber ?? null}
          />
          <Detail
            label="Address"
            value={order.address}
            fallback={customer?.address ?? null}
          />
          <Detail
            label="Facebook"
            value={order.facebookLink}
            fallback={customer?.facebookName ?? null}
            link={order.facebookLink}
          />
        </dl>
      </Card>

      {/* ---- The people, one row each ------------------------------------ */}
      <Card
        title="The people on this project"
        description="One row per person: their uniform, name, number, sizes, price and remarks. Typing is not saving - press Save when the table is right."
      >
        {untaggedTypes.length > 0 && isOwnerOrAdmin(user) ? (
          <div className="mb-5">
            <Notice
              tone="info"
              title={`${untaggedTypes.length} of the six uniform types has no price to pre-fill from`}
            >
              Tag an item on the{" "}
              <Link href="/apparel/prices" className={`underline ${TAP_AREA}`}>
                apparel price list
              </Link>{" "}
              with its uniform type and the price box fills itself in. Until
              then the price is typed by hand, which still works - nothing is
              guessed either way.
            </Notice>
          </div>
        ) : null}

        <EncodingTable
          orderId={order.id}
          rows={detail.roster}
          itemPriceByLine={itemPriceByLine}
          priceByType={priceByType}
          sizeExtras={sizeExtras}
          unencoded={unencoded}
          readOnly={order.status === "cancelled"}
        />
      </Card>

      {/* ---- What is being made ------------------------------------------ */}
      <Card
        title="What is being made"
        description="One item per uniform type, made by the table above. The fabric and the collar are chosen here, because one design is cut from one cloth."
      >
        {totals.lines.length === 0 ? (
          <Notice tone="info" title="Nothing on the project yet">
            Encode the people above and the items appear by themselves.
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
                    <h3 className="font-semibold">
                      {entry.line.name}
                      {entry.retired ? <span className="ml-2"><Tag>Retired</Tag></span> : null}
                    </h3>
                    <p className="text-xs text-muted">
                      {entry.line.fabric ? `${entry.line.fabric}` : "no fabric set"}
                      {entry.line.collar ? ` · ${entry.line.collar}` : ""}
                      {` · ${entry.quantity} piece${entry.quantity === 1 ? "" : "s"}`}
                      {entry.line.unitPriceCentavos > 0
                        ? ` · ${formatPesos(entry.line.unitPriceCentavos)} each where a row has no price of its own`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatPesos(entry.totalCentavos)}</p>
                    {entry.sizeExtrasCentavos > 0 ? (
                      <p className="text-xs text-muted">
                        includes {formatPesos(entry.sizeExtrasCentavos)} of size
                        add-ons
                      </p>
                    ) : null}
                  </div>
                </div>

                {entry.retired ? (
                  <p className="mt-2 text-xs text-muted">
                    Nobody is left on this item - its people were re-encoded
                    under other items. It is kept because the shop floor marked
                    its benches, and it adds nothing to the project total.
                  </p>
                ) : null}

                {entry.line.uniformType === null && !entry.retired ? (
                  <p className="mt-2 text-xs text-attention">
                    <span aria-hidden="true">{"⚠"} </span>
                    No type of uniform recorded, because this item was written
                    before the table above existed. Set the type on its rows and
                    it joins the summary.
                  </p>
                ) : null}

                {entry.piecesWithoutPrice > 0 ? (
                  <p className="mt-2 text-xs text-attention">
                    <span aria-hidden="true">{"⚠"} </span>
                    {entry.piecesWithoutPrice} piece
                    {entry.piecesWithoutPrice === 1 ? "" : "s"} nobody has
                    priced, so {entry.piecesWithoutPrice === 1 ? "it adds" : "they add"}{" "}
                    nothing to the total.
                  </p>
                ) : null}

                {isOpenOrder(order.status) ? (
                  <div className="mt-4 flex flex-wrap items-start gap-3">
                    <ItemFabricForm
                      orderId={order.id}
                      lineId={entry.line.id}
                      itemName={entry.line.name}
                      fabric={entry.line.fabric}
                      collar={entry.line.collar}
                      fabrics={options
                        .filter((option) => option.kind === "fabric" && option.active)
                        .map((option) => option.label)}
                      collars={options
                        .filter((option) => option.kind === "collar" && option.active)
                        .map((option) => option.label)}
                    />
                    {entry.roster.length === 0 ? (
                      <RemoveLineForm orderId={order.id} lineId={entry.line.id} />
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---- Money ------------------------------------------------------- */}
      <Card title="Money">
        {totals.overpaid ? (
          <div className="mb-4">
            <Notice
              tone="attention"
              title={`Paid ${formatPesos(totals.overpaidByCentavos)} more than the project comes to`}
            >
              Either something is missing from the project, or the customer is
              due change. Nothing was adjusted on its own.
            </Notice>
          </div>
        ) : null}

        {advice.policyMissing ? (
          <p className="text-sm text-muted">
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
          <Notice
            tone="attention"
            title={`Down payment is ${formatPesos(advice.shortByCentavos)} short`}
          >
            Your policy asks for {settings.apparelDownPaymentPercent}% up front,
            which is {formatPesos(advice.expectedCentavos ?? 0)}.
          </Notice>
        ) : (
          <p className="text-sm text-muted">
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

      {/* ---- Deleting the whole project ----------------------------------- */}
      {/*
        Last on the screen, and Owner/Admin only. A project written by mistake
        has to be removable - "cancelled" is the right answer for a job that
        fell through and an odd one for a typo five seconds old, which would
        then sit on the list for ever. The rule is the one the rest of the
        catalogue follows: delete only where nothing has happened. `0021` is
        what actually enforces it.

        The card is shown even when the project CANNOT be deleted, because
        DeleteButton answers with the reason instead of the button. A missing
        button teaches nothing; a sentence naming what stops it teaches the
        rule once.
      */}
      {isOwnerOrAdmin(user) ? (
        <Card
          title="Delete this project"
          description="Only while nothing has happened to it. Once money has been taken, a bench marked, or the jerseys released, it is cancelled with a reason instead."
        >
          {orderHasHistory === null ? (
            <p className="text-sm text-attention">
              <span aria-hidden="true">{"⚠"} </span>
              Whether anything has happened to this project could not be
              checked, so deleting it is not offered &mdash; the system will not
              guess about money. Try again in a moment; if it keeps saying this,
              run <span className="font-mono">npm run db:push</span>.
            </p>
          ) : (
            <DeleteButton
              kind="apparel project"
              name={order.orderNumber}
              idField="orderId"
              id={order.id}
              hasHistory={orderHasHistory}
              /*
                When it cannot be deleted, the refusal says to cancel it
                instead - so the button that cancels it is right there. Not
                offered on a released or already-cancelled project, where
                cancelling is correctly impossible and a button that refuses
                would be worse than none.
              */
              alternative={
                order.status === "cancelled" || order.status === "released" ? null : (
                  <CancelProjectForm
                    orderId={order.id}
                    openLabel="Cancel this project instead"
                  />
                )
              }
              action={deleteApparelOrderAction}
              consequence={
                detail.roster.length > 0 || totals.lines.length > 0
                  ? `${detail.roster.length} ${
                      detail.roster.length === 1 ? "person" : "people"
                    } and ${totals.lines.length} item${
                      totals.lines.length === 1 ? "" : "s"
                    } go with it. The whole project is written to Activity first, and that is the only record of it afterwards.`
                  : "Nothing is encoded on it, so nothing goes with it. It is written to Activity first all the same."
              }
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "attention";
}) {
  const colour =
    tone === "success" ? "text-success" : tone === "attention" ? "text-attention" : "";
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tracking-tight ${colour}`}>{value}</dd>
    </div>
  );
}

/**
 * One contact detail.
 *
 * Where the project has none of its own, the linked customer's is SHOWN and
 * labelled as coming from there - never copied in. Copying would quietly
 * freeze a customer's address on to a project, or worse, write a project's
 * address back on to the customer.
 */
function Detail({
  label,
  value,
  fallback,
  link,
}: {
  label: string;
  value: string | null;
  fallback: string | null;
  link?: string | null;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-sm break-words">
        {value ? (
          link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer noopener"
              className={`underline ${TAP_AREA}`}
            >
              {value}
            </a>
          ) : (
            value
          )
        ) : fallback ? (
          <span className="text-muted">
            {fallback}{" "}
            <span className="text-xs">(from the customer record)</span>
          </span>
        ) : (
          <span className="text-muted">not given</span>
        )}
      </dd>
    </div>
  );
}
