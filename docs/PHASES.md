# Build plan

From section 16 of the specification. One phase at a time; a phase does not
start until the owner has confirmed the previous one works.

Each phase ends with: what was built, how to run it, how to test it.

| # | Phase | Status |
|---|---|---|
| 0 | Setup & learning | ✅ Done |
| 1 | Foundation: design system, top nav, login, roles, permissions, audit log, settings | ✅ Done |
| 2 | Bills, loans, ledger, Overview (the money side) | ✅ Done |
| 3 | Staff: profiles, time clock, weekly payroll, cash advances, payslips | ✅ Done |
| 4 | Customers + Dabz Printshoppe POS | ✅ **Done — confirmed 21 Sep 2026** |
| 5 | Expenses pop-up, stocks and supplier payables | ✅ **Done — confirmed 21 Sep 2026** |
| 6 | Dabz Apparel job orders | ✅ **Done — confirmed 21 Sep 2026** |
| 7 | DabzTech Solutions job tickets | ✅ **Done — confirmed 21 Sep 2026** |
| 8 | Reports | ✅ **Done — confirmed 21 Sep 2026** |
| 9 | The public page and customer messages | ✅ **Done — confirmed 21 Sep 2026** |
| 10 | One counter: all three divisions in one list, and any payment taken from the counter | ✅ **Done — confirmed 21 Sep 2026** |
| 11 | Notifications: the shop's warnings on your phone | ✅ **Done — waiting on owner to confirm** |
| 12 | Production report: where each item on a project has got to (the owner's request, not section 16) | ✅ **Done — waiting on owner to confirm** |
| — | Later: Messenger API, Meta Ads tracking, chatbot | Not in first build |

**"Confirmed" means the owner has used the phase and says it works.** It is not
a claim that every hand-check under that phase has been done — where a phase
ends with something still to check by hand, that note stands, and Phase 10's
four-width browser check is one.

---

## Phase 0 — Setup & learning ✅

**Built**

- Next.js 16 project in TypeScript, with Tailwind CSS 4 and the Inter font.
- The Dabz design system as colour tokens (spec 3.2), light and dark mode, dark
  by default. In `src/app/globals.css`.
- Black frosted top bar (spec 3.1) with a light/dark switch.
- The money rule (spec 2.1): amounts as whole centavos, with parsing,
  formatting, line totals, peso and percentage discounts, and change — all in
  `src/lib/money.ts`, covered by 24 automated tests.
- Manila-time formatting helper (spec 2.1).
- The three divisions as data (spec 1.1).
- Supabase connection for both browser and server code.
- The first database migration, with Row Level Security switched on from the
  very first table.
- A hello screen that reports whether the app, the database and the money rules
  are working, and says what to do next.
- Documentation: the README (what each part is, how to run it), `docs/SETUP.md`
  (Supabase and Vercel, step by step), this file, and `docs/DECISIONS.md`.

**Not built on purpose** — no login, no real tables, no business data. That is
Phase 1 and Phase 2.

**How to check it**

```bash
npm install
npm test          # expect: 24 passed
npm run dev       # then open http://localhost:3000
```

On the screen: the App card says **Running**, the Money card shows
**₱12.50 is stored as 1250 centavos**, and the Database card says **Setup
needed** until `docs/SETUP.md` is followed — then **Connected**.

Also try the **Light / Dark** switch at the top right, and open the same page on
a phone to confirm it reflows.

---

## Phase 1 — Foundation ✅

**Built**

*Accounts and signing in (spec 4.1)*
- Username and password sign-in. Staff never see an email address: each username
  is mapped internally to `username@staff.dabz.local`, which Supabase uses as
  its own name for the account and which is never written to.
- No public sign-up. A one-time `/setup` page creates the owner account and then
  refuses to work again; after that, accounts come from the Staff screen.
- Temporary passwords for new accounts and resets, shown once, which the person
  must replace on first sign-in. Nobody can read an existing password, including
  the owner — only reset it.
- An account locks for 15 minutes after 5 failed attempts in a row. A successful
  sign-in clears the count, and repeated tries against an already-locked account
  do not extend the lock.
- Automatic sign-out after a configurable idle period (default 15 minutes) and a
  **Switch user** button for the shared counter computer.
- Sign-in history, readable by the owner and admins, including failures.

*Roles and permissions (spec 4.2, 4.3)*
- Owner, Admin and Staff. The database allows only one owner, and enforces that
  an admin can manage staff but can neither edit the owner nor promote anyone
  (including themselves) to admin.
- The seven permission checkboxes, with **Add sales (POS)** ticked by default for
  a new staff account and nothing else.
- Owner/Admin-only areas — bills, loans, payroll, accounts, void approvals,
  owner withdrawals, full reports and settings — which cannot be granted to
  staff at all.
- Deactivating an account keeps every record it entered and removes all access
  immediately.

*Everything else*
- The audit log: who did what, when, on which record, with before and after
  values. Nothing can edit or delete an entry — not staff, not admins, not the
  owner — and no browser can even add one.
- The Settings screen: working days a month, week start, shop hours, idle
  sign-out, the staff expense limit, and both staff discount limits.
- The real top navigation, showing only the sections a person may open, with
  later phases visibly marked.
- Reusable building blocks (`src/components/ui.tsx`) so every screen matches.

**How it is verified**

| What | How | Result |
|---|---|---|
| Money, usernames, passwords, lockout, settings, permissions | `npm test` | 78 tests |
| The security rules themselves, against a real PostgreSQL | `npm run test:rls` | 30 checks |
| That every table and column the app asks for exists | `npm run check:schema` | 29 tables, 96 columns |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

The security tests are the ones worth knowing about. They prove, against a real
database rather than by reading the code, that:

- a staff member sees only their own profile, and cannot read the sign-in
  history or change shop settings;
- a staff member cannot grant themselves a permission or promote themselves;
- an admin cannot edit the owner, cannot promote staff to admin, and cannot
  promote themselves;
- a deactivated account loses its role and every permission at once;
- the audit log cannot be added to, rewritten or deleted from the app.

**Not verified here** — the actual sign-in round trip needs a live Supabase
project, which this build environment has no access to. Everything around it is
tested; the first thing to try after setup is signing in.

**How to check it**

```bash
npm install
npm test          # expect: 78 passed
npm run dev
```

Then follow `docs/SETUP.md` to create the Supabase project, run **both**
migration files, add the three settings, and create your owner account at
`/setup`. After that:

1. Sign in at `/login`.
2. Open **Staff** and add a staff account. Write down the temporary password it
   shows you — it is shown only once.
3. Sign out (**Switch user**), sign in as that staff member, and confirm you are
   made to choose a new password.
4. Confirm the staff account cannot see Staff, Settings or Activity in the
   navigation, and that typing `/settings` in the address bar bounces back.
5. Sign back in as yourself, open **Settings**, change the working days, and
   confirm the change appears in **Activity** with its old and new value.
6. Try signing in with the wrong password five times and confirm the account
   locks for 15 minutes.

---

## Phase 2 — Bills, loans, ledger, Overview ✅

> **Note, 19 September 2026.** The seeded bills and loans described below were
> cleared at the owner's request — see
> [the catalogue is yours to enter](#19-september-2026--the-catalogue-is-yours-to-enter)
> at the end of this file. Everything else here still holds; only the rows that
> arrived with it are gone.

**Built**

*Bills (spec 12.1)*
- All eleven bills seeded from the specification, adding up to exactly
  **₱141,127.00** a month. A test asserts that total, so if the seed ever
  drifts from the owner's figure it fails rather than going quietly wrong.
- Status badges per month: Paid ✓ · Not yet paid · Due in N days · Due today ·
  Overdue N days ⚠ · **Due day not set ⚠**.
- **Mark paid**, with undo. A bill can only be paid once per month, enforced by
  the database rather than by hope, so pressing the button twice is safe.
- Month navigation, with totals paid, unpaid and needing attention.
- The **5-day reminder**: a pop-up when the owner or an admin opens the system,
  at most once a day, plus a **Bills due soon (n)** button in the header that
  reopens it. It looks into next month too, so a bill due on 2 October shows up
  on 29 September.
- Add, edit and stop counting a bill. Stopping keeps its history.

*Loans (spec 12.2)*
- All six loans seeded, adding up to exactly **₱1,336,264.00**, also asserted
  by a test.
- Remaining balance worked out from the statement figure and the payments made
  **after** the statement date, so a payment the statement already includes is
  never counted twice.
- Estimated monthly interest, and the **⚠ Balance growing** warning when the
  monthly payment is no more than the monthly interest.
- Time to clear each loan, worked out month by month in whole centavos rather
  than with a formula, so "never pays off" needs no special case.
- **Record payment** and **Update from statement**.
- Payment history per loan, marking which payments came from a bill.

*Money in and out (spec 10)*
- The ledger, with every category from the specification.
- **Borrowed money and owner capital are never counted as income**, and an
  owner withdrawal is never counted as a shop cost. Both are shown, separately,
  so the profit figure stays honest.
- Entries created automatically when a bill is paid or a loan payment recorded,
  marked **Automatic**, so nothing is entered twice.
- Manual entries for what the other screens do not cover yet.
- Voiding with a reason, never deletion. A voided entry stays in the list,
  struck through, and never reaches a total.

*Overview (spec 15.1, 12.3)*
- Today's target and progress as the biggest number on the screen.
- Bills this month, total debt, balance-growing warnings, and the month's
  income, money out and difference.

**Two things the Overview says plainly, because they would otherwise mislead**

1. **The target is too low.** It covers bills only. Staff daily rates arrive in
   Phase 3, so payroll is not in it yet.
2. **Today's figure is sales, not profit.** Material costs are not tracked until
   Phase 5, so ₱5,000 of tarpaulin sales that used ₱2,000 of vinyl still counts
   as ₱5,000. The specification asked for exactly this labelling (12.3).
   *Phase 5 fixed this: the Overview now measures profit.*

**How it is verified**

| What | How | Result |
|---|---|---|
| Money, dates, bill status, loan maths, ledger rules, target | `npm test` | 184 tests |
| Security and money guarantees against a real PostgreSQL | `npm run test:rls` | 68 checks |
| Every table and column the app asks for exists | `npm run check:schema` | 11 tables, 214 columns |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

The checks worth knowing about:

- **Marking a bill paid is one transaction.** It writes the payment, the ledger
  entry and the loan payment together. A test proves that a refused double
  payment leaves **no** half-finished ledger entry behind — which would
  otherwise mean the books showing ₱33,250 leaving the bank while the loan
  balance never moved.
- **Undo is honest.** It voids the ledger entry (money records are never
  erased) but *removes* the loan payment, because that payment is a claim the
  balance went down, and that claim is no longer true. Leaving it would
  understate the debt.
- **Staff see nothing of the money.** Not the bills, not the loans, not the
  ledger, not even a row count — tested from a staff account, a deactivated
  account and a signed-out visitor.
- **Dates are Manila dates.** At 01:30 on 1 October in San Carlos City it is
  still 17:30 on 30 September in UTC. A bill checked against the UTC date would look
  overdue a day early, every month. Tested directly.
- **A bill due on the 31st still falls due in February**, landing on the 28th
  (or the 29th in a leap year) rather than being skipped.

**Not verified here** — the sign-in round trip and the live database still need
a real Supabase project. The screens were checked by rendering them against
fixture data in a throwaway copy of the project, which caught two layout
problems; the real tree carries no fixture code.

**How to check it**

```bash
npm install
npm test          # expect: 184 passed
npm run dev
```

Then, with Supabase connected and **all three** migration files run:

1. Open **Bills**. You should see your eleven bills, ₱141,127.00 in total, with
   six or seven of them flagged **⚠ Due day not set**.
2. **Fill in the due days.** This is the one thing the system cannot do for you,
   and without it the reminders cannot work.
3. Mark one bill paid, then check **Money in/out** — the entry should be there
   already, marked Automatic. Then **Undo** it and confirm the entry is voided
   rather than gone.
4. Mark the **BPI** bill paid and open **Loans**: the BPI balance should drop by
   ₱33,250. Undo it and confirm the balance goes back up.
5. Enter the interest rate for **Credit card 3** from your statement. If it is
   around 3%, the loan should immediately show **⚠ Balance growing** and *Never
   at this payment* — because ₱12,000 a month against ₱15,000 of interest never
   clears it.
6. Open the **Home** screen and check today's target reads
   ₱141,127.00 ÷ 26 days.

---

## Phase 3 — Staff, attendance, payroll ✅

**Built**

*Staff (spec 13.1)*
- Employee records with position, contact, address, emergency contact, start
  date, divisions and **daily rate**.
- **A login is optional.** An employee and an account are two different things:
  someone who only taps the time clock has a staff record and no login at all.
  That is why `staff` is its own table rather than more columns on `profiles`.
- Logins and permissions moved to their own **Accounts** screen, so "staff"
  means the people you employ and "accounts" means who can sign in.
- Deactivating keeps every record; nothing is deleted.

*Time clock (spec 13.2)*
- Tap your name to time in and out, with a confirmation step.
- Who is currently in, and today's log with hours, **⚠ Late** and
  **⚠ No time out** flags.
- Owner/Admin can correct or remove a shift, written to the audit log with the
  old and new times.
- One shift per person per day, enforced by the database, so pressing Time in
  twice is harmless.

*Weekly payroll (spec 13.3)*
- A table of the seven days with time in/out, hours, and the owner's choice of
  **Full day / Half day / Absent**.
- **A half day pays half the daily rate** — the owner's answer to open decision
  17.6.
- Overtime is the owner's choice per day: the hours are recorded either way,
  and leaving the OT pay blank pays nothing.
- Bonus line, cash advance deduction, gross and net.
- **Mark paid** records the wages leaving the shop and locks the week. Only the
  owner can unlock it, and must give a reason.
- Printable payslip with a signature line. Past weeks are kept with the rate
  that was actually paid.

*Cash advances (spec 13.4)*
- Recorded with the money leaving the shop on the day it is handed over.
- Running balance per person, and a shop-wide total on the Overview.
- On payday the owner chooses how much to take; the rest carries over.

*The daily target now includes wages*
Each active staff member's daily rate × the working days in a month is added to
the bills. While anyone still has no rate, the Overview says the target is short
rather than pretending wages cost nothing.

**Three rules the money depends on**

1. **The rate is copied onto the week, not looked up.** Giving someone a raise
   must not rewrite what they were paid last month.
2. **A deduction never takes net pay below zero.** Whatever will not fit stays
   owed for next payday, and the owner is told.
3. **A paid week is locked by the database, not the app.** The update policy
   only matches draft weeks, so a paid week cannot be edited at all — and
   `unlock_payroll_week` is the single sanctioned way past it.

**How it is verified**

| What | How | Result |
|---|---|---|
| Money, dates, payroll, attendance, half days, advances | `npm test` | 234 tests |
| Security and money guarantees against a real PostgreSQL | `npm run test:rls` | 106 checks |
| Every table and column the app asks for exists | `npm run check:schema` | 17 tables, 336 columns |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

What the database tests prove, rather than assert in a comment:

- A staff member sees **their own** employee record, attendance, payslips and
  advance balance — and not one colleague's wage, address or emergency contact.
- Staff cannot raise their own daily rate, give themselves an advance, or create
  a payroll week.
- Staff cannot rewrite a finished shift to add hours.
- An inactive staff member cannot be clocked in.
- A paid week cannot be rewritten, its days cannot be changed, and it cannot be
  deleted. An admin cannot unlock it; only the owner, and only with a reason.
- Unlocking **voids** the wages ledger entry but **removes** the advance
  repayment — because the repayment claims the balance owed went down, and if
  the wages were not really paid, it did not.

**Three real bugs these checks caught**, worth recording because none would
have been obvious from reading the code:

1. The time clock policy checked "is this person active?" with a sub-query
   against `staff` — which is itself row-protected, so a staff member could not
   clock in a colleague they cannot *see*. Fixed with a `SECURITY DEFINER`
   helper.
2. The paid-week lock worked so well it blocked the unlock function too. That
   function is now `SECURITY DEFINER` with its own owner check, making it the
   one sanctioned way past the lock rather than loosening the policy.
3. The payslip worked out "Day pay" by subtracting from the stored total, so it
   could print a figure that did not match its own rows. It now adds up the rows
   it prints, and says so out loud if the stored total disagrees.

Plus one found by looking at the printed page: the print styles hid every
`<header>`, including the payslip's own — printing a slip with no shop name, no
week and no staff name on it.

**Not verified here** — signing in and the live database still need a real
Supabase project. The screens were checked by rendering them against fixture
data in a throwaway copy; the real tree carries no fixture code.

**How to check it**

```bash
npm install
npm test          # expect: 234 passed
npm run dev
```

With Supabase connected and **all four** migrations run:

1. Open **Staff** and add each person with their **daily rate**. Leave the
   login blank for anyone who only uses the time clock.
2. Open **Home**: the daily target should now include wages, not just bills.
3. Open **Time clock**, tap a name to time in, then time out. Check the log
   shows the hours, and a **⚠ Late** flag if they arrived after opening time.
4. Open **Payroll**, pick the week, and check the days were filled in from the
   time clock. Set one day to **Half day** and confirm it pays exactly half.
5. Give someone a cash advance on the **Staff** screen, then deduct part of it
   on their payslip and confirm the balance carries the rest over.
6. **Mark paid**, open the payslip, and print it (Ctrl+P). Then try to change
   the week — it should be locked.
7. As the owner, unlock it with a reason, and check **Money in/out**: the wages
   entry should be voided rather than gone.

---

## Phase 4 — Customers and the Dabz Printshoppe POS ✅

> **Note, 19 September 2026.** The seeded counter buttons described below were
> cleared at the owner's request — see
> [the catalogue is yours to enter](#19-september-2026--the-catalogue-is-yours-to-enter)
> at the end of this file. The counter itself is unchanged, and its **New
> product** step still adds an item that has no button.

Also in this phase: the time clock was tightened so **each person clocks only
themselves in** (open decision 17.2, answered).

**Built**

*The counter (spec 6, 7)*
- Preset buttons for everything the owner priced: black & white ₱3, the four
  colour tiers, photocopy ₱3.
- **A sale always starts blank.** Tapping a button opens a small box to confirm
  the quantity — and the price, where there is not a fixed one — before
  anything is added.
- The **tarpaulin calculator** beside the counter: width × height, a rate of
  ₱30 / ₱25 / ₱20 / ₱15, and **Add to sale**. It also works as a quote on its
  own, without adding anything.
- **+ New product** for something not on a button, with "save this to my
  product list".
- Discount as **₱ or %** on the whole sale, inside the limits already in
  Settings. Staff without the discount permission do not see it.
- Cash / GCash / **Maya** / Bank, with a reference number for the non-cash ones
  and change worked out as you type.
- **Complete sale & print** → the screen clears and offers the receipt.

*Customers (spec 5)*
- One shared list for all three divisions, with purchase history.
- The customer pop-up at the counter: search, add new, or **skip — walk-in**.

*Receipts*
- Printable, narrow, black on white. The paper is a **setting** — 58mm thermal
  by default, with 80mm and short bond also supported.
- Every figure is added up from the lines printed on it, so a customer can
  check it by hand.

*Voids (spec 4.4)*
- Staff can **add** a sale but never edit or delete one. They ask; the owner or
  an admin decides. Approving voids the sale **and** its takings, so the day's
  figures stop counting money that was handed back. The sale row stays, marked
  — the customer may still be holding the receipt.

*End of day (spec 15.2)*
- Cash sales less cash paid out = what should be in the drawer; staff count it;
  the difference is shown with a ⚠ if it is not zero. GCash, Maya and bank
  totals, and whether the target was reached.

*Products*
- Prices, groups and **bulk discounts** — quantity tiers like "from 50 up,
  ₱2.50 each". The mechanism is built; **no rules were invented**.

**What I decided, and how to change it**

The owner asked me to decide rather than ask, so these are my calls — all
recorded in [DECISIONS.md](DECISIONS.md) with how to change each one:

| Decision | Change it |
|---|---|
| 58mm thermal receipts by default | **Settings → Receipt paper** |
| Colour tiers named by ink coverage (light / medium / heavy / full page) | Rename on **Products** |
| Maya added as a payment method | Tell me to add another |
| Bulk pricing mechanism, no rules | Add tiers per product on **Products** |

**Prices I did not invent.** Lamination, stickers, mugs, souvenirs and DTF
prints have **no price** — the counter asks for the amount each time, and both
the counter and the Products screen say why. A wrong price on a real sale is
worse than a question.

**How it is verified**

| What | How | Result |
|---|---|---|
| Money, dates, payroll, POS pricing, the closing | `npm test` | 270 tests |
| Security and money guarantees against a real PostgreSQL | `npm run test:rls` | 140 checks |
| Every table and column the app asks for exists | `npm run check:schema` | 24 tables, 440 columns |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

What the database checks prove:

- A staff member can ring up a sale but **cannot edit, delete or void one** —
  they ask, and the owner decides.
- A staff member without the selling permission cannot ring one up at all, and
  sees only the sales they made themselves.
- Staff can save a new product from the counter but cannot **change a price** or
  remove a product.
- Voiding marks the sale and voids its takings; it never deletes either, and a
  sale cannot be voided twice.
- The database refuses figures that do not add up: a total that is not subtotal
  less discount, a line total that is not price × quantity, or change recorded
  on a non-cash sale.
- A day can only be closed once.
- Each person clocks only themselves in; an admin can still record for someone
  else, as a logged correction.

**Two bugs these checks caught**

1. **Selling could not reach the ledger.** The ledger is Owner/Admin only and
   should stay that way — but every sale has to record its takings there.
   `complete_sale` is now `SECURITY DEFINER` and checks the selling permission
   itself, making it the one sanctioned path rather than opening the ledger to
   staff.
2. The time-clock policy's "is this person active?" check failed for exactly
   the people it was meant to allow, because a policy sub-query is subject to
   RLS too.

Plus two found by looking at the rendered pages: the receipt printed "Cash"
twice, and the navigation bar had grown to fifteen items in build order rather
than daily-use order.

**How to check it**

```bash
npm install
npm test          # expect: 270 passed
npm run dev
```

With Supabase connected and **all six** migrations run:

1. Open **Counter**. Tap *Print, black & white*, enter 12, add it. Tap
   *Print, colored - full page*, enter 3. Use the tarpaulin calculator for
   3 × 5 ft and add that. The subtotal should read **₱531.00**.
2. Give 10% discount → **₱477.90**. Enter ₱500 given → change **₱22.10**.
3. Complete the sale, then print the receipt and check the arithmetic by hand.
4. Open **Money in/out**: the takings should already be there, split by
   division.
5. Sign in as a staff member without the void permission, ring up a sale, and
   try to undo it — you should only be able to *ask*. Approve it as yourself
   and check the takings disappear from the day.
6. Open **End of day**, count the drawer, and see the difference.
7. Set a price for **Lamination** on Products and watch it become a fixed
   button.

---

## Added after Phase 4, at the owner's request

**Everything is filled in while the system runs.** A new **To fill in** screen
lists every figure still missing — bill due days, loan interest rates, staff
daily rates, product prices, staff without a login — with the names, why each
one matters, and a link straight to the screen that sets it. A quiet strip on
the Home screen shows how many are left. It also names the things the system
cannot detect: the rest of the debt, the real shop hours and payday, bulk
discount rules, what "Magic Payment" and "Forests Lake" are, and the one-colour
logo files.

**Desktop, tablet and phone.** Every screen is verified at four widths — 390px
phone, 768px tablet portrait, 1024px tablet landscape, 1440px desktop — with
an automated check for horizontal overflow and page errors on each of the
sixteen screens, at each size. The counter gained a fixed bar at the bottom on
tablet and phone, holding the running total and **Review & pay**, so the two
things that matter at the till are always in reach without scrolling.

---

## Phase 5 — Expenses, stocks and supplier payables ✅

**Built**

*The expense pop-up (spec 11)*
- A **+ Expense** button in the top bar of every screen, because the
  specification asks for under ten seconds per entry and walking to a screen
  first does not fit in ten seconds.
- **Eight quick picks**, seeded from the specification's own expense
  categories. A quick pick already knows what the money was for and which
  division it belongs to, so the only thing that always has to be typed is the
  amount. Rename them to what you actually buy and it gets faster still.
- The category, division and payment method are folded away **below** the
  button, with a line showing what will be saved. On a phone they would
  otherwise push "Record expense" off the bottom of the screen, for a choice
  the quick pick had already made correctly.
- **No usual amounts were invented.** Every quick pick asks. Fill one in only
  where it really is always the same.
- **A staff expense above the Settings limit waits for you**, and until you
  approve it **no money has moved anywhere in the system** — a check constraint
  in the database enforces that a waiting expense has no ledger entry at all.
  Refusing one leaves no money trace either.
- The limit is read inside the database function, never sent by the browser, so
  a staff member cannot send a larger limit along with their expense.

*Stocks (spec 14)*
- Materials with a unit you choose (ream, litre, piece, pack), a division, an
  optional reorder level and an optional price.
- **A stock level is never stored.** It is added up from every delivery and
  withdrawal, so the number on the screen can always be explained by the
  history under it. A stored figure and a movement list can disagree, and then
  nothing says which is lying.
- Quantities are whole thousandths of a unit, for the same reason money is
  whole centavos: a level built from hundreds of movements must not drift. A
  test adds a tenth of a ream two hundred times and expects exactly zero.
- **Received**, **Took out** and **Counted the shelf**, per material. A count
  asks only for what you can see and writes the **difference** as its own
  movement — overwriting the level would hide the loss, and a loss is the
  reason you count.
- A movement is **append-only**. A wrong one is answered with an opposite
  correction, never erased, exactly as a ledger entry is voided.
- Low-stock and out-of-stock warnings, on the Stocks screen and the Overview.
  A material with no reorder level says so rather than being assumed fine.
- The value of everything on the shelf, with unpriced materials **counted and
  left out** rather than valued at zero.

*Supplier payables (spec 11)*
- Receiving a delivery "on account" raises a payable by itself, with the cost
  worked out from the quantity and the unit price in the same transaction.
- Marking one paid writes the ledger entry and marks it paid **together**, and
  a paid payable can never be edited again — the update policy only matches an
  unpaid row.
- Owner/Admin only, with no staff-facing policy at all. It is debt, in the same
  class as bills and loans (spec 4.3). Staff can create one by receiving stock;
  they just cannot see the list.
- A payable with **no due date** is a real state, shown with a warning. The
  supplier may genuinely not have given a term.

*The daily target finally measures profit (spec 12.3)*
- The Overview now shows **income less today's materials and running costs**
  against the target, with the two figures underneath it.
- Today's bills, loan payments, wages and cash advances are **not** subtracted,
  because the target exists to pay for exactly those — taking them off as well
  would count them twice and the shop would look as though it never got
  anywhere.
- ₱5,000 of tarpaulin sales that used ₱2,000 of vinyl is ₱3,000 toward the
  target. That is the number that was always meant, and until now the screen
  showed ₱5,000.

**How it is verified**

| What | How | Result |
|---|---|---|
| Quantities, costs, stock levels, expense limits, payable dates | `npm test` | 339 tests |
| The security rules, against a real PostgreSQL | `npm run test:rls` | 169 checks |
| That every table and column the app asks for exists | `npm run check:schema` | 30 tables, 492 columns |
| Every screen at 390 / 768 / 1024 / 1440, and every pop-up fully on screen | headless browser | 22 screens × 4 sizes |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

The database tests worth knowing about prove, against a real PostgreSQL:

- a staff expense one centavo above the limit is held, and leaves **no ledger
  entry** — while one exactly at the limit goes straight through;
- a staff member cannot approve their own expense, nor reach the table to do it
  another way;
- refusing an expense leaves no money trace at all;
- a stock level equals the sum of its movements, and a movement can be neither
  edited nor deleted;
- 2.5 reams at ₱240.00 comes to exactly ₱600.00, in the database and in the app;
- a payable cannot be paid twice, and a paid one can never be edited;
- a refused delivery leaves behind no movement AND no expense.

**How to check it**

```bash
npm install
npm test          # expect: 339 passed
npm run dev
```

Run `supabase/migrations/0006_phase5_expenses_stocks.sql` in the Supabase SQL
editor first. Then:

1. Press **+ Expense** in the top bar. Tap **Meals & snacks**, type an amount,
   press Record expense. It should take about five seconds.
2. Open **Money in/out** and confirm the entry is there.
3. Open **Stocks** and add a material — say Bond paper A4, counted in reams.
   Leave the reorder level and price empty for now.
4. Press **Received**, enter 20 and a price, leave it on "Paid now". Check
   **Money in/out**: the purchase is there. Check **Stocks**: 20 reams.
5. Press **Received** again, choose **On account**, and look at **Owed to
   suppliers**.
6. Press **Counted the shelf** and type a smaller number than it shows. The
   difference is recorded as its own movement rather than quietly overwriting.
7. Set a reorder level above what is on the shelf and confirm the warning
   appears on the Overview.
8. Sign in as a staff member with **Record expenses** ticked, record something
   above the limit in Settings, then sign back in as yourself: it is waiting on
   the Expenses screen, and **not** yet in Money in/out.

---

## Phase 6 — Dabz Apparel job orders ✅

**Built**

*The job order (spec 8)*
- An order per team, numbered `A-260918-001`, with the customer optionally
  linked to their record so their number is one tap away.
- Six steps: **Quoted → Confirmed → Layout approved → In production → Ready for
  pickup → Released**, plus Cancelled. "Layout approved" is its own step
  because a sublimation order stalls there more than anywhere else, waiting on
  the customer to say yes to the design — and "in production" would hide that.
- Going **back** a step is a button too. A layout gets rejected after approval;
  pretending otherwise means the screen stops matching the shop.
- A **promised date** that may be left empty, with the order warning as the
  date approaches and counting the days once it has passed.

*The name list — the heart of a jersey order*
- Players are **pasted in one go**, one per line: `name, number, size`. A team
  captain sends a list; typing fifteen names into fifteen little forms is how a
  shop ends up keeping the list on paper instead.
- **The list is the quantity.** Fifteen names means fifteen jerseys. A typed
  quantity is used only when there is no list — 50 plain shirts, no names.
- Each name carries its own size add-on, **copied at the moment it is added**.
  Raising the 2XL surcharge next month never rewrites a quote the customer
  already agreed to; a test proves it, and so does a database check.

*Money (spec 8, 10.1)*
- A down payment and any number of later payments. The **balance is always
  total less payments** — never typed, never stored.
- A payment is **split across the income categories in the order** — jerseys
  and jackets keep their own books — and the parts add back up to the payment
  exactly. The database refuses any split that does not.
- The split is worked out on the **server**, from the order's own lines, never
  from anything the browser sent.
- A payment is **voided, never deleted**, and its takings are voided with it.
  Staff may take a payment; only Owner/Admin may void one.
- **Releasing with money still owed is allowed** and said out loud. A shop does
  let a regular take the jerseys — and the order stays on the list until the
  balance is paid, because an order that disappears is an order nobody chases.

*The printed job order sheet*
- One copy for production, one for the customer. It carries the **whole name
  list**, because production needs every size and the customer needs to check
  their own spelling before anything is printed on a shirt.
- Every figure on it is **added up from the rows printed above it** — the same
  rule as a payslip and a receipt.

*Prices, all of them empty*
- The five items from your own list, the size ladder XS–5XL, and the fabric and
  collar lists are all there with **no amounts at all**.
- An order works anyway: whoever writes one is asked for the price, and the
  screen marks any line nobody has priced. Filling the list in only makes it
  faster and stops two people quoting the same jersey differently.

**How it is verified**

| What | How | Result |
|---|---|---|
| Line totals, size add-ons, balances, down payments, payment splits | `npm test` | 372 tests |
| The security rules, against a real PostgreSQL | `npm run test:rls` | 194 checks |
| That every table and column the app asks for exists | `npm run check:schema` | 37 tables, 568 columns |
| Every screen at 390 / 768 / 1024 / 1440, every pop-up fully on screen | headless browser | 27 screens × 4 sizes |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

The database tests worth knowing about prove, against a real PostgreSQL:

- three jerseys with one 2XL come to exactly ₱2,000.00, from the rows alone;
- raising the 2XL surcharge afterwards does **not** change that order;
- a payment cannot be written straight to the table — only through the function,
  which checks the permission itself;
- a split that does not add up to the payment is refused outright;
- voiding a payment voids its takings too, and cannot be done twice;
- a job order cannot be deleted, and a cancelled one cannot take more money;
- job orders and payments are invisible to staff without the permission, while
  the price list is readable by anyone signed in.

**How to check it**

```bash
npm install
npm test          # expect: 372 passed
npm run dev
```

Run `supabase/migrations/0007_phase6_apparel.sql` in the Supabase SQL editor
first. Then:

1. Open **Apparel** and press **New job order**. Give it a team name.
2. Press **Add an item**, choose Sublimation jersey set, and type a price —
   it will ask, because nothing is priced yet.
3. Press **Add names and sizes** and paste a few lines:
   `Dela Cruz, 7, M` / `Santos, 23, 2XL`. The total follows the names.
4. Open **Apparel → Set the apparel prices**, give 2XL an add-on, then go back:
   the order you already wrote is **unchanged**. Add one more name and it picks
   the new add-on up.
5. Press **Take a payment** for part of the total, and check **Money in/out**:
   the takings are there, tagged to Dabz Apparel.
6. Press **Print the job order** and check the name list and the arithmetic.
7. Move it through to **Released** while a balance is still owed — it says so,
   and stays on the list.

---

## Phase 7 — DabzTech Solutions repair tickets ✅

**Built**

*The thing that is not there*

There is **no password field anywhere in this system**. Spec 9.3 says the shop
does not keep laptop passwords, so there is no box for one — not encrypted, not
"temporarily", not in a note field called something else. A box that exists
gets filled in, and a customer's password written down in a shop database is a
liability you cannot insure against.

A database test reads the schema and **fails if any column with a
password-shaped name ever appears**. What a ticket records instead is how the
technician gets in: the customer unlocks it, it arrived unlocked, or it needs
no unlocking. The claim stub tells the customer the same thing, in writing.

*Taking a unit in (spec 9.1)*
- Epson printers, laptops and desktop PCs — the database refuses anything else.
- Brand, model and serial number; **what came with it** (charger, bag, cable)
  and **what it looked like on arrival**. Those two are the ones an argument
  later turns on, and they are only useful if written down on the day.
- The problem in **the customer's own words**, kept separate from what you
  found when you opened it.
- A promised date that may be left empty, because not every repair gets one
  promised on the spot.

*Where a ticket has got to (spec 9.2)*
- Received → Being checked → Quoted → Being repaired → Ready for pickup →
  Released, and back a step when a "fixed" unit comes off the bench again.
- Two refusals: **customer said no** and **cannot be repaired**, each needing a
  reason. Both leave the unit **in the shop** — that is exactly the pile that
  grows in the corner — so they count toward the unclaimed warning.
- A quoted ticket says out loud that it is **waiting on the customer**. It is
  the state a job sits in longest and the one nobody chases.

*What is charged (spec 9.2)*
- The checking fee, the work and the parts, added up from the rows. Never
  stored, so the total cannot disagree with the ticket.
- The **checking fee is kept separate** in the totals, because it is the one
  charge that applies even when the customer says no to the repair.
- **Fitting a part takes it off the shelf in the same transaction.** Phase 5's
  stock and Phase 7's repairs are the same shelf, and the charge and the stock
  movement point at each other. Removing the charge later does *not* put the
  part back — it did leave; a return is a delivery somebody records on Stocks.

*Money*
- Payments split across the checking fee, the labour and the parts, so each
  keeps its own books, and the parts add back up to the payment exactly.
- The split is worked out on the **server** from the ticket's own lines, and
  the database refuses one that does not add up.
- Voided, never deleted, with the takings voided alongside. Technicians take
  payments; only Owner/Admin void them.

*The warranty — "The Fix That Lasts" (spec 9.3)*
- Copied onto the ticket **at the moment of release**, from Settings as it
  stands that day. Shortening the shop warranty next year does not quietly
  cancel a promise already made; a database test proves it.
- The screen and the claim stub both say whether the promise still holds, and
  until when.

*Units left behind (spec 9.4)*
- Counted from the day the unit was **ready**, not the day it arrived — a
  repair that took three weeks is not an abandoned unit.
- Flagged on the repairs screen and the Overview once it passes the number of
  days in Settings. What you then do about them is your call; the system only
  makes sure you know they are there.

*The claim stub*
- The customer walks out with it and comes back holding it, so it carries what
  was brought in, what came with it, what it looked like, the charges, the
  balance, the warranty — and the line saying the shop does not keep passwords.

**How it is verified**

| What | How | Result |
|---|---|---|
| Totals, payment splits, warranty dates, unclaimed counts | `npm test` | 408 tests |
| The security rules, against a real PostgreSQL | `npm run test:rls` | 218 checks |
| That every table and column the app asks for exists | `npm run check:schema` | 41 tables, 613 columns |
| Every screen at 390 / 768 / 1024 / 1440, every pop-up on screen | headless browser | 32 screens × 4 sizes |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

The database tests worth knowing about prove, against a real PostgreSQL:

- **no repair table has a column that could hold a password**, and the unlock
  method is one of three fixed answers rather than free text;
- DabzTech accepts Epson printers, laptops and desktops and refuses the rest;
- fitting two of a part takes exactly two off the shelf, and the charge points
  at the stock movement;
- a refused part leaves behind neither a charge nor a stock movement;
- a released unit must record when it went, and **shortening the shop warranty
  afterwards does not change a ticket already released**;
- a payment cannot be written straight to the table, and a split that does not
  add up is refused;
- a ticket cannot be deleted — the customer holds the stub.

**How to check it**

```bash
npm install
npm test          # expect: 408 passed
npm run dev
```

Run `supabase/migrations/0008_phase7_repairs.sql` in the Supabase SQL editor
first. Then:

1. Open **Repairs** and press **Take a unit in**. Note there is nowhere to type
   a password — the question is *how do we get into it*, and the answers are
   fixed.
2. Add the checking fee and a service. It will ask for the price, because
   nothing is priced yet.
3. Press **Fit a part**, choose something from stock, and check **Stocks**: the
   shelf went down by what you fitted.
4. Take a payment, then look at **Money in/out**: it is split across the fee,
   the work and the part, all tagged to DabzTech.
5. Move it to **Ready**, then **Release** it. The warranty is written onto the
   ticket.
6. Change the warranty in **Settings** to 7 days and go back: the released
   ticket **still says 30**. Release another one and it gets 7.
7. Press **Print the claim stub** and read the last box on it.

---

## Phase 8 — Reports ✅

**Built**

Reports come last because they invent nothing. Every figure is a sum over rows
the earlier phases already write, which is why this phase added **no database
migration at all** — there is no report table, no nightly job and nothing to
rebuild. A report is computed the moment you open it, so it can never fall out
of step with the screens it came from.

*The period*
- Today, this week, this month, last month, this year.
- The week honours your **week start** setting; "this month" ends **today**,
  not at month end, so half a month is not shown as a whole one.

*The money*
- Income, shop expenses and **profit**, each compared with the **same length of
  time immediately before** — eleven days of this month against the eleven days
  before them. Comparing eleven days with a whole month would make every month
  look like a collapse until the last day.
- A percentage against zero is **never given**: "up 100%" from nothing is
  meaningless, so it says "nothing to compare with" instead.
- Borrowed money, owner capital and owner withdrawals are shown **separately
  and out of the profit figure**, with a line saying why. A month where
  ₱100,000 was borrowed is not a month where ₱100,000 was earned.

*Where it came from and where it went*
- Income split by division, and each division split into its own categories,
  biggest first, with a bar for the share.
- Expenses by category, and underneath, how much of it was the **cost of doing
  the work** — materials, fuel, meals — as opposed to the bills and wages your
  daily target already exists to cover.
- Percentages are rounded and **not forced to total 100**, because forcing them
  would mean printing a share the money does not make. A test asserts the
  amounts add back up exactly, and the screen says so in plain words.
- A category rounding below half a percent shows **&lt;1%**, never "0%" — a
  zero beside money that was actually spent reads as a bug in the report.

*Where the shop stands today*
- Owed **to** you: unpaid apparel job orders and repair tickets.
- Owed **by** you: bills left this month, loans, suppliers.
- Materials on the shelves, with anything unpriced counted and left out rather
  than valued at zero.
- Deliberately outside the period figures, with a line saying why: money you
  are owed was already counted as income when the work was done, so adding it
  to a month's income would count it twice.

*Taking it away*
- **Print** — black on white, laid out for A4, for an accountant or a folder.
- **Download as a spreadsheet** — a CSV with plain numbers, no peso signs and
  no thousands separators, so a spreadsheet reads them as numbers. Every field
  is quoted, so a comma in a label cannot split a row.
- The download is a route handler, and it **re-checks who is asking** exactly
  as a screen does: a URL is a public endpoint whether or not anyone linked
  to it.

*Who can see it*
- Full reports are **Owner/Admin only** and cannot be granted to staff
  (spec 4.3). A staff member's own day's takings are already on the Sales
  screen, where Row Level Security decides which sales they see.

**How it is verified**

| What | How | Result |
|---|---|---|
| Ranges, comparisons, shares, CSV escaping, profit rules | `npm test` | 444 tests |
| The security rules, against a real PostgreSQL | `npm run test:rls` | 218 checks |
| That every table and column the app asks for exists | `npm run check:schema` | 41 tables |
| Every screen at 390 / 768 / 1024 / 1440, every pop-up on screen | headless browser | 36 screens × 4 sizes |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

No new security tests were needed, and that is the point: reports read the
ledger, and the ledger's rules were proved in Phase 2. Nothing new was opened.

**How to check it**

```bash
npm install
npm test          # expect: 444 passed
npm run dev
```

No migration to run. Then:

1. Open **Reports**. It starts on this month.
2. Try **Last month** and **This year** — the comparison line under each figure
   changes with the period.
3. Check that borrowed money is in its own box and **not** in the profit.
4. Press **Download as a spreadsheet** and open the file. The amounts should be
   numbers your spreadsheet can add up, not text.
5. Press **Print** and check the sheet against the screen — they are built from
   the same sums.

---

## Phase 9 — The public page and customer messages ✅

**Built**

The front door. Until now every screen needed a sign-in; this phase adds the
one page a customer sees, and the one thing a stranger may send into the
system.

*The public page, at `/`*
- Built from the **same price lists the counter uses** — Products, apparel
  items and repair services. Change a price on the Products screen and the
  public page changes with it. It cannot quietly go out of date the way a
  hand-written page does.
- Anything you have not priced is still listed, and says **"ask us"** instead
  of a number.
- A repair service shows which machine it is for — "Cleaning & repaste
  (laptop)" and "(desktop pc)" — because the same service can be priced per
  machine, and two identical lines at two prices look like a mistake.
- Your address, phone, opening hours, Facebook page and Messenger name are
  **settings, and all start empty**. Whatever you have not filled in is simply
  left out. Nothing is invented: a made-up address on a page a real person
  might drive to is a different order of mistake from a made-up figure on an
  internal screen. What is missing appears on **To fill in**, not on the page
  itself — a customer should never read a note addressed to you.
- A **Show the public page** switch in Settings takes it down without deleting
  anything. Staff sign-in is unaffected either way.
- The owner's home moved from `/` to **`/overview`**. Signing in still lands
  you there.

*Messages from customers*
- A short form — name, phone or email, what it is about, the message — and
  one optional question: **how did you hear about us?**
- A new **Messages** screen, Owner/Admin only, lists what came in, links the
  phone number so it dials from the counter, and lets you record that you
  answered and what you said. **The system does not send the reply**: you
  answer on Messenger, by text or by phone, wherever they wrote from. A system
  that pretended to send mail from an account the shop has not set up would
  leave a customer waiting for something that never left.
- The Overview shows a card the moment anything is waiting.

**What was NOT built, and why**

The Messenger API, Meta Ads tracking and a chatbot all need a **Meta app, a
page access token and Meta's own app review**. Those are credentials that
belong to you — they are tied to your Facebook page and your identity — and
no system should create them on your behalf. So the credential-free half was
built instead, and it does the same job:

| Asked for | Needs a Meta app | Built instead |
|---|---|---|
| Messenger integration | yes | A **Message us** button that opens Messenger at your page |
| Meta Ads tracking | yes | **"How did you hear about us?"**, counted on the Messages screen |
| A chatbot | yes | The enquiry form, which reaches a person |
| Push notifications | a paid service | The Overview card and the Messages count |

The "how did you hear about us" answer is worse than a tracking pixel at
counting and better at telling the truth — a pixel cannot tell you somebody
came because their cousin recommended you.

**The one public write in the system**

Every other write in this system starts with somebody signed in. This one
starts with whoever found the page, so it is fenced deliberately:

- `enquiries` has **no insert policy at all** — not for the public, not for
  staff, not for the owner. There is no way in from a browser.
- The one way in is a Server Action that checks every field, caps every
  length, silently drops anything filling a **honeypot** field no person can
  see, and refuses more than five messages an hour from one address. Only then
  does it write, with the service-role key — the same permission sign-in
  itself uses, for the same reason: nobody is signed in yet.
- An enquiry carries a stranger's name and phone number, so **staff cannot read
  one**. It sits with bills and payroll, not behind a staff checkbox.
- There is no delete policy either. An enquiry is closed, never erased, so "I
  messaged you last week" can be checked.

**How it is verified**

| What | How | Result |
|---|---|---|
| Field limits, the honeypot, the rate limit, the counts | `npm test` | 463 tests |
| The security rules, against a real PostgreSQL | `npm run test:rls` | 231 checks |
| That every table and column the app asks for exists | `npm run check:schema` | 42 tables |
| Every screen at 390 / 768 / 1024 / 1440, every pop-up on screen | headless browser | 36 screens × 4 sizes |
| That nothing tappable is under 24px | headless browser | 36 screens, then 15 again with every form opened |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

**One thing fixed everywhere while checking this**

Measuring the screens turned up a rule that had been quietly broken since
Phase 1. The design rules ask for a 24px touch target, and a bare underlined
link — *Open the bills screen*, *See every entry*, *Remove*, *Clear sale* — is
about 20px. There were about thirty of them, on nearly every screen.

They now all wear one shared padding from `src/components/ui.tsx`, so nothing
looks any different and everything is easier to hit. `npm test` fails if the
next one is added without it, which is the only part of this a test can see —
the 24px itself has to be measured in a browser.

**How to check it**

```bash
npm install
npm test          # expect: 463 passed
```

Run `supabase/migrations/0009_phase9_public.sql` against your project, then:

1. Open **Settings**, scroll to **Your public page**, and fill in your address,
   phone, opening hours, Facebook page and Messenger name. Save.
2. Open **/** signed out (a private window). Your details are there, the prices
   are the ones on your Products screen, and **Message us on Facebook** opens
   Messenger.
3. Clear one of those fields and load the page again — it disappears rather
   than being replaced by a placeholder. Check **To fill in**: it is listed
   there.
4. Send yourself a message from the form.
5. Sign in and open **Messages**. It is waiting, and the Overview says so.
   Press **Answer this**, write what you told them, and **Mark replied**.
6. Sign in as a staff member. **Messages** is not in their menu, and opening
   `/enquiries` by hand sends them back to the Overview.
7. Untick **Show the public page** in Settings and load **/** again: a short
   honest page, and staff sign-in still works.

---

## Fix — the "change your password" loop (19 Sep 2026)

**What you saw:** a new staff member or a new admin signed in with the
temporary password, typed a new one, and landed straight back on **Choose your
password**. Every time. Their password really was being changed each round,
which is why it looked like the new one kept being thrown away.

**What was wrong:** a new account is marked *must change password*, and every
screen bounces that person to the change screen until the mark is cleared. The
change screen cleared it with an ordinary write to their own account row — but
the security rules never allowed anybody to edit their own row. The owner can
edit anyone, an admin can edit **staff**, and that is the whole list. A staff
member is not on it. Nor is an admin editing themselves: their own row is an
admin row, not a staff row.

The part that made it silent: when the security rules refuse a write like that,
PostgreSQL does not complain — it just changes nothing. So the system believed
the mark was cleared, sent the person to the Overview, read the mark again, and
sent them back. Round and round.

The owner never hit it because the owner account is created with the mark
already off, so the one account used to test everything was the one account the
bug could not touch.

**What was done:** the mark is now cleared by a database function,
`finish_password_change()`, which can only ever touch the person calling it and
can only ever change that one true/false. The account table stays shut to
self-editing, so this does not become a way for a staff member to promote
themselves — a new security test proves both halves. And if the change ever
fails again, the screen now says so instead of quietly sending you round the
loop.

**How to check it**

```bash
npm install
npm test          # expect: 463 passed
npm run test:rls  # expect: 239 checks (231 before this fix, plus its 8)
npm run db:push   # applies 0010_finish_password_change.sql
```

`npm run db:push` is the important one — the fix is in the database, so the
app on its own will not clear it. Until you run it, the change screen says so
and names the command.

Then:

1. On **Accounts**, create a staff account and write down the temporary
   password. Do the same for an admin account.
2. Sign in as the staff member. You are asked to choose a password.
3. Choose one. You land on the **Overview** — not back on the same screen.
4. Sign out, sign back in with the new password. Straight to the Overview.
5. Repeat with the admin account: that half was broken too, and is the half
   that was never covered by a test before.
6. Existing accounts already stuck in the loop need nothing special — the next
   time they choose a password it sticks.

---

## 19 September 2026 — the catalogue is yours to enter

**What you asked for:** clear the products, the loans and the bills so you can
add your own, and give me a way to edit or delete one already entered. Then:
clear the apparel and repair prices too.

**What was built**

*The three lists start empty.* Phase 2 shipped with 11 bills and 6 loans read
off the specification, and Phase 4 with 11 counter buttons. Migration
`0011_clear_catalogue_and_allow_delete.sql` removes all of them. It is a new
migration rather than an edit to the old ones, because a migration that has
already been applied must never be changed — and the useful side effect is
that a database built from scratch now ends up exactly where yours does:
empty, waiting for you.

*Edit is now a button.* It was always possible — the form was there — but the
way in was a line of small grey text that did not look like anything, which is
why it read as missing. Every bill, loan and product card now has a proper
**Edit** handle the same size and shape as the buttons beside it.

*Delete, with one limit.* A bill, loan or product that nothing has happened to
can be deleted outright. One that money has moved against cannot:

| The row | What you can do | Why |
|---|---|---|
| A bill never marked paid | **Delete** | Nothing refers to it |
| A bill marked paid in any month | **Stop counting** only | Its payments and their ledger entries would go with it |
| A loan with no payments | **Delete** | Nothing refers to it |
| A loan paid down at all | **Stop counting** only | Same — the money it recorded would vanish |
| A product never sold | **Delete** | Nothing refers to it |
| A product that has been sold | **Hide from the counter** only | It is part of what the shop has actually sold |

Stopping keeps every figure and takes the row out of the running totals, so
nothing is lost either way. The screen tells you which case you are in before
you press anything, and deleting asks once and names what it is about to
remove. Whatever is deleted is written to the audit log first, in full.

*Loans can be stopped.* They never could. A debt that was settled, or entered
twice, stayed in the total owed for good; now it can be set aside and brought
back.

*A target of zero says so.* With no bills entered the daily target is zero, and
the Overview used to show a green **✓ Reached** at the top of the screen before
a single sale of the day. Zero means "not known yet", so that is what it says
now — and the End of day screen no longer records a day as hitting a target
that was never set.

*The apparel and repair price lists too.* Asked for right after the first
round, and done the same way in `0012_clear_apparel_and_repair_prices.sql`:
the five apparel items and the twelve repair services are gone, with the same
Delete-or-stop rule on both screens. Two things came with it:

- **The apparel size ladder stays.** XS to 5XL are not a price list — they are
  the sizes a roster can use, they match the code, and the add-on beside each
  one is already blank. Deleting them would have removed the only place to
  type a surcharge.
- **The checking fee is now yours to name.** It is the one charge that applies
  even when a customer says no, and it used to arrive on a seeded row with no
  control anywhere — so clearing the list would have left the shop unable to
  have one at all. The service form has a tick box for it now, and only one
  service can carry it.

*A bill that says "loan installment" now really pays one down.* Found while
checking the above, and the most important fix here. That link only ever
existed on the seeded bills and no form could set it, so once the seeds were
cleared, every installment bill typed in by hand would have taken money out of
the ledger every month and left the debt exactly where it was — with nothing
on screen to say so. The bill form now asks which loan it pays down, the Bills
screen warns about any installment that has none, and a test marks a
hand-entered bill paid and checks the balance actually moved.

*Some smaller things the empty lists exposed:* the Overview's bills and loans
cards said "₱0.00 of ₱0.00 paid" and "Overdue: None" with nothing entered,
which reads as a settled month rather than an empty one; the End of day screen
would have shown "-₱500.00 short" against a target of zero; and the To fill in
screen still quoted figures from the old seeded data.

**How to check it**

```bash
npm install
npm test          # expect: 478 passed
npm run test:rls  # expect: 267 checks (239 before, plus 28 for the new rules)
npm run db:push   # applies 0011 and 0012
```

`npm run db:push` is the one that matters — the clearing happens in the
database, so nothing changes until it runs. It prints how many rows it removed
from each list, and how many it kept because they had already been used.

Then, in the app:

1. Open **Bills**, **Loans**, **Products**, **Apparel prices** and **Repair
   prices**. All five lists are empty and each says so, and **To fill in** now
   lists every one of them. The apparel **size add-ons** are still there, all
   blank — those are sizes, not prices.
2. Add a bill. Press **Edit or delete this bill** — the panel opens with the
   form and, at the bottom, **Stop counting** beside **Delete**.
3. Press **Delete**. It asks first, naming the bill. Cancel, then do it again
   and confirm; the bill goes.
4. Add another bill and mark it paid. Open the same panel: there is no Delete
   button now, and a line saying why and what to do instead.
5. Press **Undo** on the payment, and Delete comes back.
6. The same on **Loans** and on **Products** — a product that has been sold can
   only be hidden.
7. On **Repair prices**, add a service and tick **This is the checking fee**.
   Try to tick it on a second one: it refuses, and says why.
8. On **Loans**, add a loan. Then on **Bills** add one as a **Loan
   installment** and choose that loan. Mark it paid, and check the loan's
   balance actually drops. Leave another installment unlinked and the screen
   warns you, at the top and on the card.
9. Check **Activity**: every delete is there with the row it removed — and for
   a product, the bulk price rules that went with it.

---

## Added after Phase 9 — a printable payroll summary for any dates

**Built**

A new screen at **/payroll/summary**, reached by **Print payroll summary**
beside the heading on the Payroll screen, and Owner/Admin only like the rest of
payroll. Pick any two dates — or tap **This week**, **Last week**, **This
month**, **Last month** — and it prints one line per person: daily rate, days
paid, overtime, bonus, gross, cash advance taken off, net pay, whether it has
actually been handed over, and a line to sign on. It prints landscape, black on
white, with **Prepared by** and **Approved by** at the bottom.

The payslip answers *what does this person get this week?*. This answers *what
did wages cost me in September?*, which is a different question, because a
payroll week and a calendar month do not line up.

**The rule the whole thing turns on**

The week beginning Monday 28 September ends on Sunday 4 October, so a September
sheet and an October sheet both want a piece of it. So:

- **Day pay and overtime are counted day by day.** Only the days inside the
  dates are paid on that sheet.
- **The week's bonus and its cash advance deduction are counted whole**, on
  whichever sheet holds the week's **first day**. They are single figures for a
  whole week and there is no honest way to halve them — attaching them to the
  first day is what makes two sheets side by side count each one exactly once,
  never twice and never not at all.

A row whose weeks run past either end says **Includes part of a week**, and the
sheet prints the rule under the table rather than leaving you to work it out.

**What it refuses to get wrong**

- **It never reads the stored weekly total.** Every figure is added up from the
  saved days, the same rule as a payslip and a receipt. Where a week lies
  *wholly* inside the dates the two are compared, and a disagreement prints as
  **⚠ A week needs saving again** — but a week the dates cut in two is never
  compared, because half a week *should* come to less, and a warning on every
  month boundary would teach you to ignore it.
- **It does not quietly leave anyone out.** Someone active, with a daily rate,
  and nothing saved in those dates is named under the table as **⚠ Not on this
  sheet**. A missing row on a wage sheet looks exactly like a person who earned
  nothing.
- **A rate that changed mid-range is printed in full** — "₱500 / ₱550" — because
  the rate is copied onto each week when it is saved, and a raise must not
  rewrite what was paid before it.
- **Dates the wrong way round are swapped**, with a note saying so. A range
  over 400 days is refused, because that is a mistyped year, not a question.

**It stores nothing and adds no migration**, exactly like Reports: the sheet is
worked out fresh each time it is opened, so it cannot fall out of step with the
payroll screen it was built from.

**How it is verified**

| What | How | Result |
|---|---|---|
| Money, dates, payroll, and the split-week rule | `npm test` | 520 tests (35 of them new) |
| Every table and column the app asks for exists | `npm run check:schema` | 42 tables, 728 column references |
| The security rules, against a real PostgreSQL | `npm run test:rls` | unchanged — this added no migration |
| The sheet at 390 / 768 / 1024 / 1440, and on landscape paper | headless browser | no overflow, every tap target over 24px |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

The tests worth knowing about take one payroll week that straddles 30 September,
build a September sheet and an October sheet from it, and assert that the two
add back up to exactly the week's real gross and net — with the bonus and the
advance appearing on one sheet and not the other.

**How to check it**

```bash
npm install
npm test          # expect: 520 passed
npm run dev
```

No migration to run. Then, in the app:

1. On **Payroll**, fill in and save a week for two staff members, then step to
   the next week and save that one too. **Mark paid** one of them.
2. Press **Print payroll summary** beside the heading. The sheet opens on the
   week you were looking at, one row per person.
3. Tap **This month**. Both weeks now sit on one row per person, and the row
   for the person you paid reads **Partly paid** with what is still owed.
   **Already paid out** and **Still to pay** add up to **Total net pay**.
4. Press Ctrl+P. It should come out landscape, black on white, with the
   navigation gone and the signature lines on the page.
5. The interesting one: save a week that **starts in one month and ends in the
   next** — the week of Monday 28 September, say — with a bonus and an advance
   deduction on it. Print **This month**, then last month's dates, and add the
   two rows together. They come back to exactly what the payslip for that week
   says, with the bonus counted once, on the sheet holding the 28th.

---

## 21 September 2026 — staff stay signed in until they sign out

**What you asked for:** stop throwing the counter staff back to the login
screen in the middle of the day.

**What was happening:** spec 4.1 asks for an idle sign-out, and the system
applied it to everybody — fifteen minutes with nobody touching the screen and
you are out. On a counter machine that sits between customers, that is several
times a day, and each one costs a re-typed username and password with somebody
waiting.

**What was done:** the timer is now a question of *who*, not just *how long*.

- **Staff accounts stay signed in until somebody signs out.** No timer is
  started for them at all, so there is nothing that can fire by mistake.
- **Owner and admin accounts keep the timer**, unchanged. Those are the
  accounts that can open payroll, the ledger and the bills, and the counter
  computer is shared — so the screen that matters most is still the one that
  locks itself.
- It is a **switch, not a removal**. Settings → *Keep staff accounts signed in
  until they sign out*. Untick it and staff go straight back on the timer; the
  minutes box beside it still sets the length, up to 480.
- The footer on every screen says which rule you are under, so nobody has to
  guess whether they are about to be signed out.

Staff still cannot change this for themselves — it is a shop setting, Owner and
Admin only, and a security test proves a staff account cannot flip it.

**The honest trade-off:** a staff account left signed in on the counter machine
stays open to whoever walks up to it. That is why the exemption stops at staff:
a staff account cannot see bills, loans, the ledger, payroll or an enquiry, so
what is exposed is the counter itself. **Use *Switch user* when you leave it.**

**How to check it**

```bash
npm install
npm test          # expect: 526 passed (6 new)
npm run test:rls  # expect: 268 checks (267 before this, plus its 1)
npm run db:push   # applies 0014_staff_stay_signed_in.sql
```

`npm run db:push` matters here — the switch is a column, and until it exists
every account keeps the old timer.

It matters in one more way worth knowing, because the app deploys the moment a
branch merges while `db:push` is run by hand afterwards. The Settings form
writes every column at once, so in between the two, **Settings cannot save at
all** — not just the new box, the whole screen, including a figure typed months
ago. It now says so in those words and names the command, rather than showing
the raw *could not find the column* message. Nothing is changed when it
refuses.

Then, in the app:

1. Sign in as the **owner**. The footer still reads *Signed out automatically
   after 15 minutes of no activity*.
2. Open **Settings**. Under *Rules and limits*, the new tick box is already
   ticked.
3. Sign in as a **staff** member on another browser. The footer now reads *You
   stay signed in until you sign out*. Leave it alone past the idle minutes —
   it is still there.
4. Back as the owner, untick the box and save. The staff screen goes back to
   the countdown wording on its next load.
5. Leave the owner's own screen idle past fifteen minutes with the box ticked.
   It still signs out — that half is deliberately unchanged.

---

## Phase 10 — One counter, all three divisions ✅

**Built**

Money already came in through three doors — the Counter, a Dabz Apparel job
order and a DabzTech repair ticket — and all three already wrote to the same
ledger. What was missing was a way to **see** them together, and a way to take
an apparel or repair payment **without leaving the counter**.

So this phase connects and shows. It does not re-plumb anything: every peso
still reaches the ledger through `complete_sale`, `record_apparel_payment` or
`record_repair_payment`, and no new way in was built.

*One list of everything collected*
- **Sales** now shows all three doors, not just the counter. Each row says
  which division, what the payment was for — **Sale**, **Down payment**,
  **Balance** — the reference, the customer, the amount, the method and the
  time.
- Filter chips for the door (All · Counter · Apparel · DabzTech) and for the
  method (All · Cash · GCash · Maya · Bank · Owner's pocket). They are links,
  so a filtered view survives a refresh and can be sent to someone.
- A totals strip on top: everything collected today, then one figure per door.
- Voided rows **stay**, struck through, with ⚠ and the word Voided, and count
  towards nothing. A customer may be holding the slip.
- Underneath it is `public.collections`, a **view** — it stores nothing, so it
  cannot fall out of step with the rows beneath it. Same reasoning as Phase 8's
  reports.

*Taking any payment from the counter*
- **Take payment for an order** on the Counter screen opens a search box: a
  job order number, a ticket number, a customer's name or a phone number.
- It finds open jobs **that still have a balance**, and shows the total, what
  has been paid and what is left — always worked out from the job's own rows,
  never stored and never typed.
- The form prefills the balance, lets you change it, asks whether it is a down
  payment or a balance, takes Cash / GCash / Maya / Bank / Owner's pocket, and
  works out the change for cash.
- More than the balance is **refused**. Less than your down payment policy is
  a **⚠ warning and nothing more** — you may have agreed to take less, and a
  counter that turned the customer away would be wrong more often than right.
  With no policy set it says nothing, because nothing has been decided.
- Afterwards it offers **Print payment receipt**.

*End of day that names every division*
- **Cash sales** is now **Cash collected**, with a line saying what that means:
  counter sales, Apparel payments and DabzTech payments. It always did include
  all three; it just never said so.
- A new table: one row per door, one column per method, with the down payment /
  balance split under Apparel and DabzTech. The bottom row equals the day's
  totals, and the screen says so out loud if it ever does not.
- **Owner's pocket** is its own column and is never folded into cash — money
  that never reached the drawer must not make an honest drawer read as short.
- A closed day now **remembers** its breakdown. Days closed before this stay
  blank and say "Breakdown not recorded for this day", rather than showing
  zeroes that would read as a fault.

*Home and Reports*
- **Collected today** on Home: the total and one figure per door, each linking
  to Sales with that filter on.
- **Down payments held** (owner and admin only): money already received for
  work the shop still owes. It is a *view of existing data* — not a new
  category, and not subtracted from anything.
- **Still to collect**: balances across open job orders and repair tickets.
- **Collections by division and kind** on Reports, by method, with DabzTech's
  checking-fee income beside it. It is in the printed sheet and the spreadsheet
  download too.

*Payment receipts*
- `/apparel/[id]/payment/[id]/receipt` and `/repairs/[id]/payment/[id]/receipt`,
  in the same narrow black-on-white style and on the same receipt paper as a
  counter receipt.
- Order total, paid before, this payment, balance remaining — **every figure
  added up from the rows printed**, so a customer can check it by hand.
- A voided payment prints with **VOIDED** across it, adds nothing to what has
  been paid, and cannot pass as valid.

*Two things fixed on the way*
- **Maya was missing from every form but the counter.** The database has
  accepted it on every money table since `0005`, and End of day has counted a
  Maya line ever since — but the list the other forms are built from never
  included it, so a Maya apparel down payment or bill payment was impossible to
  record. It is there now, everywhere.
- **A deactivated account could still read its own old sales.** Sign-in already
  refused them, so nothing leaked through a screen — but Row Level Security is
  the boundary and must not lean on the layer in front of it. Found by the new
  Phase 10 test, closed in `0015`.

**What I decided and how to change it**

Everything below is also in [DECISIONS.md](DECISIONS.md), with the same notes.

| Decision | How to change it |
|---|---|
| Counter staff need the **Apparel** or **DabzTech** permission to take those payments; `Add sales` alone gives neither | Tick the box on the **Staff** screen. It matches the security rules that already existed — nothing was widened |
| A **released** order or ticket with a balance stays payable from the counter | It is the "let the regular take the jerseys and settle later" case in spec 8. To hide them, filter on open status in `getPayableJobs` |
| Down payment / balance is now **chosen**, not deduced from whether it is the first payment | The form starts on the old answer; the person at the counter can say otherwise |
| Old DabzTech payments keep **no kind at all** and read as plain "Payment" | Nothing to change — nobody can now know which they were, and a guess would be believed |
| Takings paid into the **owner's pocket** now count in the day's total | They are money the shop collected. They stay out of the drawer figure. See `computeClosing` |
| No DabzTech down payment percentage was added | If you want one, add it as a nullable setting, leave it empty, and list it in `src/lib/data/checklist.ts` |

Nothing new was invented that only you can know, so the **To fill in** screen
is unchanged.

**How it is verified**

| What | How | Result |
|---|---|---|
| Feed totals, filters, breakdown, receipt figures, the counter's refusals, the CSV block | `npm test` | 592 tests (47 new in `collections.test.ts`) |
| The security rules, against a real PostgreSQL | `npm run test:rls` | 301 checks (was 268) |
| That every table and column the app asks for exists | `npm run check:schema` | 43 tables |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

The two that matter most are in `supabase/tests/12_phase10_rls.test.sql`:

- **The feed leaks nothing.** The view is `security_invoker`, so the policies
  already on sales, apparel payments and repair payments still decide what each
  person sees. The test proves it by asking as five different people — the
  owner, an admin, a counter assistant with only Add sales, one who is then
  given the daily sales report permission, and a deactivated account. It also
  checks the view is `security_invoker` **directly**, because without that flag
  every other test in the file would pass while the books were wide open.
- **The feed and the ledger agree.** Every money source, from both sides, over
  everything in the database — not just the rows the test wrote. If they can
  ever differ, the feed is wrong, because the ledger is the record.

**Still to do by hand:** the four-width browser check (390 / 768 / 1024 / 1440).
It needs a real Supabase project, which cannot run here. Two things on this
phase specifically need eyes, because no unit test can see either: the **Take
payment for an order** dialog — it is portalled into `<body>`, which is what
keeps a `fixed inset-0` overlay measuring against the screen and not against
the blurred top bar — and the **breakdown table** on End of day, which is a
real table from `sm` up and a stack of cards below it, so six columns never
have to fit a 390px phone.

**How to check it**

```bash
npm install
npm run db:push   # applies 0015
npm test          # expect: 592 passed
npm run dev
```

Then, at the counter:

1. Ring up a **₱30 print sale in cash**.
2. Create an **Apparel job order**. Then, from the **Counter**, press
   *Take payment for an order*, find it, and take a **₱500 GCash down
   payment**. Press **Print payment receipt** — the slip should say ₱0.00 paid
   before, ₱500.00 this payment, and the balance left.
3. Create a **DabzTech ticket**, and again from the **Counter** take a
   **₱200 cash down payment**.
4. Open **Sales**. All three rows are there. The filters work. The total is
   **₱730.00** — Counter ₱30, Apparel ₱500, DabzTech ₱200.
5. Open **End of day**. **Cash collected ₱230.00** (₱30 counter + ₱200
   DabzTech), and ₱500 sitting under Apparel in the GCash column, marked as a
   down payment.
6. As the owner, open the job order and **void the ₱500 down payment**. Sales,
   End of day, Home and Reports all drop by ₱500 **together**. The voided row
   is still on the Sales list, struck through. Open its receipt: it now says
   VOIDED and adds nothing.
7. Sign in as a staff member who has **only Add sales**. The *Take payment for
   an order* button is **not there**, and Sales shows counter rows only — with
   a ⚠ line saying part of the day is not shown to them, so an incomplete
   total is never mistaken for the whole day.

---

## Phase 11 — Notifications on your phone ✅

**Built**

Every warning this sends already existed. A bill due in five days, stock below
its reorder level, a unit nobody has collected, a customer message with no
reply — the system has known all four for phases. The only thing wrong with
them was that **you had to open a screen to find out**.

*What arrives, and when*
- **One summary each morning**, when the shop opens. "3 things need you today
  — 2 bills overdue (₱4,500.00) · 1 customer message waiting".
- **If nothing needs you, nothing is sent.** No cheerful "all clear". Enough of
  those and you swipe them away without reading, and the one that mattered goes
  with it — the same reasoning as a daily target of zero meaning *not known*
  rather than *reached*.
- **One exception arrives straight away: a customer message.** That is the only
  one with a person waiting at the other end (spec 9). Everything else is the
  shop's own business and keeps until morning.
- Most urgent first: what is already late, then what is about to be, then a
  person waiting, then a thing on a shelf.

*What it will not put on your lock screen*
- **No names, no numbers, no message text.** The payload is encrypted end to
  end — Google and Apple carry it without being able to read a peso — but it
  still lands on a screen anyone standing near your phone can see. So the
  customer alert says *somebody wrote* and nothing about who. The Messages
  screen is one tap away, behind your sign-in.

*Who can turn it on*
- **Owner and Admin only.** Every figure a summary can carry is Owner/Admin
  material under spec 4.3, and a notification is just a screen that arrives by
  itself. A staff account is refused by the database, not only by the screen.
- **You see only your own phones**, and so does every admin. An endpoint is a
  device, and one person reading another's device list has no upside.
- Turning a phone off **deletes** the row. That is the one place in this system
  where deleting is right: it is a standing permission, not a money record, and
  a withdrawn permission should leave nothing behind that could still be sent
  to.

*The awkward bits, handled*
- A phone that has been wiped or had permission revoked answers 404. That is
  not retried — it is switched off, with the reason kept so **Settings can tell
  you why it stopped**. A push service merely having a bad minute is forgiven,
  ten times over, before anything is switched off.
- The job can run twice, be re-run by hand, or be moved. You still get **one**
  summary: the date of the last one is what stops a second, not the schedule. A
  quiet day is marked as done too, so a later run does not reconsider and
  interrupt you at four in the afternoon with news that there is no news.
- It never asks for permission on load. A prompt nobody invited gets denied,
  and a denied browser **cannot be asked again from code** — you would have to
  go into your own browser settings to undo it.

**What I decided and how to change it**

| Decision | How to change it |
|---|---|
| A **daily summary**, not an alert per event | A shop generates dozens a week; twelve notifications a day gets the channel muted, and a muted channel is worse than none because everyone thinks it still works. Add a kind to `digestLines` in `src/lib/notifications.ts` |
| Sent at **your shop's opening time**, from Settings | Nothing was invented — it reads `workDayStart`. The cron itself runs at `0 0 * * *` UTC, which is 8am Manila; if you change your opening hour, change that line in `vercel.json` to match (UTC = Manila − 8) |
| A customer message is the **only** immediate one | `notifyOwnersOfEnquiry` in `src/app/(public)/actions.ts`. Anything else you want immediately goes there too — but think hard first |
| The alert carries **no customer details** | Deliberate, and worth keeping. `enquiryAlert` in `src/lib/notifications.ts` |
| **No per-kind on/off switches** | One summary does not need filtering, and every switch is another thing to get wrong. If you want them, they belong on the subscription row, not in Settings — a person may have two phones |
| Ten failures before a phone is switched off | `MAX_FAILURES`. Switching off after one bad afternoon is how somebody silently stops getting warnings and finds out weeks later |

**How it is verified**

| What | How | Result |
|---|---|---|
| The digest logic: silence when quiet, order, plurals, truncation, the send verdicts | `npm test` | 645 tests (36 new in `notifications.test.ts`) |
| The security rules, against a real PostgreSQL | `npm run test:rls` | 319 checks (was 301) |
| That every table and column the app asks for exists | `npm run check:schema` | 43 tables and one view |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

**What could NOT be tested here, and needs you**

This is a bigger gap than usual, so it is worth being plain about:

- **Whether a notification actually lands on your phone.** That needs a real
  deployment, a real Supabase project and a real phone. Everything up to the
  moment the message leaves the server is tested; the last hop is not.
- The **permission prompt**, the **service worker**, and the **iPhone
  home-screen requirement** are all browser behaviour that no unit test can
  see.

**How to check it**

```bash
npm install
npm run db:push     # applies 0016 and anything after it
npm run push:keys   # ONCE - then paste both keys into .env.local and Vercel
npm test            # expect: no failures
npm run dev
```

You also need a `CRON_SECRET` — any long random string, in `.env.local` and in
Vercel. Without it the digest route refuses everybody, **including Vercel**.
That is on purpose: it is a public URL that reads the whole shop, and a missing
secret means nobody set it up rather than that it should run wide open.

Then, on your phone:

1. Open the system on your phone and sign in as the owner. **On an iPhone, add
   it to your Home Screen first** and open it from there — Apple only allows
   notifications for an app installed that way.
2. Open **Settings**, scroll to **Notifications**, press *Turn on for this
   phone*, and allow it when your phone asks. It should now be listed, with
   the phone named.
3. On a computer, open **Settings** as the same person: that phone is in the
   list there too, because it is yours.
4. Sign in as an **admin** on the computer. Your phone is **not** in their
   list, and theirs would not be in yours.
5. Sign in as a **staff member**. There is no notifications section at all.
6. From a private window, send yourself a message through the **public page**.
   Your phone should buzz within seconds, saying a customer has messaged —
   and saying **nothing about who or what**. Tap it: it opens Messages.
7. The morning summary is harder to try on demand, because it waits for
   opening time. To force one, call the route yourself with your secret:
   `curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-site/api/notifications/digest`
   It answers with what it did. With nothing wrong in the shop it will say
   *"Nothing needed attention, so nothing was sent"* — **that is the correct
   answer**, not a failure. Make a bill overdue and try again.
8. Try that same URL **without** the header. It should answer *Not found*.
9. Press **Turn off** beside the phone in Settings. It disappears, and the next
   morning nothing arrives.

---

## 21 September 2026 — the apparel production calendar

You asked for "a calendar of all projects in Dabz Apparel; make it minus one
day from the original due date, and if it is not finished, put it in the next
day but assign it as a priority project."

**Built** — a new screen at **Apparel → Project calendar**
(`/apparel/calendar`), also in the sidebar under Daily.

- **Two dates, not one.** The *promised* date is what the customer was told and
  it never moves. The *target* date is one day earlier, and that is where the
  job sits on the calendar — so there is a day in hand when the layout comes
  back wrong or the fabric runs short.
- **Unfinished work is carried forward and marked priority.** A target day that
  ends with the job still on the bench does not simply pass: the job moves to
  the next day, and if that day passes too it moves again. Applied every day
  since, it lands on **today** — the only square anybody can still act on — and
  it says how many days it has been carried. A job three days late is at the
  top of today, not gathering dust on the square it missed.
- **"Finished" means Ready for pickup or Released.** Whether the customer has
  come for the jerseys is a different question from whether the shop still owes
  anybody work, so a ready order stops being carried. It stays on the target
  day it was made for, marked ✓.
- **A cancelled order is off the calendar altogether** — it is not work. It is
  still on the Apparel screen with its reason, because the customer may be
  holding the sheet.
- **An order with no promised date is never given one.** A date invented here
  would be worked to, and the customer was never told it. Those orders are
  listed under the calendar as *Not on the calendar*, asking for a date.
- **The Apparel screen says it too.** If anything has been carried over, the
  first thing on the screen is a ⚠ with the count, the teams and how long each
  has been waiting.
- **Nothing is stored.** No table, no column, no nightly job that moves orders
  along, and **no migration** — the schedule is worked out from each order's own
  promised date and status every time the screen is opened, the same rule as
  reports in Phase 8. A stored "scheduled day" and a promised date can disagree,
  and a shop that never opened the screen on Tuesday would find Tuesday's work
  had never been carried forward.

**How it is verified**

| What | How | Result |
|---|---|---|
| The target date, the roll-forward, finished and undated orders, the month grid | `npm test` | 724 tests (21 new) |
| That nothing in the database changed | `npm run test:rls`, `npm run check:schema` | 334 checks, 44 tables — unchanged |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |
| The grid at 390 / 768 / 1024 / 1440 | headless browser | no sideways scroll at any width; the grid from 768 up, the day-by-day list below it; every chip 29px tall |

The seven-column grid is the part no unit test can see, so it was measured in a
browser. At 390px seven columns give each day about 50px, which cannot hold a
team name — so a phone gets the same month as a **list, one day under the
other**, with the full name, the status and what is owed on each.

**How to check it**

```bash
npm test          # expect: 724 passed
npm run dev
```

1. Open **Apparel**, start a job order and give it a promised date **three days
   from now**. Open **Project calendar**: it is on the square *two* days from
   now — one day before you promised it.
2. Change the promised date to **yesterday**. The order now sits on **today**,
   in amber, with ⚠ and "Carried over 2 days", and the Apparel screen says so
   at the top.
3. Move it to **Ready for pickup**. It stops being carried and goes back to its
   own target day with a ✓.
4. Clear the promised date. It leaves the grid and appears under **Not on the
   calendar** — the system will not guess a date.
5. Open the same screen on a phone: the same month, as a list.

---

## 21 September 2026 — the way into the project calendar

The calendar shipped with its way in written as a line of underlined text
beside the red **New job order** button, and the owner reported not being able
to find it. That is the same mistake the Disclosure handle made in Phase 2: a
way in that does not look like anything.

**Changed**

- The link is now a **button**, on its own row directly under the page heading
  — above the three summary cards, not below them. On a phone the cards used to
  push it a screenful down, and what is due today matters more than a running
  total does.
- It carries the **live count** beside it: *"2 carried over and needing doing
  first · 1 due off the bench today · next on 24 Sep 2026"*. A button that says
  what is waiting is worth crossing the screen for in a way that the word
  *Calendar* is not. With nothing on the bench it says so plainly, and with no
  promised dates entered it says **that** rather than "all up to date" — the
  same rule as a daily target of zero meaning "not known".
- Renamed **Project calendar** everywhere, from *Apparel calendar*. The owner
  calls this work "projects"; "Apparel calendar" read as a corner of the
  Apparel screen rather than as its own thing. It stays in the sidebar under
  **Daily**, next to Apparel, because it is opened every morning and it is the
  same orders.
- A new `feature` button variant in `src/components/ui.tsx` for this: the
  accent as a **tint and a frame**, never a fill. A screen has one main action
  and it wears the filled red — a second red button leaves neither of them
  meaning anything.

**The part that needed measuring**

The obvious way to write that variant is accent text on an accent tint, the
shape `Tag tone="accent"` already uses. In a browser it measures **3.06:1**
against the dark surface, under the 4.5:1 floor, and dark is the shop's default
look — so the label is `text-ink`, which measures **15.72:1** dark and
**13.73:1** light. The frame does the attracting; the text does the telling. A
button nobody can read is a worse answer to "make it more visible" than the
underlined link it replaced.

| What | How | Result |
|---|---|---|
| The counts behind the line — carried over, due today, next day, waiting on a date | `npm test` | 738 tests (6 new) |
| Contrast of the new button, both themes | headless browser | 15.72:1 dark, 13.73:1 light — both pass AA |
| The screen at 390 / 768 / 1024 / 1440 | headless browser | no sideways scroll; the button on the first screenful at every width (390px: 312px down) |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

---

## 21 September 2026 — Settings would not save, and nothing could see why

**What was wrong.** The owner opened **Settings**, typed a warranty period and
pressed Save. The screen answered:

> ⚠ Could not save the settings: your database is missing a column this version
> stores. … [Could not find the 'staff\_stay\_signed\_in' column of
> 'app\_settings' in the schema cache]

`staff_stay_signed_in` is added by migration `0014`, which had never reached the
production database. Two things made that worse than it had to be:

1. **One absent column stopped the whole screen saving.** The form writes every
   setting in one statement, so a checkbox the owner had not touched threw away
   the warranty period they had just typed.
2. **The System check screen said the database was fine.** It probes tables and
   views, and `0014` creates neither — it adds one column to a table that
   already existed. So the one screen whose job is to say "this database is
   behind" reported *"The database has everything the system needs"* while
   Settings refused to save.

The second point is the same failure that put PHP 0.00 on the Sales screen and
cost the owner a day: a confident "all fine" beside a screen that is visibly
not fine. That is what this change is really about.

**What was built.**

- **A column the database has not got is dropped, and the rest is saved**
  (`saveSettingsRow` in `src/lib/settings.ts`). PostgREST names the first
  column it cannot find, so the write is sent again without it, until it goes
  through. What was left out is then reported — by the name on the form, not
  the column name — with what to run to finish it. Never silently: a setting
  that quietly did not save is worse than one that visibly refused, because a
  wrong value that reads back is trusted.
- **Only columns added to `app_settings` after `0001` may be dropped**, and
  every one of them has a database default, so leaving it out changes nothing.
  A column outside that list going missing is a database that is *broken*, not
  one that is *behind*, and the save fails loudly as before. A test holds the
  list against the migration files, so a column added next month cannot be
  forgotten.
- **The audit log records what actually reached the database**, not what was
  asked for. A dropped column never landed, and that log is what a
  disagreement about settings gets settled by.
- **The System check screen now asks after columns too** (`REQUIRED_COLUMNS` in
  `src/lib/schema-health.ts`). One column per table per migration — the same
  bet the home-screen sentinels already rest on, that a migration is applied
  whole — so six extra questions cover every migration that adds a column to a
  table that already existed. `0014` now has a sentinel, so **Home** says the
  database is behind rather than leaving Settings to discover it.
- **A column is only asked about once its table is known to be there.** When
  the table is missing the column question is moot, and asking it anyway would
  name two migrations for one absence — the wrong one loudest, since the
  column's is the later.
- **The screen no longer overclaims.** It now says what it does check, and says
  plainly that a migration which only changes security rules, or only clears
  rows, is invisible to it even when it has never been applied.

**How it is verified**

| What | How | Result |
|---|---|---|
| Dropping a column, refusing to drop a core one, not retrying an RLS refusal, not looping | `npm test` | 765 tests (35 new) |
| That the skip list and the column probes cannot drift from the migrations | `npm test` | guards read `supabase/migrations` and fail on a forgotten column |
| That nothing in the database changed | `npm run test:rls`, `npm run check:schema` | 334 checks, 44 tables — unchanged |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

The drift guards were checked by breaking them: removing `0014` from
`REQUIRED_COLUMNS` fails two tests by name, rather than passing quietly.

**How to fix the database itself**

The code change stops one missing column taking the whole screen with it. It
does **not** apply the migration — the shop still needs `0014` for the "staff
stay signed in" switch to work at all. Open **System check** (under Manage →
Settings, or `/system`) and it will now name exactly which migrations are
missing. Then, in order:

```sql
-- 1. In the Supabase SQL editor, see what has actually been applied:
select version from supabase_migrations.schema_migrations order by version;
```

If `0011`, `0012` and `0013` are listed, `npm run db:push` is safe and applies
the rest. **If they are not listed, do not push** — `0013` deletes every bill,
loan, product, apparel item and repair service and cannot be undone. Paste the
missing files into the SQL editor one at a time instead. For this one that is
all of `supabase/migrations/0014_staff_stay_signed_in.sql`:

```sql
alter table public.app_settings
  add column if not exists staff_stay_signed_in boolean not null default true;

notify pgrst, 'reload schema';
```

The `notify` matters on its own: PostgREST keeps its own cache of what columns
exist, and running SQL by hand does not always refresh it. A migration that
*has* been applied can still produce this exact error until it does.

---

## Phase 12 — The production report ✅

**What you asked for, 21 September 2026**

> "Another category for Production Report, for every project, we can open it
> and we can put a status of that item whether it is already OK in design,
> Color Test, pattern, print, Heatpress, Fabric Cutting, sewing, quality
> checking, Packaging, ready! And from this project it will sum up all status
> per item to create a final status of this project."

**Built**

- A new section in the sidebar, **Production report**, under **Daily** beside
  Apparel and the project calendar. Same door as the job orders: anyone with
  the Apparel job orders checkbox, plus you and any admin.
- **The ten benches**, in your order: Design · Colour test · Pattern · Print ·
  Heat press · Fabric cutting · Sewing · Quality checking · Packaging · Ready.
  The database refuses anything that is not one of them, and a test reads the
  list out of the migration file and fails if the app and the database ever
  stop agreeing about how they are spelled.
- **A status per item, marked by whoever did the work.** An item is a line on
  the job order — "18 full sublimation jerseys" — with its ten benches as ten
  boxes and one **Save**. Ticking is not saving, and the screen says so: the
  button counts the changes waiting in it and a ⚠ **Not saved yet** sits beside
  it until they land.
- **The project's own status, summed from its items.** A project is only as far
  along as its **least advanced** item, because the customer collects all of it
  at once. Eighteen jerseys packed and a jacket still waiting on its pattern is
  a project at **Pattern**, and the screen names the jacket as the thing
  holding it up.
- **A skipped bench is shown, never assumed.** Ticking Sewing says the sewing
  is done and says nothing about the printing. So an item with Print ticked and
  the colour test blank reads as *"at Design — Colour test, Pattern are not
  marked, but Print is"*, and it counts as being at Design until they are. The
  report says how many projects have one.
- **The disagreement between the counter and the shop floor is shown, not
  resolved.** If the order says "Ready for pickup" while two items have benches
  unmarked — or every bench is done while the order still says "In production" —
  both screens say so and neither is changed. They are two people's statements
  about the same job, and quietly picking one makes the other a lie.
- On the **Apparel** screen, the production report sits beside the project
  calendar as a second way in, with the same kind of live line: *"2 through
  every bench · 3 not started · 1 with a bench skipped · 18 of 70 benches
  marked"*. On a **job order**, one line says where it is on the bench and
  links straight to its report.

**The decisions inside it** (all recorded in `docs/DECISIONS.md`)

- **An item is a line on the job order, not one player's shirt.** A batch of
  one design is printed together, pressed together and sewn together — and ten
  ticks against each of eighteen names is 180 boxes nobody would keep up at the
  counter.
- **Nothing about a project's status is stored.** There is no "project stage"
  column anywhere, and the security test fails if one appears. It is worked out
  from the marks every time the screen is opened, exactly like an order's
  total, a payslip and a report.
- **A tick is removed when it was wrong**, rather than answered with an
  opposite row the way a ledger entry or a stock movement is. Those are money.
  This is a statement about where the work is right now, and the honest
  correction to "the printing is done" when it is not is to stop saying it. The
  permanent record is the audit log, which is written on every change and which
  nobody can edit.
- **A failed read is not an empty one.** If the marks cannot be read, every
  screen says so and says nothing about where the work is: the statuses read
  **Not known**, the counts read **—**, and the disagreement check is not even
  asked. "Not started" against every project in the shop is exactly the
  confident wrong answer that cost a day in September when a missing migration
  showed up as PHP 0.00 on Sales.
- **An order with no items is its own state** — "Nothing being made yet" — and
  not "Not started" and not "Ready". There is no work on it to have started.

**How to run it**

```bash
npm run db:push     # applies 0018, which creates the production marks
npm run dev
```

Then: **Production report** in the sidebar, or the button on the Apparel
screen.

**How to check it**

1. Open a job order with a couple of items on it, then open **Production
   report** from the sidebar. Every project is listed with its status.
2. Open one. Tick **Design** on the first item — the button says *Save 1
   change* and ⚠ *Not saved yet* appears. Press Save.
3. Watch the project's own status at the top: it stays at **Not started** until
   *every* item has its Design ticked. That is the sum working.
4. On one item, tick **Print** while leaving Colour test and Pattern blank. The
   item says it is still at Design and names the two benches that are missing.
5. Tick everything on every item. The project reads **Ready** — and if the job
   order still says "In production", the screen tells you the two disagree and
   changes neither.
6. Clear a tick and save. It says what was cleared, and **Activity** shows the
   before and after.
7. Sign in as a staff member without **Apparel job orders**: the section is not
   in the sidebar, and `/production` bounces back.

| What | How | Result |
|---|---|---|
| The sum, the skipped bench, the labels, the counts, and that the app's ten benches match the migration's | `npm test` | 792 tests (27 new) |
| The security rules on the marks, against a real PostgreSQL | `npm run test:rls` | 350 checks, 16 of them new |
| Every table and column the app asks for | `npm run check:schema` | 214 table references and 832 column references, against 45 tables |
| The screens at 390 / 768 / 1024 / 1440, both themes | headless browser | no sideways scroll anywhere; benches 2 / 3 / 5 / 5 to a row; smallest tap target 28px, smallest bench box 36px |
| Contrast of a ticked bench and the "not saved yet" warning | headless browser | ticked 6.51:1 dark / 5.27:1 light; warning 7.92:1 / 5.66:1 — all above 4.5:1 |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

**Not checked here** — the screens were measured in a headless browser against
the real compiled stylesheet, but they were not driven against a live Supabase,
because this build environment has no project to sign in to. Marking a bench,
clearing one and watching it appear in **Activity** is the first thing to try
after `npm run db:push`.

---

## Phase 13 — Encoding a team project, person by person ✅

**What you asked for, 21 September 2026**

> "When we receive a project we enter its basic information: Team name,
> Address, Contact person, Contact number, Facebook account link, Due date, and
> the Payment record (Down payment, Balance). After that, inside that project,
> our staff manually encode the individual specification of every person. It is
> a team project, so everyone can have their own name, size and so on... After
> everything is encoded, show a summary: how many Jersey, T-Shirt, Polo Shirt,
> Longsleeve, Jacket and Custom there are per size, and the same for the
> shorts."

**In plain language, what was built**

A project is still a Dabz Apparel job order — the same screen, the same order
number, the same money. What changed is what lives inside it. Where before a
job order held "18 sublimation jerseys" with a pasted list of names under it,
it now holds **one row per person**, and each row carries its own uniform type,
name, number, size, short size, short name, price and remarks.

Everything else follows from those rows rather than being typed a second time:

- **The items make themselves.** Rows of the same uniform type are one item —
  your own suggestion, and it is what keeps the production report, the payment
  split, the fabric and collar, the printed sheet and the project calendar
  working exactly as they did. Nobody chooses an item any more.
- **The project total is the sum of the row prices.** Added up every time,
  never stored, whole centavos. A row with no price is marked with a ⚠ and adds
  nothing; it is never given a made-up one.
- **The summary is counted from the rows.** Two grids — uppers per type per
  size, and shorts per size — on the screen and on the printed job order sheet.

**Built**

- **The project's own basic information.** Contact person, contact number,
  address and Facebook account link now live on the project itself, typed on
  the form without visiting the Customers screen. Only the team name is
  required; anything left empty stays empty and never blocks the project. Where
  a project has no value of its own and a customer record is linked, the
  screen shows the customer's and says where it came from — shown, never copied
  in, and never written back.
- **The payment record at the top of the project**: Project total · Down
  payment · Other payments · Balance. None of it is stored. The balance is the
  total less what has been paid, and it is never typed.
- **A down payment can be taken while the project is being written.** It goes
  through `record_apparel_payment` like every other apparel payment, with the
  payment method and reference number, so the ledger entry is written in the
  same transaction.
- **The encoding table.** Eight columns in your order — type of uniform, name,
  jersey number, size, short size, short name, price, remarks — plus a pieces
  box and the row's own Copy / Remove. Choosing **Custom** opens a box to type
  the uniform in. Add a row, copy a row, remove a row. A new row starts with the
  type of the row above it. **Tab** moves along a row and **Enter** moves down a
  column, adding a row when it reaches the bottom — thirty names, then thirty
  sizes, without the mouse.
- **The price box fills itself in** from the apparel price list plus the size
  add-on, and what is SAVED is the figure in the box. Next month's price rise
  cannot rewrite this project. A pre-fill only ever fills an EMPTY box, so a
  figure somebody typed is never overwritten.
- **Typing is not saving, and the table says so** — the same pattern as the
  production report. The button counts the changes waiting in it and ⚠ **Not
  saved yet** sits beside it until they land. One Save sends the whole table in
  one transaction: thirty people sent as thirty requests can fail halfway and
  leave half a team encoded.
- **The paste-in stayed**, as a shortcut that fills rows of the table rather
  than saving anything. `Dela Cruz, 7, M` · `Reyes, L` · `Santos, 23, 2XL, M`
  (a second size is read as the short size) · anything left over becomes the
  note.
- **The summary**, under the table and on the printed sheet. A line per uniform
  type — each distinct Custom name its own line, matched past capitals and
  spacing — a column per size in use, a total per type, per size and overall;
  then a second grid of shorts per size. On screen it counts what is ON the
  table, including changes not saved yet, and says so.
- **Every one of the six types has its own book** (spec 10.1), so a payment
  splits properly across a project holding jerseys and jackets. Custom books to
  a new category, **Other apparel**: a custom cap is not a jersey.
- **Changing or removing a row is written to the audit log** with the whole
  table before and after.
- **Nothing that exists changed.** Every project, name and payment entered
  before today still opens, totals the same to the centavo, and prints —
  without a data migration, because a row with no price of its own is totalled
  exactly the way it always was: the item's price each, plus that row's copied
  size add-on.

**The decisions inside it** (all recorded in `docs/DECISIONS.md`)

The contact details are **on the project**, because a team's contact person is
a fact about this project and next season it is a different manager. The six
types find a price through a **tag on the price list** that you set once, and
an untagged type simply asks for the price rather than guessing one from the
item's name. **Fifty plain shirts are one row saying fifty**, not fifty empty
rows. **A size may be left empty** while encoding and is counted in a column
that says "not set". **A shorts-only row is said out loud**, not guessed from
an empty size. And an item the encoding empties is removed — unless the shop
floor has marked its benches, in which case its marks follow its people, or the
item is kept and counts as nothing.

**How to run it**

```bash
npm run db:push     # applies 0019
npm run dev
```

Then: **Apparel** → **New job order**, or open a project you already have.

**How to check it by hand**

1. **Apparel → New job order.** Type only a team name and press Open. It opens:
   nothing else is required. Then open it and use **Edit the details** to add
   the contact person, number, address and Facebook link.
2. Write another one, this time with a **down payment** filled in. Open it: the
   band at the top reads Project total ₱0.00 · Down payment what you typed ·
   Balance ₱0.00, and the payment is in **Money in/out** under Apparel.
3. On a project, **Add a row**, choose **Jersey**, type a name and a size. The
   price box fills itself in if you have tagged a price-list item with
   "Jersey" on **Apparel → Prices**; if not, it stays empty and the row is
   marked ⚠ **No price**. Notice the button now says *Save 1 change* and ⚠
   *Not saved yet* is beside it. Press Save.
4. Press **Enter** in the name box. It moves to the name box of the next row,
   and on the last row it adds one. Press **Tab**: it moves along the row.
5. **Copy** a row: everything comes across except the name, the number and the
   short name — the three things that are never the same twice.
6. Choose **Custom** on a row. A box appears to type the uniform in; leave it
   empty and Save refuses that row by name.
7. Set one row's size to **Shorts only** and give it a short size. The summary
   counts it under shorts and not under any uniform type — it never had an
   upper.
8. Leave one row's size as **Not set**. The summary grows a ⚠ **Not set**
   column rather than folding it into M.
9. Add a row with no name and **Pieces** 50. The summary counts fifty.
10. **Paste a list** — paste three lines, press *Put them on the table*. They
    appear as unsaved rows for you to check. Nothing is saved until you press
    Save.
11. Mix two types on one project, then look at **What is being made**: there
    are now two items, one per type, and each carries its own fabric and
    collar. Take a payment and check **Money in/out**: it is split across the
    two books.
12. **Print the job order.** The sheet carries every person with their price
    and remarks, then both summary grids.
13. Take the last person off an item and Save: the item goes with them. If the
    **Production report** has marked one of its benches, the marks follow the
    people to the item that took them.
14. Open a project written before today. It totals **exactly** what it did
    before, its names are all there, and it says ⚠ *1 item with no type of
    uniform recorded*. Set the types on its rows and Save: the total does not
    move, and the project joins the summary.
15. Sign in as a staff member without **Apparel job orders**: the section is
    not in the sidebar, and the project bounces back.

| What | How | Result |
|---|---|---|
| The summary, the row prices, the paste parser, and that the app's six types and their books match the migration | `npm test` | 844 tests (52 new) |
| That an order written before Phase 13 totals the same to the centavo | `npm test` | asserted against the old arithmetic, row by row |
| The security rules on every new column, the function, and the check constraints, against a real PostgreSQL | `npm run test:rls` | 386 checks, 36 of them new |
| Every table and column the app asks for | `npm run check:schema` | 216 table references and 1053 column references, against 45 tables — the checker now follows a named column list (`const ORDER_COLUMNS = "..."`), which it used to skip, and was proved by breaking one |
| The screens at 390 / 768 / 1024 / 1366 / 1440 / 1920, both themes | headless browser | no sideways scroll anywhere; a card per row below 85rem and a ten-column row above it; smallest tap target 28px |
| Contrast of the row warnings, the "not saved yet" line and the summary's "not set" column | headless browser | 8.68:1 dark, 6.22:1 light — all above 4.5:1 |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

**Not checked here** — the screens were measured in a headless browser against
the real compiled stylesheet, but they were not driven against a live Supabase,
because this build environment has no project to sign in to. Encoding a real
team, saving it, and watching the before/after appear in **Activity** is the
first thing to try after `npm run db:push`.

---

## 22 September 2026 — the summary on the production report

**What you asked for**

> "The summary should also show on the production report."

**Why it was in the wrong place**

Phase 13 put the summary — how many of each uniform type, per size, and the
shorts per size — on the project screen and on the printed job order sheet.
Both are right, and both are the wrong screen for the person it is actually
for: the project screen is the counter's, and the sheet is the customer's
piece of paper. **The production report is the screen the shop floor has
open**, because that is where the benches are ticked. The figures somebody
cuts and sews from now sit on it.

**Built**

- The two grids on **Production report → open a project**, between the
  project's status and its items: what to make, then how far along it is.
- **One component, in three places.** `UniformSummaryGrids` moved to
  `src/components/` and is now shared by the project screen, the printed sheet
  and the production report. Three copies of a grid would be three chances for
  the counter, the customer and the shop floor to be cutting different amounts.
- **It is counted from the project's own rows, not from the bench marks.** So
  on a day when the marks cannot be read — the notice at the top of that screen
  — the summary still says something true, because it never claimed to say
  where the work had got to.
- **Not shown on a project with nothing on it at all.** The card below already
  says so, and says it better, with the way back to the job order. Two "there
  is nothing here" messages stacked is how a screen teaches somebody to skim
  past both.

**How to check it**

1. Open **Production report** and open a project that has people encoded on it.
2. The grids are there, under the status and above the benches, and they say
   the same numbers as the project screen and the printed sheet.
3. Tick a bench and save. The grids do not move — they count what is being
   made, not how far along it is.
4. On a project with no items at all, there are no grids and the card below
   explains why.

| What | How | Result |
|---|---|---|
| The counting itself, unchanged | `npm test` | 844 tests |
| The screen at 390 / 768 / 1024 / 1440, worst case of every size in use | headless browser | no sideways scroll of the page at any width; on a phone an eleven-column grid scrolls inside its own box |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

---

## 22 September 2026 — a print button where the encoding happens

**What you asked for**

> "Can we have a print button to print this data for our hard copy."

**What was already there, and why it was not enough**

The **Print the job order** button at the top of a project already prints
exactly this data — every person with their name, number, size, short size,
short name, price and remarks, grouped by item, then both summary grids, the
payment record and the signature lines. The problem was where it is. By the
time you have encoded thirty people you are at the bottom of the screen, and
the button is off the top of it.

**And a trap underneath that.** The sheet is drawn on the server from what has
been **saved**. Pressing print with five people still sitting unsaved in the
table would have handed you a list missing five shirts — and nothing on the
paper would have said so. Somebody cuts from that paper.

**Built**

- **A second way in, in the row with Save**, where your hands already are.
- **It is off while anything is unsaved**, and says why: the button reads
  **Save first to print** until the table is saved. That is not a nicety. A
  printed list that silently omits the row you just typed is the worst thing
  this screen could produce, and the honest answer is to refuse rather than to
  print a lie.
- **The Remarks column got its gutter back.** Found by rendering the sheet at
  A4 in a browser rather than by reading the code: Price is right-aligned and
  Remarks is left-aligned, so with nothing between them the two headings
  printed as one word — **"PriceRemarks"** — on the sheet the customer checks.

**How to check it**

1. Open a project and change something in the table. The button reads **Save
   first to print** and does nothing.
2. Press **Save**. It becomes **Print the job order**.
3. Press it, then use your browser's Print (Ctrl+P). Every person you encoded
   is on it, with both summary grids underneath.
4. Check the arithmetic on the paper by hand. That is the whole point of it
   adding up its own rows.

| What | How | Result |
|---|---|---|
| Nothing about the counting changed | `npm test` | 844 tests |
| The sheet at A4, in print media | headless browser | white ground, black text, no overflow; the Price/Remarks collision found and fixed |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

---

## Phase 14 — Dabz Apparel online orders ✅

**What it is.** A customer orders jerseys from their phone without chatting
first, and the shop pushes that order through production without the details
living in a Messenger thread. It has its own specification, which arrived as a
separate document: `docs/spec.md`. Read that, then `docs/open-questions.md`
(what is waiting on the owner, and every place that spec had to be mapped onto
this system's own rules) and `docs/progress.md` (what is built, and how to
check it in a browser).

**What the owner gets**

| Where | What |
|---|---|
| `/shop` | The customer's shop: search, categories, sorting, a product page that asks for a roster or a size tally, the jersey design gallery, an order, a checkout and a receipt with a Messenger button |
| `/shop/track` | Track my order, with the order number **and** the mobile it was placed with |
| `/online-orders` | The orders, five tiles and a row of filters |
| `/online-orders/[number]` | One order: items, roster, the message to paste into Messenger, the history, the moves, the steps, the money, the customer |
| `/online-orders/production` | **Online production** in the rail — every order in the card for the step it is waiting for. Not the same screen as Phase 12's production report, which is the shop's own benches |
| `/online-orders/calendar` | The month of due dates, with the FULL marker once a capacity is set |
| `/online-orders/reports` | Sales booked, cash collected, orders, average order, the target meter and three charts |
| `/online-orders/products`, `/online-orders/designs` | The catalogue and the design gallery, Owner/Admin only |

**Decisions made here** (all in `docs/open-questions.md`, with how to change
each one back)

- Money stays whole centavos, not the `numeric(10,2)` the spec asks for.
- Tables are prefixed `online_`: `products`, `customers` and `payments` already
  exist here and mean other things.
- Settings are columns on `app_settings`, not a key/value table, so the
  behind-a-migration rule and the column probes can both see them.
- The shop is at `/shop`, because `/` is already the shop's public page.
- The module's screens are sections of the existing app behind the existing
  sidebar, with their own tab bar, rather than a second `/admin` area.
- **Nothing is seeded but structure** — the five categories and the eight
  production stages. No products, no designs, no orders, no capacity, no target.

**How it is verified**

| What | How | Result |
|---|---|---|
| The module's rules: quantities, totals, the quote split, every status move, the production paths, the calendar, the sorting, the report buckets, `messageFor` | `npm test` | 1,054 tests (262 new) |
| Security: a stranger reads the catalogue and nothing else, no order table can be written to directly, `anon` cannot call `create_online_order`, five different people | `npm run test:rls` | `17_online_orders_rls.test.sql`, all passing |
| Every table and column the app asks for | `npm run check:schema` | 63 relations |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

**Not built, and why**

The nine Playwright end-to-end tests the spec asks for (section 14). Every one
of them begins with either a signed-in staff member or a database full of
products, and Supabase Auth cannot be run here. What covers each of them
instead is listed in `docs/open-questions.md`.

**After deploying**, run `npm run db:push` for `0019`, then open
**System check** — it now asks about the sixteen new tables and the two views.

**Note the numbering.** This module was built alongside two others and gave way
to both: the production report took Phase 12 and `0018`, then the project
encoder took Phase 13 and `0019`, so the online shop is Phase 14 and `0020`.
Two migrations sharing a four-digit prefix are ONE version to
`supabase_migrations.schema_migrations`, and the second to be pushed is
recorded as already applied and silently skipped - which shows up as a screen
reporting PHP 0.00 rather than as an error. Renumbering the newer branch is
always cheaper than finding that out from production.
---

## 22 September 2026 — deleting a project written by mistake

**What you asked for**

> "Add also a delete button for an encoded project, but pop up a verification
> if it is going to really delete."

**The rule it had to get past**

Since Phase 6 a job order has had **no delete policy at all**: an order is
cancelled with a reason, never erased, because the customer may be holding the
sheet. That is still right for every real job — and it never covered the one
you were actually asking about, a project typed in by mistake. A wrong team
name, a duplicate, a test entry: "cancelled" is the right answer for a job that
fell through and an odd one for a typo five seconds old, which then sits on the
list for ever.

So the door is not opened. A gap is opened in it **exactly the width of the
mistake**, using the rule the rest of the system already follows: *delete only
where nothing has happened.*

**Built**

- **A Delete this project card** at the bottom of a project, for you and any
  admin. Not for staff: deleting a whole project is not counter work, and a
  staff member cancels it instead — the same shape as voiding a sale.
- **It asks first, and names the project**, using the same confirmation the
  Bills, Loans and Products screens have used since Phase 2. "Are you sure?"
  beside eleven identical cards is a question about nothing in particular.
- **The confirmation says what goes with it** — how many people and how many
  items — because they cascade away and that is the point of reading it.
- **Three things stop it**, and each is proven on its own: a **payment**
  (voided or not — its ledger entries are still pointing at it), a
  **production mark** on any item, or the project having been **released**.
  Each one makes the card show the reason instead of the button. A missing
  button teaches nothing.
- **And the reason comes with the button that acts on it.** When a project is
  too far along to delete, the card offers **Cancel this project instead**
  right there — telling somebody to cancel it while leaving them to go and
  find the button that cancels it is the mistake the project calendar made
  when its only way in was a line of grey text. It is not offered on a
  released or already-cancelled project, where cancelling is correctly
  impossible: a button that is not there beats one that refuses. The cancel
  form is now ONE component used in both places, so the two cannot drift
  apart on what they say.
- **Cancelled is not one of them.** Cancelling records a decision about the
  work, not that money moved, and a project cancelled by mistake is exactly
  what this is for.
- **The whole project is written to Activity first** — every person, every
  item, the contact details, the note — because all of it cascades away and
  that log is the only record of it afterwards.

**How to check it**

1. Open a project you have just written, with nothing else done to it. The
   card at the bottom offers **Delete**. Press it: it asks, and names the
   project and what goes with it. Press again and it is gone; **Activity**
   has the whole thing.
2. On a project with a payment taken, the card says so instead and offers
   cancelling. Same for one with a bench ticked on **Production report**, and
   for one already released.
3. Tick a bench, then clear it again: the project becomes deletable. The rule
   is about what *has* happened, and somebody clearing a tick is saying it did
   not.
4. Sign in as a staff member with **Apparel job orders**: there is no card at
   all, and the project is theirs to cancel.

| What | How | Result |
|---|---|---|
| The sentences the owner reads, over every kind | `npm test` | 1113 tests (3 new) |
| The policy, the three stoppers, and that nobody else may, against a real PostgreSQL | `npm run test:rls` | 469 checks, 18 of them new |
| Every table and column the app asks for | `npm run check:schema` | 292 table references, 1318 column references |
| Types, code style, production build | `npm run typecheck`, `npm run lint`, `npm run build` | clean |

Two existing security tests were touched, and both deliberately. Phase 12's
suite asserted a job order could never be deleted; it now asserts the new rule,
because the project it uses has had its only item removed and so qualifies.
Phase 13's still refuses — but for a stated reason now, its bench marks, rather
than because deleting was impossible.

---

## Later, and not in the first build

Push notifications to a phone, and anything that needs a Meta app: the
Messenger API, Meta Ads tracking and a chatbot. They wait until the system
above has been used for a while, and until the shop wants to set up the
accounts they need.
