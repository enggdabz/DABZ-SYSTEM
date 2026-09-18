# Build plan

From section 16 of the specification. One phase at a time; a phase does not
start until the owner has confirmed the previous one works.

Each phase ends with: what was built, how to run it, how to test it.

| # | Phase | Status |
|---|---|---|
| 0 | Setup & learning | ✅ Done |
| 1 | Foundation: design system, top nav, login, roles, permissions, audit log, settings | ✅ **Done — waiting on owner to confirm** |
| 2 | Bills, loans, ledger, Overview (the money side) | Next |
| 3 | Staff: profiles, time clock, weekly payroll, cash advances, payslips | Not started |
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

## Phase 2 — Bills, loans, ledger, Overview (next)

Needs the answers marked **needed for Phase 2** in [DECISIONS.md](DECISIONS.md)
— chiefly the due day of the month for each of the 11 bills.

- The 11 fixed bills and 6 loans from spec 12.1 and 12.2, seeded as starting
  data.
- Bill status per month, **Mark paid** with undo, and the 5-day reminder pop-up.
- Loan balances, interest, months-to-payoff, and the **⚠ Balance growing**
  warning when a monthly payment is no more than the monthly interest.
- The money-in/money-out ledger, with entries created automatically by the other
  modules so nothing is typed twice.
- The daily target, and the Overview screen from spec 15.1.
