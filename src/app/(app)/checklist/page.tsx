import Link from "next/link";
import { connection } from "next/server";

import { Card, Notice, Tag } from "@/components/ui";
import { requireOwnerOrAdmin } from "@/lib/auth/dal";
import { getChecklist } from "@/lib/data/checklist";

export const metadata = { title: "To fill in · Dabz System" };

/**
 * Everything still waiting for a figure only the owner can know.
 *
 * The point of this screen is that the shop does not have to stop and set
 * everything up first. It runs now; these get filled in over the coming weeks,
 * and the list gets shorter.
 */
export default async function ChecklistPage() {
  await connection();

  await requireOwnerOrAdmin();
  const checklist = await getChecklist();

  const important = checklist.items.filter((item) => item.important);
  const rest = checklist.items.filter((item) => !item.important);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">To fill in</h1>
        <p className="mt-2 text-muted">
          Figures only you can know. The system is running without them &mdash;
          fill them in whenever you get to it, and this list gets shorter.
        </p>
      </div>

      {checklist.items.length === 0 ? (
        <Notice tone="success" title="Nothing left to fill in">
          <p>
            Every bill has a due day, every loan has an interest rate, every
            staff member has a daily rate, and every product has a price. The
            system now has everything it needs to warn you properly.
          </p>
        </Notice>
      ) : (
        <Notice tone="info" title="Nothing here is broken">
          <p>
            Each of these is a figure the system deliberately left empty rather
            than guessing. A made-up due day or price would produce confident,
            wrong answers &mdash; and you would start trusting them. Everything
            below can be typed in while the shop is open.
          </p>
        </Notice>
      )}

      {important.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            Worth doing first
          </h2>
          {important.map((item) => (
            <ChecklistCard key={item.id} item={item} />
          ))}
        </section>
      ) : null}

      {rest.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            When you get a chance
          </h2>
          {rest.map((item) => (
            <ChecklistCard key={item.id} item={item} />
          ))}
        </section>
      ) : null}

      <Card
        title="Things I cannot put on this list"
        description="Because the system has no way to know they are missing."
      >
        <ul className="space-y-2.5 text-sm text-muted">
          <li>
            <strong className="text-ink">The rest of the debt.</strong> You said
            the real total is closer to ₱2,000,000; ₱1,336,264 is entered. Add
            the rest on{" "}
            <Link href="/loans" className="underline">
              Loans
            </Link>
            .
          </li>
          <li>
            <strong className="text-ink">Your real shop hours and payday.</strong>{" "}
            The defaults are 8:00&ndash;17:00 over 26 working days. They decide
            who is marked late and how overtime is counted, so they are worth
            correcting on{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>
            .
          </li>
          <li>
            <strong className="text-ink">Bulk discount rules.</strong> The
            machinery is there; no rules are set, so every quantity costs the
            normal price. Add them per product on{" "}
            <Link href="/products" className="underline">
              Products
            </Link>
            .
          </li>
          <li>
            <strong className="text-ink">
              What &ldquo;Magic Payment&rdquo; and &ldquo;Forests Lake&rdquo;
              are.
            </strong>{" "}
            Both are seeded as operating costs with a note. Tell me and I will
            put them in the right category.
          </li>
          <li>
            <strong className="text-ink">One-colour black logo files.</strong>{" "}
            Receipts and payslips print a plain text wordmark until those exist,
            because a white crest is invisible on white paper.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function ChecklistCard({
  item,
}: {
  item: Awaited<ReturnType<typeof getChecklist>>["items"][number];
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            {item.important ? (
              <span aria-hidden="true" className="text-attention">
                {"⚠"}
              </span>
            ) : null}
            {item.title}
          </h3>
          <p className="mt-1 text-sm text-muted">{item.why}</p>

          {item.names.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {item.names.map((name) => (
                <li key={name}>
                  <Tag>{name}</Tag>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <Link
          href={item.href}
          className="shrink-0 rounded-control bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90"
        >
          {item.linkLabel}
        </Link>
      </div>
    </Card>
  );
}
