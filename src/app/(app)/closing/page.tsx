import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { getSettings, requirePermission } from "@/lib/auth/dal";
import { totalMonthlyBills } from "@/lib/bills";
import { computeClosing } from "@/lib/closing";
import { getBills } from "@/lib/data/money";
import { getDayClosing } from "@/lib/data/pos";
import { getEstimatedMonthlyPayroll } from "@/lib/data/staff";
import { formatPesos } from "@/lib/money";
import { formatCivilDate, manilaToday } from "@/lib/period";
import { computeDailyTarget } from "@/lib/target";

import { ClosingForm } from "./ClosingForm";
import { readDayTotals } from "./totals";

export const metadata = { title: "End of day · Dabz System" };

export default async function ClosingPage() {
  await connection();

  await requirePermission("add_sales");
  const settings = await getSettings();
  const today = manilaToday();

  const [totals, bills, payroll, existing] = await Promise.all([
    readDayTotals(today),
    getBills(),
    getEstimatedMonthlyPayroll(),
    getDayClosing(today),
  ]);

  const target = computeDailyTarget({
    monthlyBillsCentavos: totalMonthlyBills(bills),
    monthlyPayrollCentavos: payroll.centavos,
    workingDaysPerMonth: settings.workingDaysPerMonth,
  });

  // Worked out with zero counted, purely to show what the drawer should hold.
  const expected = computeClosing({
    ...totals,
    countedCashCentavos: 0,
    targetCentavos: target.targetCentavos,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">End of day</h1>
        <p className="mt-2 text-muted">{formatCivilDate(today)}</p>
      </div>

      {existing ? (
        <Notice
          tone={existing.differenceCentavos === 0 ? "success" : "attention"}
          title={
            existing.differenceCentavos === 0
              ? "Today is already closed, and the drawer matched"
              : `Today is already closed - the drawer was ${
                  existing.differenceCentavos < 0 ? "short" : "over"
                } by ${formatPesos(Math.abs(existing.differenceCentavos))}`
          }
        >
          <p>
            Counting again below replaces that record, and the change is written
            to Activity.
          </p>
        </Notice>
      ) : null}

      <Card title="What should be in the drawer">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Cash sales today</dt>
            <dd className="font-medium">{formatPesos(totals.cashSalesCentavos)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">
              Paid out of the drawer
              <span className="block text-xs">
                Expenses, cash advances and wages paid in cash
              </span>
            </dt>
            <dd className="font-medium">
              &minus;{formatPesos(totals.cashPaidOutCentavos)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-line/60 pt-2">
            <dt className="font-semibold">Expected in the drawer</dt>
            <dd className="text-2xl font-semibold tracking-tight">
              {formatPesos(expected.expectedCashCentavos)}
            </dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-line/60 pt-5">
          <ClosingForm expectedCashCentavos={expected.expectedCashCentavos} />
        </div>
      </Card>

      <Card title="The rest of today">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="GCash" value={formatPesos(totals.gcashCentavos)} />
          <Figure label="Maya" value={formatPesos(totals.mayaCentavos)} />
          <Figure label="Bank" value={formatPesos(totals.bankCentavos)} />
          <Figure
            label="Total sales"
            value={formatPesos(expected.totalSalesCentavos)}
          />
        </dl>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line/60 pt-5">
          {/*
            A target of zero means nothing has been entered for it to cover,
            not that the day cleared it. Without this the tag would read
            "-PHP 500.00 short", which is worse than saying nothing.
          */}
          {target.targetCentavos <= 0 ? (
            <Tag tone="attention">{"⚠"} No target set</Tag>
          ) : (
            <>
              <span className="text-sm text-muted">
                Target {formatPesos(target.targetCentavos)}
              </span>
              {expected.targetReached ? (
                <Tag tone="success">{"✓"} Target reached</Tag>
              ) : (
                <Tag tone="attention">
                  {"⚠"}{" "}
                  {formatPesos(target.targetCentavos - expected.totalSalesCentavos)} short
                </Tag>
              )}
            </>
          )}
        </div>

        <p className="mt-4 text-xs text-muted">
          {target.targetCentavos <= 0
            ? "There is no daily target until the monthly bills and the staff daily rates are entered, so today is recorded without one."
            : "The target compares against sales, not profit — material costs are not tracked until Phase 5."}
          {payroll.centavos === null && target.targetCentavos > 0
            ? " It also covers bills only, because no staff daily rates are set yet."
            : ""}
        </p>
      </Card>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tracking-tight">{value}</dd>
    </div>
  );
}
