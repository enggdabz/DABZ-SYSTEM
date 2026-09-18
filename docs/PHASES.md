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
| 4 | Customers + Dabz Printshoppe POS | ✅ **Done — waiting on owner to confirm** |
| 5 | Expenses pop-up and stocks | Next |
| 6 | Dabz Apparel job orders | Not started |
| 7 | DabzTech Solutions job tickets | Not started |
| 8 | Reports | Not started |
| 9 | Later: public website, Messenger, Meta Ads, chatbot, notifications | Not in first build |

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
- **Dates are Manila dates.** At 01:30 on 1 October in Bacolod it is still
  17:30 on 30 September in UTC. A bill checked against the UTC date would look
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

## Phase 5 — Expenses and stocks (next)

Needs, when convenient: your most frequent purchases and suppliers (17.14), and
your main materials with their units and reorder levels (17.15). As before, I
will build the machinery and you fill in the figures.

- The expenses pop-up, aimed at under ten seconds per entry, with quick picks.
- Stock items with photos, stock in/out, history, low-stock alerts and counts.
- Supplier payables for anything received but not yet paid for.
- Once material costs are tracked, the daily target can finally compare against
  **profit** rather than sales.
