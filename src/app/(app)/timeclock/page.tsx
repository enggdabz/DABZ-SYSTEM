import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, TAP_AREA, Tag } from "@/components/ui";
import { getSettings, requireUser } from "@/lib/auth/dal";
import { isOwnerOrAdmin } from "@/lib/auth/permissions";
import { getStaff, getTodaysAttendance } from "@/lib/data/staff";
import { describeAttendance, formatHours } from "@/lib/payroll";
import {
  civilDateToISO,
  formatCivilDate,
  manilaToday,
  scheduledHours,
} from "@/lib/period";

import { ClockCard, CorrectShiftForm } from "./ClockCard";

export const metadata = { title: "Time clock · Dabz System" };

/** "8:05 AM" in Manila time. */
function clockTime(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/** "08:05" for a time input. */
function timeInputValue(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default async function TimeClockPage() {
  await connection();

  // Any signed-in person may open the time clock. Row Level Security still
  // decides what they can see: a staff member sees only their own shift.
  const user = await requireUser();
  const settings = await getSettings();

  const [staff, attendance] = await Promise.all([
    getStaff(),
    getTodaysAttendance(),
  ]);

  const today = manilaToday();
  const perDay = scheduledHours(settings.workDayStart, settings.workDayEnd);
  const active = staff.filter((member) => member.status === "active");

  // Since open decision 17.2 was answered, you clock only yourself in - so the
  // card that matters is your own. Owner/Admin still see everyone, because they
  // are the ones who record a missed tap.
  const me = active.find((member) => member.profileId === user.id) ?? null;
  const others = active.filter((member) => member.id !== me?.id);
  const canRecordForOthers = isOwnerOrAdmin(user);
  const noLogins = active.filter((member) => member.profileId === null);

  const rows = active.map((member) => {
    const entry = attendance.find((row) => row.staffId === member.id);
    const described = describeAttendance({
      date: today,
      timeIn: entry?.timeIn ?? null,
      timeOut: entry?.timeOut ?? null,
      workDayStart: settings.workDayStart,
      scheduledHoursPerDay: perDay,
    });

    return { member, entry, described };
  });

  const currentlyIn = rows.filter(
    ({ entry }) => entry?.timeIn && !entry.timeOut,
  );
  const notInYet = rows.filter(({ entry }) => !entry?.timeIn);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Time clock</h1>
        <p className="mt-2 text-muted">
          {formatCivilDate(today)} &middot; shop hours {settings.workDayStart}
          &ndash;{settings.workDayEnd}
        </p>
      </div>

      <Notice tone="info" title="This is separate from signing in">
        <p>
          Signing in gets you into the system; timing in starts your working
          day. You can only time <strong>yourself</strong> in and out
          {canRecordForOthers
            ? " - as owner or admin you can also record a day for someone who forgot, which is written to Activity."
            : ". If you forgot to tap, ask the owner to correct it."}
        </p>
      </Notice>

      {canRecordForOthers && noLogins.length > 0 ? (
        <Notice
          tone="attention"
          title={`${noLogins.length} staff ${noLogins.length === 1 ? "member has" : "members have"} no login, so they cannot use the time clock`}
        >
          <p>
            {noLogins.map((member) => member.fullName).join(", ")} can no longer
            tap in, because each person now clocks only themselves. Either create
            them an account on{" "}
            <Link href="/accounts" className={`underline ${TAP_AREA}`}>
              Accounts
            </Link>{" "}
            and link it on{" "}
            <Link href="/staff" className={`underline ${TAP_AREA}`}>
              Staff
            </Link>
            , or record their days here yourself.
          </p>
        </Notice>
      ) : null}

      {active.length === 0 ? (
        <Notice tone="attention" title="No active staff yet">
          <p>
            {isOwnerOrAdmin(user)
              ? "Add staff on the Staff screen and they will appear here."
              : "Ask the owner to add you as staff."}
          </p>
        </Notice>
      ) : (
        <>
          <Card
            title={`Currently in (${currentlyIn.length})`}
            description={
              currentlyIn.length === 0
                ? "Nobody has timed in yet today."
                : undefined
            }
          >
            {currentlyIn.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {currentlyIn.map(({ member, entry }) => (
                  <li key={member.id}>
                    <Tag tone="success">
                      {member.fullName} &middot; since {clockTime(entry?.timeIn ?? null)}
                    </Tag>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          {me ? (
            <section>
              <h2 className="text-xl font-semibold tracking-tight">Your day</h2>
              <div className="mt-5 max-w-sm">
                {rows
                  .filter(({ member }) => member.id === me.id)
                  .map(({ member, entry }) => (
                    <ClockCard
                      key={member.id}
                      staffId={member.id}
                      fullName={member.fullName}
                      position={member.position}
                      entryId={entry?.id ?? null}
                      timeInLabel={clockTime(entry?.timeIn ?? null)}
                      timeOutLabel={clockTime(entry?.timeOut ?? null)}
                      isIn={!!entry?.timeIn && !entry.timeOut}
                      isDone={!!entry?.timeIn && !!entry.timeOut}
                    />
                  ))}
              </div>
            </section>
          ) : (
            <Notice
              tone="attention"
              title="Your account is not linked to a staff record"
            >
              <p>
                {canRecordForOthers
                  ? "You can record days for other people below, but you cannot time yourself in until your own staff record is linked to this account on the Staff screen."
                  : "Ask the owner to link your account to your staff record, then you will be able to time in here."}
              </p>
            </Notice>
          )}

          {canRecordForOthers && others.length > 0 ? (
            <section>
              <h2 className="text-xl font-semibold tracking-tight">
                Record for someone else
              </h2>
              <p className="mt-1 text-sm text-muted">
                Only you and admins can do this. Use it when somebody forgot to
                tap &mdash; it is written to Activity with your name on it.{" "}
                {notInYet.length} of {active.length} have not timed in yet.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rows
                  .filter(({ member }) => member.id !== me?.id)
                  .map(({ member, entry }) => (
                    <ClockCard
                      key={member.id}
                      staffId={member.id}
                      fullName={member.fullName}
                      position={member.position}
                      entryId={entry?.id ?? null}
                      timeInLabel={clockTime(entry?.timeIn ?? null)}
                      timeOutLabel={clockTime(entry?.timeOut ?? null)}
                      isIn={!!entry?.timeIn && !entry.timeOut}
                      isDone={!!entry?.timeIn && !!entry.timeOut}
                      onBehalf
                    />
                  ))}
              </div>
            </section>
          ) : null}

          <Card
            title="Today's log"
            description="Who worked, for how long, and who pressed the button."
          >
            {attendance.length === 0 ? (
              <p className="text-sm text-muted">Nothing recorded yet today.</p>
            ) : (
              <ul className="divide-y divide-line/60">
                {rows
                  .filter(({ entry }) => entry)
                  .map(({ member, entry, described }) => (
                    <li key={member.id} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{member.fullName}</span>
                        <span className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-muted">
                            {clockTime(entry?.timeIn ?? null) ?? "—"} &ndash;{" "}
                            {clockTime(entry?.timeOut ?? null) ?? "still in"}
                          </span>
                          <span className="font-medium">
                            {formatHours(described.hoursWorked)}
                          </span>
                          {described.late ? (
                            <Tag tone="attention">{"⚠"} Late</Tag>
                          ) : null}
                          {described.forgotTimeOut ? (
                            <Tag tone="attention">{"⚠"} No time out</Tag>
                          ) : null}
                          {described.overtimeHours > 0 ? (
                            <Tag>
                              {formatHours(described.overtimeHours)} overtime
                            </Tag>
                          ) : null}
                        </span>
                      </div>

                      {isOwnerOrAdmin(user) ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-muted hover:text-ink">
                            Correct this shift
                          </summary>
                          <div className="mt-3">
                            <CorrectShiftForm
                              entryId={entry!.id}
                              workDate={civilDateToISO(today)}
                              timeIn={timeInputValue(entry?.timeIn ?? null)}
                              timeOut={timeInputValue(entry?.timeOut ?? null)}
                            />
                          </div>
                        </details>
                      ) : null}
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
