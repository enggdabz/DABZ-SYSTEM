import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PERMISSIONS } from "@/lib/types/app";

export const metadata: Metadata = { title: "My account" };

export default async function PortalPage() {
  const { user, profile, role } = await requireUser();

  const supabase = await createClient();
  const { data: granted } = await supabase
    .from("user_permissions")
    .select("permission")
    .eq("user_id", user.id);

  const grantedSet = new Set((granted ?? []).map((row) => row.permission));
  const bypassesPermissions = role === "owner" || role === "admin";

  const details = [
    { label: "Full name", value: profile.full_name },
    { label: "Username", value: profile.username },
    { label: "Role", value: role },
    { label: "Status", value: profile.status },
  ];

  return (
    <div className="space-y-8">
      {profile.must_change_password ? (
        <p
          role="alert"
          className="rounded-xl border-l-2 border-brand bg-brand-soft px-4 py-3 text-sm text-brand-strong"
        >
          You still need to change your password.
        </p>
      ) : null}

      <section>
        <h2 className="label-caps mb-4 text-fg-subtle">Details</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {details.map((item) => (
            <div
              key={item.label}
              className="relative overflow-hidden rounded-xl border border-line bg-card p-5"
            >
              <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-brand" />
              <dt className="label-caps text-fg-subtle">{item.label}</dt>
              <dd className="mt-2 text-sm font-medium text-fg">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="label-caps mb-4 text-fg-subtle">Permissions</h2>
        {bypassesPermissions ? (
          <p className="rounded-xl border border-line bg-card p-5 text-sm text-fg-muted">
            {role === "owner" ? "Owners" : "Admins"} have full access and are not
            limited by individual permissions.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {PERMISSIONS.map((permission) => {
              const on = grantedSet.has(permission);
              return (
                <li
                  key={permission}
                  className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm"
                >
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-full ${
                      on ? "bg-brand" : "bg-line"
                    }`}
                  />
                  <span className={on ? "text-fg" : "text-fg-subtle"}>
                    {permission.replaceAll("_", " ")}
                  </span>
                  {/* Identity is never colour alone. */}
                  <span className="label-caps ml-auto text-fg-subtle">
                    {on ? "Granted" : "No"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
