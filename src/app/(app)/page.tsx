import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { formatManilaDateTime } from "@/lib/datetime";
import { getSettings, requireUser } from "@/lib/auth/dal";
import { NAV_SECTIONS, visibleSections } from "@/lib/auth/navigation";
import { PERMISSION_INFO, isOwnerOrAdmin, type Permission } from "@/lib/auth/permissions";
import { formatPesos } from "@/lib/money";

export const metadata = { title: "Home · Dabz System" };

/**
 * The home screen after signing in.
 *
 * In Phase 2 this becomes the Overview from spec 15.1, with today's target,
 * sales by division and the bills due. For now it confirms who you are, what
 * you may do, and what is coming next.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; password_changed?: string }>;
}) {
  await connection();

  const { denied, password_changed: passwordChanged } = await searchParams;
  const user = await requireUser();
  const settings = await getSettings();

  const myPermissions = (
    Object.keys(PERMISSION_INFO) as Permission[]
  ).filter((permission) =>
    user.role === "staff" ? user.permissions.includes(permission) : true,
  );

  const available = visibleSections(user).filter(
    (section) => !section.comingSoon && section.href !== "/",
  );
  const upcoming = NAV_SECTIONS.filter((section) => section.comingSoon);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-muted">
          {formatManilaDateTime(new Date())}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          Good day, {user.fullName.split(" ")[0]}.
        </h1>
        <p className="mt-2 text-muted">
          You are signed in as <strong>{user.username}</strong> ({user.role}).
        </p>
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
        description={
          user.role === "staff"
            ? "Your owner sets these. Ask them if you need another one."
            : "Owner and admin accounts are not limited by the checkboxes."
        }
      >
        {myPermissions.length === 0 ? (
          <p className="text-sm text-muted">
            No permissions have been ticked for your account yet.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {myPermissions.map((permission) => (
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

      {isOwnerOrAdmin(user) ? (
        <Card
          title="Current limits"
          description="Change these on the Settings screen."
        >
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Working days a month"
              value={String(settings.workingDaysPerMonth)}
            />
            <Stat
              label="Shop hours"
              value={`${settings.workDayStart} – ${settings.workDayEnd}`}
            />
            <Stat
              label="Staff expense limit"
              value={formatPesos(settings.staffExpenseApprovalLimitCentavos)}
            />
            <Stat
              label="Staff discount limit"
              value={`${settings.staffDiscountLimitPercent}% or ${formatPesos(
                settings.staffDiscountLimitCentavos,
              )}`}
            />
          </dl>
        </Card>
      ) : null}

      <Card
        title="Still being built"
        description="These sections appear as each phase is finished."
      >
        <ul className="flex flex-wrap gap-2">
          {upcoming.map((section) => (
            <li key={section.href}>
              <Tag>
                {section.label} &middot; Phase {section.phase}
              </Tag>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tracking-tight">{value}</dd>
    </div>
  );
}
