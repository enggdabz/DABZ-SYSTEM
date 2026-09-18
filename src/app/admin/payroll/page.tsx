import type { Metadata } from "next";

import {
  AdjustmentsForm, CashAdvanceForm, NewWeekForm, PayWeekForm,
  PayrollDayForm, UnlockWeekForm,
} from "@/app/admin/payroll/payroll-forms";
import {
  Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader,
  StatTile, TBody, Table, Td, Th,
} from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { MONEY_SOURCE_LABEL, humanise, type MoneySource } from "@/lib/domain";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollPage() {
  const { role } = await requireRole(["owner", "admin"]);
  const supabase = await createClient();

  const [{ data: staff }, { data: weeks }, { data: days }, { data: advances }] =
    await Promise.all([
      supabase.from("staff").select("id, full_name, daily_rate_centavos, status").order("full_name"),
      supabase
        .from("payroll_weeks")
        .select("id, staff_id, week_start, daily_rate_centavos, bonus_centavos, advance_deduction_centavos, gross_centavos, net_centavos, status, paid_on, paid_source")
        .order("week_start", { ascending: false })
        .limit(40),
      supabase.from("payroll_days").select("id, payroll_week_id, work_date, day_type, overtime_pay_centavos"),
      supabase
        .from("cash_advances")
        .select("id, staff_id, amount_centavos, advanced_on, source, deduction_plan, reason")
        .order("advanced_on", { ascending: false })
        .limit(30),
    ]);

  const active = (staff ?? []).filter((s) => s.status === "active");
  const nameOf = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
  const daysByWeek = new Map<string, typeof days>();
  for (const day of days ?? []) {
    daysByWeek.set(day.payroll_week_id, [...(daysByWeek.get(day.payroll_week_id) ?? []), day]);
  }

  const drafts = (weeks ?? []).filter((w) => w.status === "draft");
  const unpaid = drafts.reduce((sum, w) => sum + w.net_centavos, 0);
  const advanceTotal = (advances ?? []).reduce((sum, a) => sum + a.amount_centavos, 0);

  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Payroll"
        description="Weeks stay editable until they are paid."
        actions={
          <>
            <ButtonLink href="/admin/payroll/staff" variant="secondary">Staff</ButtonLink>
            <ButtonLink href="/admin/payroll/attendance" variant="secondary">Attendance</ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Active staff" value={active.length} />
        <StatTile label="Draft weeks owing" value={formatCentavos(unpaid)} />
        <StatTile label="Advances (recent)" value={formatCentavos(advanceTotal)} />
      </div>

      {active.length === 0 ? (
        <Card className="mb-6">
          <EmptyState
            message="No active staff yet."
            hint="Add staff records before drafting a payroll week."
          />
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <CardHeader title="Start a payroll week" />
            <NewWeekForm staff={active} />
          </Card>

          <Card className="mb-6">
            <CardHeader title="Give a cash advance" />
            <CashAdvanceForm staff={active} />
          </Card>
        </>
      )}

      {(weeks ?? []).length === 0 ? (
        <Card><EmptyState message="No payroll weeks yet." /></Card>
      ) : (
        (weeks ?? []).map((week) => {
          const weekDays = daysByWeek.get(week.id) ?? [];
          const isDraft = week.status === "draft";
          return (
            <Card key={week.id} className="mb-6">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-5 py-3.5">
                <h3 className="text-sm font-semibold text-fg">
                  {nameOf.get(week.staff_id) ?? "Staff"}
                </h3>
                <span className="text-xs text-fg-subtle">week of {week.week_start}</span>
                <Badge tone={isDraft ? "warn" : "good"}>{humanise(week.status)}</Badge>
                <span className="ml-auto text-sm tabular-nums text-fg">
                  Net {formatCentavos(week.net_centavos)}
                </span>
              </div>

              <div className="grid gap-px bg-line sm:grid-cols-4">
                <div className="bg-card p-4">
                  <p className="label-caps text-fg-subtle">Daily rate</p>
                  <p className="mt-1 text-sm tabular-nums text-fg">{formatCentavos(week.daily_rate_centavos)}</p>
                </div>
                <div className="bg-card p-4">
                  <p className="label-caps text-fg-subtle">Gross</p>
                  <p className="mt-1 text-sm tabular-nums text-fg">{formatCentavos(week.gross_centavos)}</p>
                </div>
                <div className="bg-card p-4">
                  <p className="label-caps text-fg-subtle">Bonus</p>
                  <p className="mt-1 text-sm tabular-nums text-fg">{formatCentavos(week.bonus_centavos ?? 0)}</p>
                </div>
                <div className="bg-card p-4">
                  <p className="label-caps text-fg-subtle">Advance deducted</p>
                  <p className="mt-1 text-sm tabular-nums text-fg">{formatCentavos(week.advance_deduction_centavos ?? 0)}</p>
                </div>
              </div>

              {weekDays.length > 0 ? (
                <Table>
                  <thead>
                    <tr><Th>Date</Th><Th>Day</Th><Th numeric>Overtime pay</Th></tr>
                  </thead>
                  <TBody>
                    {weekDays.map((day) => (
                      <tr key={day.id}>
                        <Td muted>{day.work_date}</Td>
                        <Td>{humanise(day.day_type)}</Td>
                        <Td numeric muted>{formatCentavos(day.overtime_pay_centavos ?? 0)}</Td>
                      </tr>
                    ))}
                  </TBody>
                </Table>
              ) : null}

              <div className="space-y-3 border-t border-line p-5">
                {isDraft ? (
                  <>
                    <PayrollDayForm weekId={week.id} date={week.week_start} />
                    <AdjustmentsForm
                      weekId={week.id}
                      bonus={((week.bonus_centavos ?? 0) / 100).toFixed(2)}
                      deduction={((week.advance_deduction_centavos ?? 0) / 100).toFixed(2)}
                    />
                    <PayWeekForm weekId={week.id} />
                  </>
                ) : (
                  <>
                    <p className="text-sm text-fg-muted">
                      Paid {week.paid_on} from{" "}
                      {MONEY_SOURCE_LABEL[week.paid_source as MoneySource] ?? week.paid_source}.
                    </p>
                    {role === "owner" ? <UnlockWeekForm weekId={week.id} /> : null}
                  </>
                )}
              </div>
            </Card>
          );
        })
      )}

      {(advances ?? []).length > 0 ? (
        <Card>
          <CardHeader title="Recent cash advances" />
          <Table>
            <thead>
              <tr><Th>Date</Th><Th>Staff</Th><Th numeric>Amount</Th><Th>From</Th><Th>Plan</Th></tr>
            </thead>
            <TBody>
              {(advances ?? []).map((advance) => (
                <tr key={advance.id}>
                  <Td muted>{advance.advanced_on}</Td>
                  <Td>{nameOf.get(advance.staff_id) ?? "—"}</Td>
                  <Td numeric>{formatCentavos(advance.amount_centavos)}</Td>
                  <Td muted>{MONEY_SOURCE_LABEL[advance.source as MoneySource] ?? advance.source}</Td>
                  <Td muted>{humanise(advance.deduction_plan)}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
