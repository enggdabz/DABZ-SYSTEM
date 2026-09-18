import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { formatManilaDateTime } from "@/lib/datetime";
import { getSettings, requireUser } from "@/lib/auth/dal";
import { NAV_SECTIONS, visibleSections } from "@/lib/auth/navigation";
import { PERMISSION_INFO, isOwnerOrAdmin, type Permission } from "@/lib/auth/permissions";
import { monthTotals } from "@/lib/bills";
import { getBillPayments, getBills, getOverviewMoney, paidKeysFrom } from "@/lib/data/money";
import { formatPesos } from "@/lib/money";
import { currentPeriod, formatPeriod, manilaToday } from "@/lib/period";
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

  const [money, bills, payments] = await Promise.all([
    getOverviewMoney(),
    getBills(),
    getBillPayments(period),
  ]);

  const billTotals = monthTotals({
    bills,
    paidKeys: paidKeysFrom(payments),
    period,
    today,
  });

  // Payroll is null until staff daily rates exist in Phase 3, so the target
  // covers bills only and says so rather than quietly understating itself.
  const target = computeDailyTarget({
    monthlyBillsCentavos: money.monthlyBillsCentavos,
    monthlyPayrollCentavos: null,
    workingDaysPerMonth: settings.workingDaysPerMonth,
  });

  const progress = targetProgress({
    achievedCentavos: money.todayIncomeCentavos,
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
          {formatPesos(money.todayIncomeCentavos)}
          <span className="text-2xl font-medium text-muted">
            {" "}
            of {formatPesos(target.targetCentavos)}
          </span>
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
          The target is {formatPesos(money.monthlyBillsCentavos)} of monthly
          bills divided by {settings.workingDaysPerMonth} working days.
        </p>

        <div className="mt-4">
          <Notice tone="attention" title="This target is still too low, and today's figure is sales, not profit">
            <p>
              Two things are missing until later phases. Payroll is not in the
              target yet, because staff daily rates arrive in Phase 3 - so the
              real number you need is higher. And the figure above is money in,
              not profit: material costs are not tracked until Phase 5, so
              PHP 5,000 of tarpaulin sales that used PHP 2,000 of vinyl still
              counts as PHP 5,000 here.
            </p>
          </Notice>
        </div>
      </Card>

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
