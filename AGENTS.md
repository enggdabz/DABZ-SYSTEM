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
- **The owner has asked me to keep building rather than stop for questions**
  (18 Sep 2026): "just decide which is best and then we will revise it later if
  necessary." So when something is not covered, make the best call, build it,
  and **record it as an assumption in `docs/DECISIONS.md`** with a note on how
  to change it. Do not block on an open decision.
- That does **not** override the rule below about missing figures. Deciding how
  something should work is mine to do; inventing a number only the owner can
  know — a price, a due day, an interest rate, a wage — is not. Those stay
  empty, with a warning and an editable field.
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
- Must work on a **desktop, a tablet and a phone**. Check at 390px (phone),
  768px (tablet portrait), 1024px (tablet landscape) and 1440px (desktop) - not
  just the two extremes, because tablet portrait is where a `sm:`/`lg:`-only
  layout falls apart. Anything a person taps at the counter needs a touch
  target of at least 24px, and the primary action must be reachable without
  scrolling.
- **A figure only the owner can know is never invented** - a price, a due day,
  an interest rate, a wage. It stays empty, with a warning and an editable
  field, AND it must appear in `src/lib/data/checklist.ts` so the To fill in
  screen lists it. Adding a new such field means adding it there too.
- **Anything that covers the screen is portalled into `<body>`.** A dialog or
  overlay rendered inside the top bar looks correct in the markup and is wrong
  on screen: the bar has a `backdrop-blur`, and a blur makes an element a
  containing block, so `fixed inset-0` measures itself against the BAR, not the
  screen. The bill reminder hung 260px off the top of a phone that way. Use
  `createPortal(dialog, document.body)`, and check a new overlay in a browser -
  no unit test can see this.
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

## Money rules (built in Phase 2)

- **Bills, loans and the ledger are Owner/Admin only.** Spec 4.3 puts them
  beyond any staff checkbox, so those tables have no staff-facing policy at
  all — not even read.
- **Anything touching more than one money table goes in a database function**,
  so it is one transaction. `mark_bill_paid` writes the payment, the ledger
  entry and the loan payment together; doing that as three requests risks the
  ledger saying money left while the loan balance never moved. Follow the same
  pattern for payroll and sales.
- **Ledger entries are voided, never deleted** (`voided_at`, `void_reason`).
  Every total must skip voided rows — use `liveEntries()` from
  `src/lib/data/money.ts`. Forgetting this shows money that was taken back.
- **Borrowed money and owner capital are not income**; an owner withdrawal is
  not a shop cost. Use `countsAsIncome()` / `countsAsShopExpense()` rather than
  filtering on direction alone.
- **Dates are Manila dates.** Never compare a stored UTC timestamp to a
  calendar date directly — go through `src/lib/period.ts` (`manilaToday`,
  `manilaDayRangeUtc`, `manilaMonthRangeUtc`). A UTC comparison makes bills
  look overdue a day early, every month.
- **A missing figure stays missing.** A bill with no due day and a loan with no
  interest rate are real states, shown with a warning and an editable field.
  Never substitute a default for something only the owner can know — a
  confident wrong warning is worse than none, because it gets trusted.

## Payroll rules (built in Phase 3)

- **An employee is not an account.** `staff` holds people the shop pays;
  `profiles` holds people who can sign in. `staff.profile_id` is nullable
  because spec 13.1 makes a login optional. Never require one.
- **A half day pays half the daily rate** (open decision 17.6, answered). What
  makes a day a half day is the OWNER'S choice, stored on `payroll_days`; the
  system may suggest it from the hours worked but never decides.
- **The daily rate is copied onto the payroll week**, not read live from
  `staff`. A later raise must not rewrite what someone was paid last month.
- **A cash advance deduction is capped at gross pay.** Net pay can never go
  negative; the remainder carries over and the owner is told.
- **A paid week is locked by the database.** The update policy on
  `payroll_weeks` only matches `status = 'draft'`, so a paid week cannot be
  edited at all. `unlock_payroll_week` is `SECURITY DEFINER` and is the single
  sanctioned way past that lock — do not loosen the policy instead.
- **A policy sub-query is subject to RLS too.** Checking a row in another
  protected table from inside a policy needs a `SECURITY DEFINER` helper (see
  `is_active_staff`), or the check silently fails for the very people it is
  meant to allow.
- **A printed document adds up its own rows.** Never derive a total on a
  payslip or receipt by subtracting from a stored figure — if they disagree,
  show the disagreement.
- Print styles must target `body > header` / `body > footer`, never bare
  `header`, or a document's own heading disappears from the page.

## Counter rules (built in Phase 4)

- **A sale always starts blank** (spec 6). Nothing is added by tapping a preset
  alone: the quantity, and the price where there is no fixed one, is confirmed
  first.
- **The server re-derives every total.** `completeSaleAction` never trusts the
  figures the browser sends; it rebuilds them with `src/lib/pos.ts` and writes
  those. The screen's totals are a preview, not the record.
- **`complete_sale` is `SECURITY DEFINER`** and checks `has_permission('add_sales')`
  itself. The ledger is Owner/Admin only, so this is the one sanctioned path by
  which a staff member's sale reaches it. Do not open the ledger to staff
  instead.
- **A discount is split across divisions by `totalsByDivision`**, which makes
  the parts add back up to the total exactly. Never allocate a discount in SQL
  or by rounding each share independently - that leaves a centavo hole in the
  daily figures.
- **A sale is voided, never deleted** - the customer may hold the receipt. Its
  ledger entries are voided with it, or the day keeps counting money that was
  handed back.
