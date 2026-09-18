# Build plan

From section 16 of the specification. One phase at a time; a phase does not
start until the owner has confirmed the previous one works.

Each phase ends with: what was built, how to run it, how to test it.

| # | Phase | Status |
|---|---|---|
| 0 | Setup & learning | ✅ **Done — waiting on owner to confirm** |
| 1 | Foundation: design system, top nav, login, roles, permissions, audit log, settings | Not started |
| 2 | Bills, loans, ledger, Overview (the money side) | Not started |
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

## Phase 1 — Foundation (next)

Planned, pending the answers marked **needed for Phase 1** in
[DECISIONS.md](DECISIONS.md):

- Real database tables for users, roles, permissions, settings and the audit log
  — every one with Row Level Security.
- Username + password login, no public sign-up, temporary passwords that must be
  changed on first use, account lock after 5 failed attempts, auto-logout, and a
  **Switch user** button for the shared counter computer (spec 4.1).
- Owner / Admin / Staff roles and the per-staff permission checkboxes (spec 4.2,
  4.3).
- The audit log: who did what, when, with before and after values (spec 2.1).
- Settings: working days per month, work hours, week start, staff expense limit,
  staff discount limit.
- The real navigation bar, with only the sections a person is allowed to see.

**Logging in is not timing in.** The time clock is a separate action, and it
arrives in Phase 3.
