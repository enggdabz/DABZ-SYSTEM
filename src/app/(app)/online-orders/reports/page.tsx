import { connection } from "next/server";

import { Card, Notice } from "@/components/ui";
import { getSettings, requireOwnerOrAdmin } from "@/lib/auth/dal";
import { getReportData } from "@/lib/data/online";
import { formatPesos } from "@/lib/money";
import {
  bucketFigures,
  bucketsFor,
  compareTo,
  figuresFor,
  monthToDateRanges,
  parseChartPeriod,
  salesByProduct,
  sharePercentLabel,
  targetMeter,
  type Comparison,
} from "@/lib/online/reports";
import { formatPeriod, manilaToday } from "@/lib/period";

import { OnlineTabs } from "../OnlineTabs";
import { onlineTabs } from "../tabs";
import { BarChart, ColumnChart } from "./Charts";
import { PeriodPicker } from "./PeriodPicker";
import { TargetForm } from "./TargetForm";

export const metadata = { title: "Online shop reports · Dabz System" };

/** ₱20K on an axis, where every centavo would be unreadable. */
function shortPesos(centavos: number): string {
  const pesos = centavos / 100;
  if (pesos >= 1_000_000) return `₱${Math.round(pesos / 100_000) / 10}M`;
  if (pesos >= 1000) return `₱${Math.round(pesos / 1000)}K`;
  return `₱${Math.round(pesos)}`;
}

export default async function OnlineReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await connection();
  await requireOwnerOrAdmin();

  const [params, data, settings] = await Promise.all([
    searchParams,
    getReportData(),
    getSettings(),
  ]);

  const today = manilaToday();
  const period = parseChartPeriod(params.period);

  const { thisMonth, lastMonth } = monthToDateRanges(today);
  const now = figuresFor(data.orders, data.payments, thisMonth);
  const before = figuresFor(data.orders, data.payments, lastMonth);

  const meter = targetMeter(
    now.salesBookedCentavos,
    settings.onlineMonthlyTargetCentavos,
  );

  const buckets = bucketFigures(
    data.orders,
    data.payments,
    bucketsFor(period, today),
  );

  const productLines = salesByProduct(data.orders, thisMonth);
  const productTotal = productLines.reduce((total, line) => total + line.centavos, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Online shop reports</h1>
        <p className="mt-2 text-muted">
          What the shop has booked and what has actually come in. Worked out
          fresh every time this screen is opened, from the orders themselves.
        </p>
      </div>

      <OnlineTabs tabs={onlineTabs(true)} />

      {data.orders.length === 0 ? (
        <Notice tone="info" title="No online orders yet">
          <p>Every figure below is zero because nothing has been ordered.</p>
        </Notice>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">{thisMonth.label}</h2>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="Sales booked"
            value={formatPesos(now.salesBookedCentavos)}
            change={compareTo(
              now.salesBookedCentavos,
              before.salesBookedCentavos,
              lastMonth.label,
            )}
          />
          <Tile
            label="Cash collected"
            value={formatPesos(now.cashCollectedCentavos)}
            change={compareTo(
              now.cashCollectedCentavos,
              before.cashCollectedCentavos,
              lastMonth.label,
            )}
          />
          <Tile
            label="Orders received"
            value={`${now.ordersReceived}`}
            sub={`${now.pieces} piece${now.pieces === 1 ? "" : "s"}`}
            change={compareTo(now.ordersReceived, before.ordersReceived, lastMonth.label)}
          />
          <Tile
            label="Average order"
            value={
              now.averageOrderCentavos === null
                ? "—"
                : formatPesos(now.averageOrderCentavos)
            }
            change={compareTo(
              now.averageOrderCentavos ?? 0,
              before.averageOrderCentavos ?? 0,
              lastMonth.label,
            )}
          />
        </div>
      </section>

      <Card title={`${formatPeriod({ year: today.year, month: today.month })} sales target`}>
        {meter.targetCentavos === null ? (
          <p className="text-sm text-muted">
            No target set, so there is no meter. Set one below and this becomes
            a bar &mdash; leaving it empty is a real answer, and better than a
            target of nothing that would read as already reached.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              {formatPesos(meter.bookedCentavos)} of{" "}
              {formatPesos(meter.targetCentavos)} &middot; {meter.percent}% &middot;{" "}
              {meter.reached
                ? "target reached"
                : `${formatPesos(meter.remainingCentavos ?? 0)} to go`}
            </p>
            <div className="h-3 overflow-hidden rounded-full bg-seg">
              <div
                className="h-full rounded-full bg-ink"
                style={{ width: `${Math.min(100, meter.percent ?? 0)}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-5">
          <TargetForm current={settings.onlineMonthlyTargetCentavos} />
        </div>
      </Card>

      <PeriodPicker current={period} />

      <Card title="Sales and cash collected">
        <ColumnChart
          labels={buckets.map((bucket) => bucket.shortLabel)}
          series={[
            {
              label: "Sales booked",
              tone: "ink",
              values: buckets.map((bucket) => bucket.figures.salesBookedCentavos),
            },
            {
              label: "Cash collected",
              tone: "gold",
              values: buckets.map((bucket) => bucket.figures.cashCollectedCentavos),
            },
          ]}
          format={shortPesos}
          caption="Sales booked counts each order total on the day it was ordered, with cancelled orders left out. Cash collected counts each payment on the day it was received."
        />
      </Card>

      <Card title="Orders received">
        <ColumnChart
          labels={buckets.map((bucket) => bucket.shortLabel)}
          series={[
            {
              label: "Orders",
              tone: "ink",
              values: buckets.map((bucket) => bucket.figures.ordersReceived),
            },
            {
              label: "Pieces",
              tone: "gold",
              values: buckets.map((bucket) => bucket.figures.pieces),
            },
          ]}
          format={(value) => String(Math.round(value))}
        />
      </Card>

      <Card
        title="Sales by product"
        description={`${thisMonth.label}. A quote is shared across the order's unpriced items by pieces.`}
      >
        <BarChart
          rows={productLines.map((line) => ({
            label: line.productName,
            value: line.centavos,
            note: sharePercentLabel(line.centavos, productTotal),
          }))}
        />
        <p className="mt-4 text-xs text-muted">
          The shares may not add up to 100%: they are rounded, and the amounts
          are the truth.
        </p>
      </Card>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  change,
}: {
  label: string;
  value: string;
  sub?: string;
  change: Comparison;
}) {
  return (
    <div className="rounded-card bg-surface p-4 ring-1 ring-line/60">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub ? <p className="text-xs text-muted">{sub}</p> : null}

      {/*
        A percentage against nothing is never given. "Up 100%" from zero is
        meaningless and "up infinity%" is worse, so this says what actually
        happened instead.
      */}
      <p
        className={`mt-2 text-xs ${
          change.direction === "down" ? "text-accent" : "text-muted"
        }`}
      >
        {change.percent === null ? (
          `Nothing to compare with in ${change.against}`
        ) : (
          <>
            <span aria-hidden="true">
              {change.direction === "down" ? "▼" : change.direction === "up" ? "▲" : "="}
            </span>{" "}
            {change.percent > 0 ? "+" : ""}
            {change.percent}% against {change.against}
          </>
        )}
      </p>
    </div>
  );
}
