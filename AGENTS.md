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
- **Migrations reach a real database through `npm run db:push`** (the Supabase
  CLI), which applies them in order and records each in
  `supabase_migrations.schema_migrations` so none can run twice. The `0000`-
  style four-digit prefixes are accepted as versions and sort before any later
  `supabase migration new` timestamp, so both naming styles can coexist. Verified
  by pushing all seventeen to a throwaway PostgreSQL and then running the whole
  RLS suite against the result: 42 tables and one view, 315 checks, identical
  to `run.sh`.
- **CI runs all of it on every push and pull request** (`.github/workflows/ci.yml`):
  lint, typecheck, unit tests, the security rules and the schema checker, then
  the build. The security rules and the schema checker need a real PostgreSQL,
  so the workflow brings one up as a service container and points PGHOST/PGPORT
  at it. They were the checks most worth automating: they are what stops a
  policy change quietly opening the books, and by hand they only ran when
  somebody remembered.
- **`supabase test db` is NOT our test command.** It expects pgTAP tests in
  `supabase/tests/`, and ours are plain psql scripts with the same `.test.sql`
  suffix, so it fails confusingly. Use `npm run test:rls`.

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
- **Tappable text wears `TAP_AREA`** from `src/components/ui.tsx`. Underlined
  text on its own is about 20px, so every link and every small action worded as
  a link - "Open the bills screen", "Remove", "Clear sale" - carries that
  padding. It is hit area only: the colour and the underline stay where the
  link is written, so adding it changes nothing about how a screen looks. Do
  not reach for `inline-block` instead - a link inside a sentence has to be
  able to break across two lines, and an inline-block one cannot.
  `src/components/tap-targets.test.ts` fails if an underlined className appears
  without it.
- **A figure only the owner can know is never invented** - a price, a due day,
  an interest rate, a wage. It stays empty, with a warning and an editable
  field, AND it must appear in `src/lib/data/checklist.ts` so the To fill in
  screen lists it. Adding a new such field means adding it there too.
- **Sections live in the sidebar** (`src/components/AppSidebar.tsx`), grouped by
  the `group` on each `NavSection`. A new section needs a group or it will not
  appear. The rail is permanent from `lg` up and a drawer below it.
- **A link in the rail must be a flex child or carry `block`.** `<a>` is inline,
  so a group container that is not a flex column lets twenty-three links flow
  into a paragraph and wrap across the rail. No unit test sees this and the page
  does not overflow - the clipping is inside the aside - so it is only visible
  in a browser.
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
- **Nothing in the catalogue is seeded.** Bills, loans, products, apparel items
  and repair services are all the owner's to enter; `0011` and `0012` cleared
  the rows `0002`, `0005`, `0007` and `0008` used to ship. An empty list is a
  real state too, so every one of those screens says so and
  `src/lib/data/checklist.ts` lists it. Never add a starter row back by editing
  an old migration. The apparel SIZE LADDER is the exception and stays: those
  rows are where a per-size surcharge is typed in, not a list anyone invented.
- **A "loan installment" bill only pays a debt down if it is POINTED AT one.**
  `mark_bill_paid` writes a loan payment when `bills.loan_id` is set and not
  otherwise, so a bill with the label and no link takes money out of the ledger
  every month and moves no balance - silently. The link is chosen on the bill
  form (`billLoanLink` in `src/lib/bills.ts`, which also clears it when a bill
  goes back to being an operating cost), and the Bills screen warns about any
  installment that has none.
- **Delete only where nothing has happened; otherwise stop.** A bill that has
  been marked paid, a loan that has been paid down and a product that has been
  sold are kept — their payment rows cascade, so deleting one would take real
  money records with it. The rule is enforced by the delete policies in `0011`,
  not by the button, and the wording of every refusal lives in
  `src/lib/deletable.ts` so the screen and the action cannot disagree. A delete
  writes the whole row to the audit log first, INCLUDING whatever the delete
  cascades away or unlinks - a product's bulk price rules, a loan's installment
  bills - because afterwards there is nothing left to reconstruct them from.
- **A `SECURITY DEFINER` helper checks the caller itself.** The `*_has_history`
  functions are published by PostgREST as URLs, so one that answered anybody
  would be a way round the rule that staff see nothing of the bills and loans,
  one bit at a time. They return null to anyone who is not Owner/Admin, and the
  app treats anything but `true` as "no history" - the safe direction. Note the
  consequence: a migration's own DO block cannot call them, because nobody is
  signed in and the whole expression comes back null. Write the `exists` check
  out in the statement instead.
- **A daily target of zero means "not known", never "reached".** With no bills
  entered the target is zero, and a green ✓ at the top of the Overview before
  the first sale is the most confidently wrong thing the system could say. See
  `unknown` in `src/lib/target.ts` and `targetReached` in `src/lib/closing.ts`.

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

## Report rules (built in Phase 8)

- **Reports store nothing.** There is no report table and no nightly job:
  `src/lib/reports.ts` takes ledger entries and a date range and adds them up,
  and the screen computes it fresh every time it is opened. The cost is one
  read per visit; the benefit is that a report can never fall out of step with
  the screens it was built from. Phase 8 added **no migration at all**.
- **A period is compared with the same LENGTH of time immediately before it**,
  not with "last month". Eleven days of this month against the eleven days
  before them - otherwise a half month always looks like a collapse.
- **A percentage against zero is never given.** "Up 100%" from nothing is
  meaningless and "up ∞%" is worse, so `compareTo()` returns `percent: null`
  and says "nothing to compare with".
