import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { formatManilaDateTime } from "@/lib/datetime";
import { getSettings, requireUser } from "@/lib/auth/dal";
import { NAV_SECTIONS, visibleSections } from "@/lib/auth/navigation";
import { PERMISSION_INFO, isOwnerOrAdmin, type Permission } from "@/lib/auth/permissions";
import { monthTotals } from "@/lib/bills";
import { getChecklist } from "@/lib/data/checklist";
import { getExpenses, getPayables } from "@/lib/data/expenses";
import { getStockOverview } from "@/lib/data/stocks";
import { getApparelOrders } from "@/lib/data/apparel";
import { isOpenOrder } from "@/lib/apparel";
import { expenseTotals, payableTotals } from "@/lib/expenses";
import { formatQuantity } from "@/lib/quantity";
import { getBillPayments, getBills, getOverviewMoney, paidKeysFrom } from "@/lib/data/money";
import {
  getAdvanceBalances,
  getEstimatedMonthlyPayroll,
  getPayrollWeeks,
  getStaff,
} from "@/lib/data/staff";
import { formatPesos, sumCentavos } from "@/lib/money";
import {
  civilDateToISO,
  currentPeriod,
  formatPeriod,
  formatWeekRange,
  manilaToday,
  startOfWeek,
} from "@/lib/period";
import { computeDailyTarget, targetProgress } from "@/lib/target";

export const metadata = { title: "Overview · Dabz System" };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; password_changed?: string }>;
}) {
  await connection();

  const { denied, password_changed: passwordChanged } = await searchParams;
  const user = await requireUser();
  const settings = await getSettings();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-muted">
          {formatManilaDateTime(new Date())}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          Good day, {user.fullName.split(" ")[0]}.
        </h1>
      </div>

      {denied ? (
        <Notice tone="attention" title="That section is not available to you">
          <p>
            Bills, loans, payroll, staff accounts, settings and full reports are
            for the owner and admins only.
          </p>
        </Notice>
      ) : null}

      {passwordChanged ? (
        <Notice tone="success" title="Your password has been changed">
          <p>Use the new one next time you sign in.</p>
        </Notice>
      ) : null}

      {isOwnerOrAdmin(user) ? <OwnerOverview /> : <StaffHome user={user} />}

      <Card
        title="Still being built"
        description="These sections appear as each phase is finished."
      >
        <ul className="flex flex-wrap gap-2">
          {NAV_SECTIONS.filter((section) => section.comingSoon).map((section) => (
            <li key={section.href}>
              <Tag>
                {section.label} &middot; Phase {section.phase}
              </Tag>
            </li>
          ))}
        </ul>
      </Card>

      {!isOwnerOrAdmin(user) ? null : (
        <p className="text-xs text-muted">
          Working days a month: {settings.workingDaysPerMonth} &middot; Shop hours{" "}
          {settings.workDayStart}&ndash;{settings.workDayEnd} &middot;{" "}
          <Link href="/settings" className="underline">
            Change in Settings
          </Link>
        </p>
      )}
    </div>
  );
}