- **Staff add sales; only Owner/Admin void them.** Staff raise a void request.
- **A printed document adds up its own rows** - receipts as well as payslips.
- **A missing price is a real state.** A product with no price makes the counter
  ask for the amount; that is the answer for anything the owner has not priced.

## Stock and expense rules (built in Phase 5)

- **A stock level is never stored.** It is `sum(delta_thousandths)` over the
  movements, the same way a payslip adds up its own rows. A stored figure and a
  movement history can disagree, and then nothing says which one is lying. The
  cost is one sum per item; the benefit is that every number can be explained
  by the rows under it.
- **Quantities are whole thousandths** of a unit, for the reason money is whole
  centavos: a stock level is a long addition, and decimals drift. Use
  `src/lib/quantity.ts`. `costOfQuantity()` is a MONEY calculation and rounds
  half away from zero - the same rule as `round()` in PostgreSQL, so
  `record_stock_in` and the app agree to the centavo.
- **A movement is append-only.** No update or delete policy exists. A wrong one
  is answered with an opposite `adjustment`, exactly as a ledger entry is
  voided rather than erased. A physical count writes the DIFFERENCE as its own
  movement rather than overwriting the level, so a loss stays visible.
- **The expenses table has no insert, update or delete policy at all.**
  `record_expense` and `decide_expense` are the only ways in, and they check
  the permission themselves. That is what makes it impossible to approve your
  own expense or to record one without its ledger entry.
- **The staff expense limit is read inside the database function**, never
  passed in by the caller. A Server Action is a public endpoint: it must not be
  the thing that judges its own limit.
- **A pending expense has no ledger entry**, enforced by a check constraint.
  Until the owner approves it, no money has moved anywhere in the system.
- **Supplier payables are debt**, so they are Owner/Admin only with no staff
  policy at all - the same class as bills and loans (spec 4.3). Staff can
  create one by receiving stock on account; they just cannot see the list.
- **The daily target measures profit, not sales** (spec 12.3). Today's
  materials, fuel and meals come off the takings; today's bills, loan payments,
  wages and cash advances do NOT, because the target exists to pay for those -
  subtracting them as well would count them twice. The rule lives in
  `countsAgainstDailyTarget()`, not in a screen.

## Apparel rules (built in Phase 6)

- **A roster IS the quantity.** Fifteen names means fifteen jerseys. A typed
  quantity beside a name list is a second answer to the same question, and the
  names are the one the customer checked. `lineTotal()` uses the roster when
  there is one and the typed quantity only when there is not.
- **The size surcharge is COPIED onto each roster entry** when it is added, not
  looked up when the total is shown. Raising the 2XL surcharge next month must
  never rewrite a quote the customer already agreed to. A test proves it.
- **An order's total is never stored.** It is added up from its lines and
  roster every time, the same rule as a payslip and a receipt. A stored total
  and a name list can disagree, and a customer holding the job order sheet will
  believe whichever is larger.
- **`record_apparel_payment` is the only way money reaches the ledger**, and it
  refuses a split that does not add back up to the payment. The split is worked
  out on the SERVER from the order's own lines, never taken from the browser -
  the same shape as `complete_sale` and `record_expense`.
- **A payment is voided, never deleted**, and its ledger entries are voided with
  it. Staff may take a payment; only Owner/Admin may void one (spec 4.4).
- **An order may be released with money still owed.** A shop does let a regular
  take the jerseys, so the system says so and keeps the order on the list rather
  than refusing - an order that disappears is an order nobody chases.
- **An order is cancelled with a reason, never deleted.** There is no delete
  policy at all; the customer may be holding the sheet.
- The down payment percentage is **null until the owner sets one**. Spec 17.10
  offers "e.g. 50%", which is an example, not the owner saying so - a made-up
  policy would have staff turning away a customer who paid what the owner
  actually wanted.

## Repair rules (built in Phase 7)

- **There is no password field, anywhere.** Spec 9.3 says the shop does not
  keep laptop passwords, so nothing in this system has a box for one - not
  encrypted, not "temporarily", not in a note field called something else. A
  box that exists gets filled in. `09_phase7_rls.test.sql` checks the schema
  for any column whose name looks like a password and fails if one appears.
  What IS recorded is `unlock_method`: the customer unlocks it, it arrived
  unlocked, or it does not need unlocking.
- **The warranty period is COPIED onto the ticket when the unit is released**,
  never read live from Settings. Shortening the shop warranty next year must
  not quietly cancel a promise already made - the same rule as the daily rate
  on a payroll week and the size surcharge on a jersey.
- **"Declined" and "cannot be repaired" leave the unit IN THE SHOP.** They are
  end states for the work, not for the unit, so `isAwaitingCollection()` counts
  them and the unclaimed warning applies to them - that is exactly the pile
  that grows in the corner (spec 9.4).
- **The unclaimed count runs from `ready_on`, not from `received_on`.** A
  repair that took three weeks is not an abandoned unit.
- **A ticket's total is never stored.** It is added up from `repair_lines`, and
  the checking fee is kept separate in the totals because it is charged even
  when the customer says no.
- **`fit_repair_part` charges the part and takes it off the shelf in one
  transaction.** Removing the charge afterwards does NOT put it back - the part
  did leave, and a return is a delivery somebody has to record on Stocks.
- **`record_repair_payment` is the only way money reaches the ledger**, and it
  refuses a split that does not add back up to the payment. The split is worked
  out on the SERVER from the ticket's own lines.
- The same service can be priced **per machine or for any machine**
  (`unit_kind`). That is how open decision 17.11 - "does a laptop cost the same
  as a desktop?" - is left open in the shape of the data rather than answered.