- **Share percentages are not forced to add up to 100.** Forcing them would
  mean printing a share the money does not actually make. The amounts are the
  truth; a test asserts the amounts add back up exactly, and the screen says
  the percentages may not.
- **Real money never reads as "0%".** A category rounding below half a percent
  shows `<1%` - a zero beside money that was actually spent reads as a bug in
  the report. The CSV keeps the plain number, because a spreadsheet has to read
  that column as a number.
- **What is owed is kept out of the period figures.** Money owed to the shop
  was already counted as income when the work was done; adding it to a month's
  income would count it twice. It lives in a separate "as of today" block that
  says so.
- **A route handler re-checks the asker.** `/reports/export` calls
  `requireOwnerOrAdmin()` exactly as a screen does - a URL is a public endpoint
  whether or not anyone linked to it.

## Public page rules (built in Phase 9)

- **`/` is the shop's public page; the owner's home is `/overview`.** Anything
  that used to send a person to `/` sends them to `/overview` instead:
  `revalidatePath`, the post-sign-in redirect, the `denied=1` redirect in
  `dal.ts`, and the Home entry in `navigation.ts`. The one thing that still
  points at `/` is the customer-facing wordmark in `src/app/(public)/layout.tsx`.
- **The public page never prints what the owner has not said.** Address, phone,
  opening hours, Facebook page and Messenger name are settings that start null,
  and the page leaves out whatever is missing. A made-up figure on an internal
  screen is bad; a made-up address on a page somebody drives to is worse. They
  appear in `src/lib/data/checklist.ts` like every other owner-only figure.
- **Nothing on the public page is addressed to the owner.** A customer reading
  "fill this in under Settings" sees a shop that is not open yet. The gap
  belongs on the To fill in screen.
- **`enquiries` has no insert policy, and no delete policy, for anyone.** This
  is the ONE place a stranger causes a row to exist, so the table stays shut
  and the single way in is `sendEnquiryAction`, which checks every field, caps
  every length, silently drops a filled honeypot and refuses more than
  `ENQUIRY_LIMITS.perHour` from one address before writing with the
  service-role client. Never answer spam by loosening the policy; the answer is
  in the action, where it can be read and tested.
- **This is the second sanctioned use of the service-role key**, alongside
  sign-in, and for the same reason: nobody is signed in yet. `src/lib/data/public.ts`
  reads the three price lists with it because a visitor is nobody and RLS would
  hand them an empty page. It reads and never writes, and it returns only what
  a customer would read off a wall anyway.
- **Staff cannot read an enquiry.** A stranger's name and phone number is
  Owner/Admin material (spec 4.3), so there is no staff policy at all - not
  even read - and the screen re-checks with `requireOwnerOrAdmin()`.
- **The system does not send the reply.** It records that the shop answered and
  what was said. A reply button that quietly failed would leave a customer
  waiting for something that never left.
- **A link a customer taps is padded, not bare** - `TAP_AREA`, as everywhere
  else in the system now. The public page is where it matters most: a customer
  on a phone has one thumb and no patience.

## Collections rules (built in Phase 10)

- **`public.collections` is a VIEW, and `security_invoker` is the whole point.**
  It unions `sales`, `apparel_payments` and `repair_payments`, three tables
  whose policies differ, so a view running as its OWNER would hand a counter
  assistant the apparel and DabzTech books one row at a time. With
  `security_invoker = true` the existing policies still decide. Never make it
  `SECURITY DEFINER`, and never add a policy to an underlying table "so the
  feed works" - that opens the table everywhere else too.
  `12_phase10_rls.test.sql` checks the flag directly, because without it every
  other test in that file would pass while the books were wide open.
- **The feed's totals must equal the ledger's, per money source.** The feed is
  a view of the three payment tables; the ledger is what those tables wrote. If
  they ever differ the FEED is wrong. The invariant is asserted over everything
  in the database, not just the rows the test wrote.
- **`taken_at` is when the row was WRITTEN, not the date somebody typed.** It
  has to be: the matching ledger entry is stamped with the same `now()` in the
  same transaction, and that is what makes the invariant above hold for a day.
  The typed date rides along as `recorded_for` so a backdated payment can still
  say so on screen.
- **Nothing in Phase 10 writes to the ledger.** The counter's payment action
  calls `record_apparel_payment` or `record_repair_payment` - the same two
  functions those screens have always used. There are exactly three ways money
  reaches the ledger and adding a fourth is how two of them start disagreeing.
- **A division's permission, not `add_sales`, governs its payments.** Taking an
  apparel payment needs `apparel_job_orders`; a repair payment needs
  `dabztech_tickets`. `add_sales` alone gives neither, the button is hidden
  without it, and the Server Action re-checks - a hidden button is not a rule.
- **`owners_pocket` is takings, but it is not drawer cash.** It counts in the
  day's total and never in the cash figure. Folding it into cash makes an
  honest drawer read as short by exactly that amount.
- **A screen that can only show PART of the day says so.** A staff member
  without the apparel permission gets no apparel rows, which is correct - but
  rendering "Apparel ₱0.00" for them is a claim that no apparel money came in.
  Show only the doors that person can see, and name the ones that are hidden.
- **`repair_payments.kind` is nullable with no default, and stays that way.**
  Null means "taken before Phase 10", which nobody can now resolve. The
  function refuses an unknown kind rather than storing null, so a typo cannot
  manufacture one more unanswerable row.
- **A closed day's breakdown is a snapshot.** It is frozen when the drawer is
  counted, because a void tomorrow changes what the feed says about today and
  the closing records what was believed at the time. Days closed before Phase
  10 keep NULL and the screen says so - zero would be a claim.
