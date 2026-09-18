import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { formatManilaDateTime } from "@/lib/datetime";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Activity · Dabz System" };

/** Plain-language names for the actions stored in the log. */
const ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Changed",
  delete: "Deleted",
  void: "Voided",
  login: "Signed in",
  login_failed: "Failed sign-in",
  logout: "Signed out",
  password_change: "Changed own password",
  password_reset: "Reset a password",
  permission_grant: "Gave permissions",
  permission_revoke: "Took away permissions",
  activate: "Reactivated",
  deactivate: "Deactivated",
};

const OUTCOME_LABELS: Record<string, string> = {
  success: "Signed in",
  wrong_password: "Wrong password",
  unknown_user: "No such username",
  locked_out: "Refused - account locked",
  inactive_account: "Refused - account deactivated",
};

interface AuditRow {
  id: number;
  occurred_at: string;
  actor_username: string | null;
  action: string;
  entity: string;
  summary: string;
  before: unknown;
  after: unknown;
}

interface LoginRow {
  id: number;
  username: string;
  outcome: string;
  occurred_at: string;
  ip_address: string | null;
}

export default async function ActivityPage() {
  await connection();

  await requireOwnerOrAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: auditRows, error: auditError }, { data: loginRows }] =
    await Promise.all([
      supabase
        .from("audit_log")
        .select("id, occurred_at, actor_username, action, entity, summary, before, after")
        .order("occurred_at", { ascending: false })
        .limit(100),
      supabase
        .from("login_events")
        .select("id, username, outcome, occurred_at, ip_address")
        .order("occurred_at", { ascending: false })
        .limit(50),
    ]);

  const audit = (auditRows ?? []) as AuditRow[];
  const logins = (loginRows ?? []) as LoginRow[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-2 text-muted">
          Who did what, and when. Nothing here can be edited or deleted by
          anyone, including you - that is what makes it worth trusting.
        </p>
      </div>

      {auditError ? (
        <Notice tone="attention" title="Could not load the history">
          <p>{auditError.message}</p>
        </Notice>
      ) : null}

      <Card
        title={`History (${audit.length})`}
        description="The 100 most recent entries. From Phase 2 this also covers bills, payroll and every sale."
      >
        {audit.length === 0 ? (
          <p className="text-sm text-muted">Nothing recorded yet.</p>
        ) : (
          <ol className="divide-y divide-line/60">
            {audit.map((row) => (
              <li key={row.id} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <Tag>{ACTION_LABELS[row.action] ?? row.action}</Tag>
                  <span className="text-sm font-medium">{row.summary}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {row.actor_username ?? "system"} &middot;{" "}
                  {formatManilaDateTime(row.occurred_at)} &middot; {row.entity}
                </p>
                {row.before || row.after ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted hover:text-ink">
                      Before and after
                    </summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <ValueBlock label="Before" value={row.before} />
                      <ValueBlock label="After" value={row.after} />
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card
        title={`Sign-ins (${logins.length})`}
        description="Every attempt, successful or not. Five failures in a row locks an account for 15 minutes."
      >
        {logins.length === 0 ? (
          <p className="text-sm text-muted">No sign-in attempts recorded yet.</p>
        ) : (
          <ol className="divide-y divide-line/60">
            {logins.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="text-sm">
                  <span className="font-medium">{row.username}</span>
                  <span className="ml-2 text-muted">
                    {OUTCOME_LABELS[row.outcome] ?? row.outcome}
                  </span>
                </span>
                <span className="text-xs text-muted">
                  {formatManilaDateTime(row.occurred_at)}
                  {row.ip_address ? ` · ${row.ip_address}` : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function ValueBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-control bg-surface-sunken p-3 ring-1 ring-line/60">
      <p className="text-xs font-medium text-muted">{label}</p>
      <pre className="mt-1 overflow-x-auto text-xs text-ink/80">
        {value ? JSON.stringify(value, null, 2) : "—"}
      </pre>
    </div>
  );
}
