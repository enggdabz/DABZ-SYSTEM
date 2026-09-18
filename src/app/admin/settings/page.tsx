import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  {
    href: "/admin/settings/users",
    title: "Staff accounts",
    body: "Create accounts, set permissions, reset passwords.",
  },
  {
    href: "/admin/settings/shop",
    title: "Shop settings",
    body: "Contact details, payroll week, warranty and discount limits.",
  },
  {
    href: "/admin/settings/audit",
    title: "Audit log",
    body: "Who changed what, and when.",
  },
];

export default async function SettingsPage() {
  await requireRole(["owner", "admin"]);

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Settings & users" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-xl border border-line bg-card p-5 transition hover:border-brand"
          >
            <h3 className="text-sm font-semibold text-fg">{section.title}</h3>
            <p className="mt-2 text-sm text-fg-muted">{section.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
