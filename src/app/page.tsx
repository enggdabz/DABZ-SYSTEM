import { connection } from "next/server";

import { TopBar } from "@/components/TopBar";
import { DIVISION_LIST } from "@/lib/divisions";
import { formatManilaDateTime } from "@/lib/datetime";
import { checkDatabase, type DatabaseHealth } from "@/lib/health";
import { formatPesos, parsePesos } from "@/lib/money";

/**
 * Phase 0 hello screen.
 *
 * It is deliberately more than the word "hello": it proves the three pieces of
 * the stack are wired together and tells the owner what to do next.
 */
export default async function HomePage() {
  // The database check must happen when someone opens the page, not when the
  // site is built - otherwise the build would try to reach Supabase.
  await connection();

  const health = await checkDatabase();
  const now = new Date();

  return (
    <>
      <TopBar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-sm font-medium text-muted">
          {formatManilaDateTime(now)} &middot; Asia/Manila
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
          Hello, Dabz.
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          The project is set up and running. This screen is the Phase 0
          checkpoint: it shows whether the app, the database and the money rules
          are all working before we build anything real on top of them.
        </p>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          <DatabaseCard health={health} />
          <AppCard />
          <MoneyCard />
        </div>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">
            The three divisions
          </h2>
          <p className="mt-1 text-sm text-muted">
            Every sale, expense and report in this system gets tagged with one
            of these.
          </p>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {DIVISION_LIST.map((division) => (
              <article
                key={division.id}
                className="rounded-card bg-surface p-6 shadow-sm ring-1 ring-line/60"
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: division.tagColor }}
                  />
                  <h3 className="font-semibold tracking-tight">
                    {division.name}
                  </h3>
                </div>
                {division.tagline ? (
                  <p className="mt-1 text-sm font-medium text-muted">
                    &ldquo;{division.tagline}&rdquo;
                  </p>
                ) : null}
                <ul className="mt-4 space-y-1.5 text-sm text-muted">
                  {division.offers.map((offer) => (
                    <li key={offer}>{offer}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <NextStepsCard connected={health.status === "connected"} />
      </main>

      <footer className="border-t border-line/60 px-4 py-8 text-sm text-muted sm:px-6">
        <div className="mx-auto max-w-6xl">
          <p>
            Dabz Printshoppe &middot; Founded 18 June 2017 &middot; Philippine
            peso ({"₱"}) &middot; Times shown in Asia/Manila
          </p>
        </div>
      </footer>
    </>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card bg-surface p-6 shadow-sm ring-1 ring-line/60">
      <h2 className="text-sm font-medium text-muted">{title}</h2>
      {children}
    </section>
  );
}

function DatabaseCard({ health }: { health: DatabaseHealth }) {
  // Warnings always carry an icon and a word, never colour alone (spec 3.2),
  // because red is the brand colour and would read as a button.
  const badge =
    health.status === "connected"
      ? { icon: "✓", label: "Connected", className: "text-success" }
      : health.status === "not_configured"
        ? { icon: "⚠", label: "Setup needed", className: "text-attention" }
        : { icon: "⚠", label: "Problem", className: "text-attention" };

  return (
    <Card title="Database (Supabase)">
      <p className={`mt-3 flex items-center gap-2 text-lg font-semibold ${badge.className}`}>
        <span aria-hidden="true">{badge.icon}</span>
        <span>{badge.label}</span>
      </p>
      <p className="mt-2 font-medium">{health.headline}</p>
      <p className="mt-2 text-sm text-muted">{health.detail}</p>
      {health.checkedAt ? (
        <p className="mt-3 text-xs text-muted">
          Row last touched {formatManilaDateTime(health.checkedAt)}
        </p>
      ) : null}
    </Card>
  );
}

function AppCard() {
  return (
    <Card title="App (Next.js)">
      <p className="mt-3 flex items-center gap-2 text-lg font-semibold text-success">
        <span aria-hidden="true">{"✓"}</span>
        <span>Running</span>
      </p>
      <p className="mt-2 font-medium">You are looking at it.</p>
      <p className="mt-2 text-sm text-muted">
        Light and dark mode, the Dabz colours and the Inter font are all in
        place. Try the Light / Dark switch at the top right.
      </p>
    </Card>
  );
}

function MoneyCard() {
  // Real calls into the money module, so this card proves the rule rather than
  // just describing it.
  const twelveFifty = parsePesos("12.50");
  const monthlyBills = parsePesos("141127");

  return (
    <Card title="Money rule">
      <p className="mt-3 flex items-center gap-2 text-lg font-semibold text-success">
        <span aria-hidden="true">{"✓"}</span>
        <span>Whole centavos</span>
      </p>
      <p className="mt-2 font-medium">
        {formatPesos(twelveFifty)} is stored as {twelveFifty} centavos
      </p>
      <p className="mt-2 text-sm text-muted">
        Amounts are kept as whole centavos so totals never drift by a centavo.
        Your {formatPesos(monthlyBills)} of monthly bills stays exact no matter
        how many times it is added up.
      </p>
    </Card>
  );
}

function NextStepsCard({ connected }: { connected: boolean }) {
  return (
    <section className="mt-12 rounded-card bg-surface-sunken p-6 ring-1 ring-line/60 sm:p-8">
      <h2 className="text-xl font-semibold tracking-tight">What happens next</h2>
      <ol className="mt-4 space-y-3 text-sm">
        <li className="flex gap-3">
          <span className="font-semibold text-muted">1.</span>
          <span>
            {connected ? (
              <>
                <span className="font-medium">Done</span> &mdash; the Supabase
                project is connected.
              </>
            ) : (
              <>
                <span className="font-medium">Create the database.</span> Follow{" "}
                <code className="rounded bg-surface px-1.5 py-0.5 text-xs">
                  docs/SETUP.md
                </code>{" "}
                to make the free Supabase project and paste its two settings
                into{" "}
                <code className="rounded bg-surface px-1.5 py-0.5 text-xs">
                  .env.local
                </code>
                .
              </>
            )}
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-semibold text-muted">2.</span>
          <span>
            <span className="font-medium">Put it online.</span> Deploy to Vercel
            so you can open it from the counter computer and your phone.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-semibold text-muted">3.</span>
          <span>
            <span className="font-medium">Start Phase 1.</span> Logins for you
            and your staff, roles and permissions, the audit log, and settings.
            I will ask you the questions in{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 text-xs">
              docs/DECISIONS.md
            </code>{" "}
            before each phase that needs them.
          </span>
        </li>
      </ol>
    </section>
  );
}
