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
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
        My account
      </h1>

      {profile.must_change_password ? (
        <p
          role="alert"
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        >
          You still need to change your password.
        </p>
      ) : null}

      <dl className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-800">
        {details.map((item) => (
          <div key={item.label} className="bg-white p-5 dark:bg-slate-950">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {item.label}
            </dt>
            <dd className="mt-1.5 text-sm text-slate-900 dark:text-white">{item.value}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
          Permissions
        </h2>
        {bypassesPermissions ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {role === "owner" ? "Owners" : "Admins"} have full access and are not limited
            by individual permissions.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {PERMISSIONS.map((permission) => (
              <li
                key={permission}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
              >
                <span
                  aria-hidden
                  className={
                    grantedSet.has(permission)
                      ? "size-2 rounded-full bg-emerald-500"
                      : "size-2 rounded-full bg-slate-300 dark:bg-slate-700"
                  }
                />
                <span className="text-slate-700 dark:text-slate-300">
                  {permission.replaceAll("_", " ")}
                </span>
                <span className="sr-only">
                  {grantedSet.has(permission) ? "granted" : "not granted"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
