import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { formatManilaDate } from "@/lib/datetime";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import {
  PERMISSION_INFO,
  assignableRoles,
  canEditAccount,
  type Permission,
  type Role,
} from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  CreateAccountForm,
  PermissionsForm,
  RenameForm,
  ResetPasswordForm,
  StatusForm,
} from "./StaffForms";

export const metadata = { title: "Staff · Dabz System" };

interface AccountRow {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  status: "active" | "inactive";
  must_change_password: boolean;
  created_at: string;
}

export default async function StaffPage() {
  await connection();

  // Owner/Admin only, and never grantable to staff (spec 4.3).
  const actor = await requireOwnerOrAdmin();
  const supabase = await createSupabaseServerClient();

  // Read with the ordinary client so Row Level Security still applies - if the
  // policies were wrong, this screen would come back empty rather than leaking.
  const { data: accounts, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, role, status, must_change_password, created_at")
    .order("role")
    .order("username");

  const { data: permissionRows } = await supabase
    .from("user_permissions")
    .select("user_id, permission");

  const permissionsByUser = new Map<string, Permission[]>();
  for (const row of permissionRows ?? []) {
    const list = permissionsByUser.get(row.user_id) ?? [];
    list.push(row.permission as Permission);
    permissionsByUser.set(row.user_id, list);
  }

  const rows = (accounts ?? []) as AccountRow[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Accounts</h1>
        <p className="mt-2 text-muted">
          Who can sign in, and what each person is allowed to do. There is no
          public sign-up: every account is created here. Wages and employment
          details live on the <a className="underline" href="/staff">Staff</a>{" "}
          screen.
        </p>
      </div>

      {error ? (
        <Notice tone="attention" title="Could not load the accounts">
          <p>{error.message}</p>
        </Notice>
      ) : null}

      <Card
        title="Add an account"
        description="They get a temporary password, shown once, which they must change when they first sign in."
      >
        <CreateAccountForm assignable={assignableRoles(actor)} />
      </Card>

      <section className="space-y-5">
        <h2 className="text-xl font-semibold tracking-tight">
          Accounts ({rows.length})
        </h2>

        {rows.map((account) => {
          const editable = canEditAccount(actor, { role: account.role });
          const granted = permissionsByUser.get(account.id) ?? [];

          return (
            <Card key={account.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">
                    {account.full_name}
                  </h3>
                  <p className="text-sm text-muted">
                    {account.username} &middot; added{" "}
                    {formatManilaDate(account.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone={account.role === "staff" ? "neutral" : "accent"}>
                    {account.role === "owner"
                      ? "Owner"
                      : account.role === "admin"
                        ? "Admin"
                        : "Staff"}
                  </Tag>
                  <Tag tone={account.status === "active" ? "success" : "attention"}>
                    {account.status === "active" ? "Active" : "Deactivated"}
                  </Tag>
                  {account.must_change_password ? (
                    <Tag tone="attention">{"⚠"} Temporary password</Tag>
                  ) : null}
                  {account.id === actor.id ? <Tag>This is you</Tag> : null}
                </div>
              </div>

              {!editable ? (
                <p className="mt-5 text-sm text-muted">
                  {account.role === "owner"
                    ? "The owner account can only be changed by the owner."
                    : "Only the owner can change another admin's account."}
                </p>
              ) : (
                <div className="mt-6 grid gap-8 lg:grid-cols-2">
                  <div className="space-y-6">
                    <RenameForm userId={account.id} fullName={account.full_name} />
                    <ResetPasswordForm
                      userId={account.id}
                      username={account.username}
                    />
                    {account.role === "owner" || account.id === actor.id ? null : (
                      <StatusForm
                        userId={account.id}
                        username={account.username}
                        status={account.status}
                      />
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-medium">Allowed to</h4>
                    <div className="mt-3">
                      {account.role === "staff" ? (
                        <PermissionsForm userId={account.id} granted={granted} />
                      ) : (
                        <p className="text-sm text-muted">
                          {account.role === "owner" ? "Owners" : "Admins"} are not
                          limited by the checkboxes. They can open everything
                          except what only the owner may do.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </section>

      <Card
        title="What only the owner and admins can open"
        description="These can never be handed to a staff account, whatever the checkboxes say (spec 4.3)."
      >
        <ul className="grid gap-1.5 text-sm text-muted sm:grid-cols-2">
          <li>Bills and loans</li>
          <li>Salaries and payroll</li>
          <li>Adding and editing accounts</li>
          <li>Approving voids and refunds</li>
          <li>Owner withdrawals</li>
          <li>Full reports</li>
          <li>Settings</li>
        </ul>
      </Card>

      <Card title="The permission checkboxes">
        <dl className="space-y-3 text-sm">
          {(Object.keys(PERMISSION_INFO) as Permission[]).map((permission) => (
            <div key={permission}>
              <dt className="font-medium">{PERMISSION_INFO[permission].label}</dt>
              <dd className="text-muted">{PERMISSION_INFO[permission].description}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
