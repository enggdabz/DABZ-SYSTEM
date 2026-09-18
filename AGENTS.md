<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Dabz System — project rules

Read `docs/PHASES.md` (what is built, what is next) and `docs/DECISIONS.md`
(open questions) before starting work.

## Working agreement with the owner

The owner is learning to build this as a development partner, not just
receiving code.

- Build **one phase at a time**, in the order in `docs/PHASES.md`. Do not start
  a phase until the owner confirms the previous one works.
- Before a phase: explain in plain language what will be built and why.
  After a phase: explain what was built, how to run it, how to test it.
- When something is not covered, or an open decision in `docs/DECISIONS.md`
  blocks the work, **ask the owner** — do not guess. Record the answer there.
- Prefer simple, readable code. Comment the **why**, not the what.

## Non-negotiable technical rules

- **Money is integer centavos.** ₱12.50 is `1250`. Never floating point.
  Use `src/lib/money.ts`; never re-implement peso arithmetic inline.
- **Every money calculation gets automated tests** — totals, discounts, change,
  payroll, balances, quotas. `npm test` must pass before any push.
- **Timestamps stored in UTC, displayed in Asia/Manila** via
  `src/lib/datetime.ts`.
- **Row Level Security on every table.** No exceptions, from the first
  migration onward.
- Every record stores `created_by` and `created_at`. Money records are never
  hard-deleted by staff — corrections go through voids/adjustments with a
  reason, written to the audit log with before/after values.
- Database changes are new numbered files in `supabase/migrations/`, never edits
  to an already-applied migration.

## Design rules

- Colours come from the tokens in `src/app/globals.css` (`bg-surface`,
  `text-ink`, `text-muted`, `bg-accent`, ...). Never hardcode a hex value in a
  component.
- Red is the brand colour, so **warnings must always carry an icon (⚠) and a
  text label** — never colour alone, or they read as buttons.
- Must work at the counter on a desktop and on a phone.
- Gentle, short motion only; `prefers-reduced-motion` is already respected in
  `globals.css`.
- Sentence case on buttons and labels ("Mark paid", "Add to sale", "Time in").
