import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { getAccountOptions, getAdvanceBalances, getStaff } from "@/lib/data/staff";
import { DIVISIONS, type DivisionId } from "@/lib/divisions";
import { formatPesos, sumCentavos } from "@/lib/money";
import { civilDateToISO, formatCivilDate, manilaToday } from "@/lib/period";

import {
  CashAdvanceForm,
  LinkAccountForm,
  StaffForm,
  StaffStatusForm,
} from "./StaffMemberForms";

export const metadata = { title: "Staff · Dabz System" };

export default async function StaffPage() {
  await connection();

  await requireOwnerOrAdmin();

  const [staff, balances, accounts] = await Promise.all([
    getStaff(),
    getAdvanceBalances(),
    getAccountOptions(),
  ]);

  const active = staff.filter((member) => member.status === "active");
  const inactive = staff.filter((member) => member.status !== "active");
  const missingRates = active.filter((member) => member.dailyRateCentavos === null);
  const today = civilDateToISO(manilaToday());

  const totalOutstandingAdvances = sumCentavos(
    active.map((member) => balances.get(member.id) ?? 0),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Staff</h1>
        <p className="mt-2 text-muted">
          The people the shop employs and pays. A login is optional &mdash;
          someone who only taps the time clock does not need one. Logins and
          permissions are on the{" "}
          <Link href="/accounts" className="underline">
            Accounts
          </Link>{" "}
          screen.
        </p>
      </div>

      {staff.length === 0 ? (
        <Notice tone="info" title="No staff added yet">
          <p>
            Add each person below with their daily rate. Once at least one
            person has a rate, payroll can be worked out and the daily target on
            the Home screen will include wages.
          </p>
        </Notice>
      ) : null}

      {missingRates.length > 0 ? (
        <Notice
          tone="attention"
          title={`${missingRates.length} staff ${missingRates.length === 1 ? "member has" : "members have"} no daily rate yet`}
        >
          <p>
            Payroll cannot work out what to pay{" "}
            {missingRates.map((member) => member.fullName).join(", ")} until you
            set a rate. Nothing has been guessed.
          </p>
        </Notice>
      ) : null}

      {active.length > 0 ? (
        <Card>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-muted">Active staff</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight">
                {active.length}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">
                Estimated wages a week
              </dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight">
                {formatPesos(
                  sumCentavos(
                    active.map((member) => (member.dailyRateCentavos ?? 0) * 6),
                  ),
                )}
              </dd>
              <dd className="text-xs text-muted">At six days each</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">
                Cash advances outstanding
              </dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight">
                {formatPesos(totalOutstandingAdvances)}
              </dd>
            </div>
          </dl>
        </Card>
      ) : null}

      <section className="space-y-5">
        {active.map((member) => {
          const owed = balances.get(member.id) ?? 0;

          return (
            <Card key={member.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-tight">
                      {member.fullName}
                    </h2>
                    {member.position ? <Tag>{member.position}</Tag> : null}
                    {member.profileId ? (
                      <Tag tone="accent">Has a login</Tag>
                    ) : (
                      <Tag>Time clock only</Tag>
                    )}
                    {member.dailyRateCentavos === null ? (
                      <Tag tone="attention">{"⚠"} No daily rate</Tag>
                    ) : null}
                  </div>

                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {member.dailyRateCentavos === null
                      ? "Rate not set"
                      : `${formatPesos(member.dailyRateCentavos)} a day`}
                  </p>
                  {member.dailyRateCentavos !== null ? (
                    <p className="text-xs text-muted">
                      A half day pays{" "}
                      {formatPesos(Math.round(member.dailyRateCentavos / 2))}
                    </p>
                  ) : null}

                  <dl className="mt-3 space-y-1 text-sm text-muted">
                    {member.startDate ? (
                      <div>Started {formatCivilDate(member.startDate)}</div>
                    ) : null}
                    {member.contactNumber ? <div>{member.contactNumber}</div> : null}
                    {member.divisions.length > 0 ? (
                      <div>
                        Works in{" "}
                        {member.divisions
                          .map((id) => DIVISIONS[id as DivisionId]?.name ?? id)
                          .join(", ")}
                      </div>
                    ) : null}
                  </dl>
                </div>

                <div className="text-right">
                  <p className="text-xs font-medium text-muted">Owes in advances</p>
                  <p
                    className={`mt-1 text-xl font-semibold tracking-tight ${owed > 0 ? "text-attention" : ""}`}
                  >
                    {formatPesos(owed)}
                  </p>
                  <div className="mt-3">
                    <CashAdvanceForm
                      staffId={member.id}
                      fullName={member.fullName.split(" ")[0]}
                      today={today}
                    />
                  </div>
                </div>
              </div>

              <details className="mt-5 border-t border-line/60 pt-4">
                <summary className="cursor-pointer text-sm text-muted hover:text-ink">
                  Edit details, or link a login
                </summary>
                <div className="mt-5 space-y-6">
                  <StaffForm
                    member={{
                      id: member.id,
                      fullName: member.fullName,
                      position: member.position,
                      contactNumber: member.contactNumber,
                      address: member.address,
                      emergencyContactName: member.emergencyContactName,
                      emergencyContactNumber: member.emergencyContactNumber,
                      startDate: member.startDate
                        ? civilDateToISO(member.startDate)
                        : null,
                      dailyRateCentavos: member.dailyRateCentavos,
                      divisions: member.divisions,
                      note: member.note,
                    }}
                  />
                  <div className="border-t border-line/60 pt-5">
                    <LinkAccountForm
                      staffId={member.id}
                      currentProfileId={member.profileId}
                      accounts={accounts}
                    />
                  </div>
                  <div className="border-t border-line/60 pt-5">
                    <StaffStatusForm
                      staffId={member.id}
                      fullName={member.fullName.split(" ")[0]}
                      active
                    />
                  </div>
                </div>
              </details>
            </Card>
          );
        })}
      </section>

      {inactive.length > 0 ? (
        <Card
          title={`No longer working here (${inactive.length})`}
          description="Kept so their payroll history and everything they entered stays intact."
        >
          <ul className="space-y-3">
            {inactive.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span className="text-sm">
                  {member.fullName}
                  {member.position ? ` · ${member.position}` : ""}
                </span>
                <StaffStatusForm
                  staffId={member.id}
                  fullName={member.fullName.split(" ")[0]}
                  active={false}
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card
        title="Add a staff member"
        description="You can leave the daily rate blank for now, but payroll will not work until it is set."
      >
        <StaffForm />
      </Card>
    </div>
  );
}
