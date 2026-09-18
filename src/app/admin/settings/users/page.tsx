import type { Metadata } from "next";

import {
  CreateUserForm,
  PermissionToggle,
  ResetPasswordForm,
  StatusToggle,
} from "@/app/admin/settings/users/user-forms";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PERMISSIONS, type AppRole, type Permission } from "@/lib/types/app";

export const metadata: Metadata = { title: "Staff accounts" };

export default async function UsersPage() {
  const actor = await requireRole(["owner", "admin"]);
  const supabase = await createClient();

  const [{ data: profiles }, { data: permissions }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, full_name, role, status, must_change_password, created_at")
      .order("role")
      .order("username"),
    supabase.from("user_permissions").select("user_id, permission"),
  ]);

  const grantedBy = new Map<string, Set<string>>();
  for (const row of permissions ?? []) {
    const set = grantedBy.get(row.user_id) ?? new Set<string>();
    set.add(row.permission);
    grantedBy.set(row.user_id, set);
  }

  const rows = profiles ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Staff accounts"
        description="Create accounts, set what each staff member may do, and reset passwords."
      />

      <div className="space-y-6">
        <Card>
          <CardHeader title="New account" />
          <CreateUserForm actorRole={actor.role} />
        </Card>

        {rows.length === 0 ? (
          <Card>
            <EmptyState message="No accounts yet." />
          </Card>
        ) : (
          rows.map((person) => {
            const granted = grantedBy.get(person.id) ?? new Set<string>();
            const isStaff = person.role === "staff";
            const manageable =
              actor.role === "owner" || (actor.role === "admin" && isStaff);

            return (
              <Card key={person.id}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-3.5">
                  <h3 className="text-sm font-semibold text-fg">{person.full_name}</h3>
                  <span className="text-sm text-fg-muted">{person.username}</span>
                  <Badge tone={person.role === "owner" ? "brand" : "neutral"}>
                    {person.role}
                  </Badge>
                  <Badge tone={person.status === "active" ? "good" : "warn"}>
                    {person.status}
                  </Badge>
                  {person.must_change_password ? (
                    <Badge tone="warn">Password change due</Badge>
                  ) : null}

                  {manageable && person.id !== actor.user.id ? (
                    <div className="ml-auto">
                      <StatusToggle userId={person.id} status={person.status} />
                    </div>
                  ) : (
                    <span className="label-caps ml-auto text-fg-subtle">
                      {person.id === actor.user.id ? "You" : "Read only"}
                    </span>
                  )}
                </div>

                <div className="space-y-5 p-5">
                  {isStaff ? (
                    <div>
                      <p className="label-caps mb-2 text-fg-subtle">Permissions</p>
                      {manageable ? (
                        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {PERMISSIONS.map((permission) => (
                            <li key={permission}>
                              <PermissionToggle
                                userId={person.id}
                                permission={permission as Permission}
                                granted={granted.has(permission)}
                              />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-fg-muted">
                          {granted.size === 0
                            ? "No permissions granted."
                            : [...granted].map((p) => p.replaceAll("_", " ")).join(", ")}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-fg-muted">
                      {(person.role as AppRole) === "owner" ? "Owners" : "Admins"} have
                      full access and are not limited by individual permissions.
                    </p>
                  )}

                  {manageable ? <ResetPasswordForm userId={person.id} /> : null}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
