# Build plan

From section 16 of the specification. One phase at a time; a phase does not
start until the owner has confirmed the previous one works.

Each phase ends with: what was built, how to run it, how to test it.

| # | Phase | Status |
|---|---|---|
| 0 | Setup & learning | ✅ Done |
| 1 | Foundation: design system, top nav, login, roles, permissions, audit log, settings | ✅ Done |
| 2 | Bills, loans, ledger, Overview (the money side) | ✅ **Done — waiting on owner to confirm** |
| 3 | Staff: profiles, time clock, weekly payroll, cash advances, payslips | Next |
| 4 | Customers + Dabz Printshoppe POS | Not started |
| 5 | Expenses pop-up and stocks | Not started |
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

## Phase 3 — Staff, attendance, payroll (next)

Needs open decision **17.6** (half days: half the daily rate, or a manual
amount?), and the staff daily rates themselves.

- Staff profiles with photo, daily rate and the rest of spec 13.1.
- The time clock: tap your photo to time in and out, with late and absent flags.
- Weekly payroll at a daily rate, with the per-day overtime choice from
  spec 13.3, cash advance deductions, payslips and locking.
- Once daily rates exist, payroll joins the daily target, and the Overview stops
  under-reporting what the shop needs each day.