/** The Overview from spec 15.1, as far as Phase 2 can fill it in. */
async function OwnerOverview() {
  const settings = await getSettings();
  const period = currentPeriod();
  const today = manilaToday();

  const [
    money,
    bills,
    payments,
    payrollEstimate,
    staff,
    balances,
    weeks,
    checklist,
    stock,
    expenses,
    payables,
    apparelOrders,
  ] = await Promise.all([
    getOverviewMoney(),
    getBills(),
    getBillPayments(period),
    getEstimatedMonthlyPayroll(),
    getStaff(),
    getAdvanceBalances(),
    getPayrollWeeks({ limit: 200 }),
    getChecklist(),
    getStockOverview(),
    getExpenses({ limit: 200 }),
    getPayables(),
    getApparelOrders(),
  ]);

  // Job orders that need a person: overdue, promised within days, or released
  // with the money still owed (spec 8).
  const apparelNeedingAttention = apparelOrders.filter(
    (entry) => entry.warnings.length > 0 && entry.order.status !== "cancelled",
  );
  const apparelOpen = apparelOrders.filter((entry) =>
    isOpenOrder(entry.order.status),
  );

  const expenseSummary = expenseTotals(expenses);
  const payableSummary = payableTotals(payables, civilDateToISO(today));

  const billTotals = monthTotals({
    bills,
    paidKeys: paidKeysFrom(payments),
    period,
    today,
  });

  /*
    The target now includes wages, as spec 12.3 asks: each active staff
    member's daily rate times the working days in a month. It stays null while
    nobody has a rate set, so the screen says the target is incomplete rather
    than pretending wages cost nothing.
  */
  const target = computeDailyTarget({
    monthlyBillsCentavos: money.monthlyBillsCentavos,
    monthlyPayrollCentavos: payrollEstimate.centavos,
    workingDaysPerMonth: settings.workingDaysPerMonth,
  });

  const thisWeekStart = startOfWeek(today, settings.weekStartsOn);
  const thisWeeksPayroll = weeks.filter(
    (week) => civilDateToISO(week.weekStart) === civilDateToISO(thisWeekStart),
  );
  const activeStaff = staff.filter((member) => member.status === "active");
  const totalAdvances = sumCentavos(
    activeStaff.map((member) => balances.get(member.id) ?? 0),
  );

  /*
    Measured against PROFIT, not sales, now that expenses are tracked (Phase 5).

    PHP 5,000 of tarpaulin sales that used PHP 2,000 of vinyl has not covered
    PHP 5,000 of bills. Today's materials, fuel and meals come off the takings
    first; today's bills and wages do not, because the target is what pays for
    those - taking them off as well would count them twice.
  */
  const progress = targetProgress({
    achievedCentavos: money.todayTowardTargetCentavos,
    targetCentavos: target.targetCentavos,
  });

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-muted">Today&apos;s target</h2>
          {progress.reached ? (
            <Tag tone="success">{"✓"} Reached</Tag>
          ) : (
            <Tag>{formatPesos(progress.shortfallCentavos)} to go</Tag>
          )}
        </div>

        <p className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          {formatPesos(money.todayTowardTargetCentavos)}
          <span className="text-2xl font-medium text-muted">
            {" "}
            of {formatPesos(target.targetCentavos)}
          </span>
        </p>

        <p className="mt-2 text-sm text-muted">
          {formatPesos(money.todayIncomeCentavos)} taken in
          {money.todayTargetCostsCentavos > 0 ? (
            <>
              {" "}
              less {formatPesos(money.todayTargetCostsCentavos)} spent on
              materials and running costs today
            </>
          ) : (
            " · nothing spent on materials yet today"
          )}
          .
        </p>

        <div
          className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ink/10"
          role="img"
          aria-label={`${progress.percent}% of today's target`}
        >
          <div
            className={`h-full rounded-full ${progress.reached ? "bg-success" : "bg-accent"}`}
            style={{ width: `${progress.percent}%` }}
          />
        </div>

        <p className="mt-4 text-sm text-muted">
          The target is what the shop must CLEAR, after materials:{" "}
          {formatPesos(money.monthlyBillsCentavos)} of monthly bills
          {payrollEstimate.centavos !== null
            ? ` plus ${formatPesos(payrollEstimate.centavos)} of wages`
            : ""}
          , divided by {settings.workingDaysPerMonth} working days.
        </p>

        <div className="mt-4">
          {payrollEstimate.centavos === null ? (
            <Notice
              tone="attention"
              title="This target covers bills only, so it is too low"
            >
              <p>
                No staff daily rates have been set yet, so wages are not in the
                target. Set them on the{" "}
                <Link href="/staff" className="underline">
                  Staff
                </Link>{" "}
                screen and this number will include payroll.
              </p>
            </Notice>
          ) : payrollEstimate.staffWithoutRates > 0 ? (
            <Notice
              tone="attention"
              title={`${payrollEstimate.staffWithoutRates} staff ${payrollEstimate.staffWithoutRates === 1 ? "member has" : "members have"} no daily rate, so the target is still short`}
            >
              <p>
                Wages for {payrollEstimate.staffWithRates} of{" "}
                {payrollEstimate.staffWithRates + payrollEstimate.staffWithoutRates}{" "}
                staff are counted. Set the rest on the{" "}
                <Link href="/staff" className="underline">
                  Staff
                </Link>{" "}
                screen.
              </p>
            </Notice>
          ) : (
            <Notice tone="info" title="Today's figure is sales, not profit yet">
              <p>
                Material costs are not tracked until Phase 5, so PHP 5,000 of
                tarpaulin sales that used PHP 2,000 of vinyl still counts as
                PHP 5,000 here. The target itself now includes bills and wages.
              </p>
            </Notice>
          )}
        </div>
      </Card>

      {checklist.items.length > 0 ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 font-semibold tracking-tight">
                <span aria-hidden="true" className="text-attention">
                  {"\u26a0"}
                </span>
                {checklist.items.length} thing
                {checklist.items.length === 1 ? "" : "s"} still to fill in
              </h2>
              <p className="mt-1 text-sm text-muted">
                Figures only you can know, like bill due days and daily rates.
                The shop runs without them &mdash; fill them in when you can.
              </p>
            </div>
            <Link
              href="/checklist"
              className="shrink-0 rounded-control bg-ink/5 px-4 py-2 text-sm font-medium ring-1 ring-line hover:bg-ink/10"
            >
              See the list
            </Link>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Bills for ${formatPeriod(period)}`}>
          <p className="text-3xl font-semibold tracking-tight">
            {formatPesos(billTotals.paid)}
            <span className="text-lg font-medium text-muted">
              {" "}
              of {formatPesos(billTotals.total)} paid
            </span>
          </p>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Still to pay</dt>
              <dd className="font-medium">{formatPesos(billTotals.unpaid)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Overdue or due within 5 days</dt>
              <dd className="font-medium">
                {billTotals.attentionCount > 0 ? (
                  <span className="text-attention">
                    <span aria-hidden="true">{"⚠"} </span>
                    {billTotals.attentionCount}
                  </span>
                ) : (
                  "None"
                )}
              </dd>
            </div>
            {billTotals.missingDueDayCount > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted">Without a due day yet</dt>
                <dd className="font-medium text-attention">
                  <span aria-hidden="true">{"⚠"} </span>
                  {billTotals.missingDueDayCount}
                </dd>
              </div>
            ) : null}
          </dl>

          <Link href="/bills" className="mt-4 inline-block text-sm underline">
            Open the bills screen
          </Link>
        </Card>

        <Card title="Total still owed">
          <p className="text-3xl font-semibold tracking-tight">
            {formatPesos(money.totalDebtCentavos)}
          </p>

          {money.growingLoans.length > 0 ? (
            <div className="mt-4">
              <Notice
                tone="attention"
                title={`${money.growingLoans.length} loan${money.growingLoans.length === 1 ? "" : "s"} growing`}
              >
                <p>
                  {money.growingLoans.map((summary) => summary.loan.lender).join(", ")}
                  {money.growingLoans.length === 1 ? " is" : " are"} being paid
                  less than the monthly interest, so the balance goes up anyway.
                </p>
              </Notice>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">
              No balance-growing warnings. Note that most loans still have no
              interest rate entered, so there is nothing to check against yet.
            </p>
          )}

          <Link href="/loans" className="mt-4 inline-block text-sm underline">
            Open the loans screen
          </Link>
        </Card>
      </div>

      {activeStaff.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title={`Payroll, week of ${formatWeekRange(thisWeekStart)}`}>
            <p className="text-3xl font-semibold tracking-tight">
              {formatPesos(
                sumCentavos(thisWeeksPayroll.map((week) => week.netCentavos)),
              )}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Active staff</dt>
                <dd className="font-medium">{activeStaff.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Weeks not yet paid</dt>
                <dd className="font-medium">
                  {thisWeeksPayroll.filter((week) => week.status === "draft").length}
                </dd>
              </div>
            </dl>
            <Link href="/payroll" className="mt-4 inline-block text-sm underline">
              Open payroll
            </Link>
          </Card>

          <Card title="Cash advances outstanding">
            <p className="text-3xl font-semibold tracking-tight">
              {formatPesos(totalAdvances)}
            </p>
            <p className="mt-3 text-sm text-muted">
              {totalAdvances > 0
                ? "Taken off payslips when you choose to, on payday."
                : "Nobody owes an advance."}
            </p>
            <Link href="/staff" className="mt-4 inline-block text-sm underline">
              Open staff
            </Link>
          </Card>
        </div>
      ) : null}

      {apparelNeedingAttention.length > 0 ? (
        <Card
          title={`Apparel job orders needing attention (${apparelNeedingAttention.length})`}
        >
          <ul className="space-y-2">
            {apparelNeedingAttention.slice(0, 5).map(({ order, warnings }) => (
              <li
                key={order.id}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <Link
                  href={`/apparel/${order.id}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {order.teamName ?? order.orderNumber}
                </Link>
                <span className="text-attention">
                  <span aria-hidden="true">{"⚠"} </span>
                  {warnings[0].label}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">
            {apparelOpen.length} order{apparelOpen.length === 1 ? "" : "s"} in
            progress.
          </p>
          <Link href="/apparel" className="mt-2 inline-block text-sm underline">
            Open Dabz Apparel
          </Link>
        </Card>
      ) : null}

      {stock.needingAttention.length > 0 ||
      expenseSummary.pendingCount > 0 ||
      payableSummary.unpaidCount > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {stock.needingAttention.length > 0 ? (
            <Card title="Stock needing attention">
              <ul className="space-y-2">
                {stock.needingAttention.slice(0, 5).map((line) => (
                  <li
                    key={line.item.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                  >
                    <span className="font-medium">{line.item.name}</span>
                    <span className="text-attention">
                      <span aria-hidden="true">{"⚠"} </span>
                      {line.status.label}
                      <span className="ml-1 text-muted">
                        ({formatQuantity(line.onHand, line.item.unit)} left)
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {stock.needingAttention.length > 5 ? (
                <p className="mt-3 text-sm text-muted">
                  and {stock.needingAttention.length - 5} more.
                </p>
              ) : null}
              <Link href="/stocks" className="mt-4 inline-block text-sm underline">
                Open stocks
              </Link>
            </Card>
          ) : null}

          {expenseSummary.pendingCount > 0 || payableSummary.unpaidCount > 0 ? (
            <Card title="Money waiting on you">
              <dl className="space-y-3 text-sm">
                {expenseSummary.pendingCount > 0 ? (
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <dt className="text-muted">
                      <span aria-hidden="true">{"⚠"} </span>
                      Expenses waiting for approval
                    </dt>
                    <dd className="font-medium">
                      {formatPesos(expenseSummary.pendingCentavos)} (
                      {expenseSummary.pendingCount})
                    </dd>
                  </div>
                ) : null}
                {payableSummary.unpaidCount > 0 ? (
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <dt className="text-muted">Owed to suppliers</dt>
                    <dd className="font-medium">
                      {formatPesos(payableSummary.unpaidCentavos)} (
                      {payableSummary.unpaidCount})
                    </dd>
                  </div>
                ) : null}
              </dl>
              <div className="mt-4 flex flex-wrap gap-4">
                {expenseSummary.pendingCount > 0 ? (
                  <Link href="/expenses" className="text-sm underline">
                    Open expenses
                  </Link>
                ) : null}
                {payableSummary.unpaidCount > 0 ? (
                  <Link href="/payables" className="text-sm underline">
                    Open what is owed
                  </Link>
                ) : null}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      <Card title={`Money this month (${formatPeriod(period)})`}>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-muted">Income</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-success">
              {formatPesos(money.monthIncomeCentavos)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Money out</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight">
              {formatPesos(money.monthExpensesCentavos)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Difference</dt>
            <dd
              className={`mt-1 text-2xl font-semibold tracking-tight ${
                money.monthIncomeCentavos - money.monthExpensesCentavos < 0
                  ? "text-attention"
                  : ""
              }`}
            >
              {formatPesos(money.monthIncomeCentavos - money.monthExpensesCentavos)}
            </dd>
          </div>
        </dl>

        <Link href="/ledger" className="mt-4 inline-block text-sm underline">
          See every entry
        </Link>
      </Card>
    </>
  );
}

/** Staff see what they may do, and nothing about the shop's money. */
async function StaffHome({
  user,
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
}) {
  const available = visibleSections(user).filter(
    (section) => !section.comingSoon && section.href !== "/",
  );

  return (
    <>
      <Notice tone="info" title="Signing in is not timing in">
        <p>
          The time clock is a separate action and arrives in Phase 3, along with
          payroll.
        </p>
      </Notice>

      {available.length > 0 ? (
        <Card title="What you can open now">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="rounded-control bg-surface-sunken px-4 py-3 text-sm font-medium ring-1 ring-line/60 transition-colors hover:ring-accent/40"
              >
                {section.label}
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      <Card
        title="What you are allowed to do"
        description="Your owner sets these. Ask them if you need another one."
      >
        {user.permissions.length === 0 ? (
          <p className="text-sm text-muted">
            No permissions have been ticked for your account yet.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {user.permissions.map((permission: Permission) => (
              <li key={permission} className="flex items-start gap-2.5 text-sm">
                <span aria-hidden="true" className="mt-0.5 text-success">
                  {"✓"}
                </span>
                <span>
                  <span className="font-medium">{PERMISSION_INFO[permission].label}</span>
                  <span className="block text-muted">
                    {PERMISSION_INFO[permission].description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
