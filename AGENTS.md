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

## Security architecture (built in Phase 1)

Three layers. Only the third is a real boundary:

1. **Navigation** hides sections (`src/lib/auth/navigation.ts`) — a courtesy.
2. **Every screen and Server Action** re-checks the asker via
   `src/lib/auth/dal.ts` (`requireUser`, `requireOwnerOrAdmin`, `requireOwner`,
   `requirePermission`). A Server Action is a public endpoint: never rely on the
   caller having seen the button.
3. **PostgreSQL Row Level Security** refuses the rows. This is the boundary.

Rules that are easy to break:

- Policies on `profiles` must not read `profiles` directly (infinite
  recursion). Use the `SECURITY DEFINER` helpers: `current_role_name()`,
  `is_owner()`, `is_owner_or_admin()`, `has_permission()`.
- Write policies need **both** `using` and `with check`. Without `with check` an
  admin could edit a staff row and set its role to `owner`.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely. Only
  `src/lib/supabase/admin.ts` may use it, only for work that happens before
  anyone is signed in (username lookup, lockout counting, login history) or
  that needs Supabase's admin API (creating accounts, resetting passwords).
  That module is marked `server-only`. Everywhere else, use
  `createSupabaseServerClient()` so RLS stays in force.
- `audit_log` and `login_events` have **no** insert/update/delete policy on
  purpose. Only the server writes them. Do not add one.

## Verifying work

```bash
npm test              # unit tests: money, credentials, settings, permissions
npm run test:rls      # security rules against a real PostgreSQL
npm run check:schema  # every table/column the app asks for exists
npm run typecheck && npm run lint && npm run build
```

`test:rls` and `check:schema` need a local PostgreSQL (they create and drop a
throwaway database). Point them at one with `PGHOST`/`PGPORT`/`PGUSER`. They
catch two classes of bug that nothing else does: a security policy that does
not do what its name suggests, and a misspelled column in a query string.

Supabase Auth cannot be run locally here (no Docker daemon), so the sign-in
round trip is the one thing that must be tried against a real project.
