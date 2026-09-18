import type { Metadata } from "next";

import { DecideExpenseForm, RecordExpenseForm } from "@/app/admin/expenses/expense-forms";
import {
  Alert, Badge, ButtonLink, Card, CardHeader, EmptyState,
  PageHeader, StatTile, TBody, Table, Td, Th,
} from "@/components/ui";
import { hasPermission, requireUser } from "@/lib/auth";
import { MONEY_SOURCE_LABEL, TAG_LABEL, humanise, type MoneySource, type Tag } from "@/lib/domain";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage() {
  const { role } = await requireUser();
  const isManager = role === "owner" || role === "admin";
  const canRecord = await hasPermission("record_expenses");

  const supabase = await createClient();
  const [{ data: expenses }, { data: suppliers }, { data: presets }, { data: settings }] =
    await Promise.all([
      supabase
        .from("expenses")
        .select("id, spent_on, amount_centavos, category, tag, source, status, note, decision_note")
        .order("spent_on", { ascending: false })
        .limit(100),
      supabase.from("suppliers").select("id, name").eq("active", true).order("name"),
      supabase
        .from("expense_presets")
        .select("id, label, category, tag, default_amount_centavos")
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("app_settings")
        .select("staff_expense_approval_limit_centavos")
        .eq("id", 1)
        .maybeSingle(),
    ]);

  const rows = expenses ?? [];
  const pending = rows.filter((e) => e.status === "pending");
  const approved = rows.filter((e) => e.status === "approved");
  const spent = approved.reduce((sum, e) => sum + e.amount_centavos, 0);
  const limit = settings?.staff_expense_approval_limit_centavos ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Money out"
        title="Expenses"
        description={
          isManager
            ? "Anything you record is approved straight away."
            : `Expenses above ${formatCentavos(limit)} wait for the owner.`
        }
        actions={
          isManager ? (
            <>
              <ButtonLink href="/admin/expenses/bills" variant="secondary">Bills</ButtonLink>
              <ButtonLink href="/admin/expenses/loans" variant="secondary">Loans</ButtonLink>
            </>
          ) : null
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Approved (shown)" value={formatCentavos(spent)} />
        <StatTile label="Awaiting approval" value={pending.length} />
        <StatTile label="Records shown" value={rows.length} />
      </div>

      {canRecord ? (
        <Card className="mb-6">
          <CardHeader title="Record an expense" />
          <RecordExpenseForm
            suppliers={suppliers ?? []}
            presets={(presets ?? []).map((preset) => ({
              ...preset,
              default_amount_centavos: preset.default_amount_centavos ?? 0,
            }))}
          />
        </Card>
      ) : (
        <div className="mb-6">
          <Alert>You do not have permission to record expenses.</Alert>
        </div>
      )}

      {isManager && pending.length > 0 ? (
        <Card className="mb-6">
          <CardHeader title="Awaiting approval" />
          <ul className="divide-y divide-line">
            {pending.map((expense) => (
              <li key={expense.id} className="space-y-2 px-5 py-4">
                <p className="text-sm text-fg">
                  <span className="font-medium">{formatCentavos(expense.amount_centavos)}</span>
                  {" · "}{humanise(expense.category)}
                  {" · "}{TAG_LABEL[expense.tag as Tag] ?? expense.tag}
                  {expense.note ? ` — ${expense.note}` : ""}
                </p>
                <DecideExpenseForm expenseId={expense.id} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Recent expenses" />
        {rows.length === 0 ? (
          <EmptyState message="No expenses recorded yet." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th><Th numeric>Amount</Th><Th>Category</Th>
                <Th>Tag</Th><Th>From</Th><Th>Status</Th>
              </tr>
            </thead>
            <TBody>
              {rows.map((expense) => (
                <tr key={expense.id}>
                  <Td muted>{expense.spent_on}</Td>
                  <Td numeric>{formatCentavos(expense.amount_centavos)}</Td>
                  <Td muted>{humanise(expense.category)}</Td>
                  <Td muted>{TAG_LABEL[expense.tag as Tag] ?? expense.tag}</Td>
                  <Td muted>{MONEY_SOURCE_LABEL[expense.source as MoneySource] ?? expense.source}</Td>
                  <Td>
                    <Badge
                      tone={
                        expense.status === "approved" ? "good"
                        : expense.status === "pending" ? "warn" : "bad"
                      }
                    >
                      {humanise(expense.status)}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
