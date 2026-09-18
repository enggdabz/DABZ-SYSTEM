# DABZ System

Admin system for a shop running three divisions — retail sales, DabzTech device
repairs, and apparel job orders — plus the payroll, inventory and bookkeeping
around them.

Next.js 16 (App Router, TypeScript, Tailwind v4) on Vercel, over Supabase Postgres.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase values
npm run dev
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` (run after a build — route types are generated) |
| `npm run db:types` | Regenerate `src/lib/types/database.ts` from the live schema |

## Architecture

```
src/
  proxy.ts               Session refresh + route protection (Next 16 proxy convention)
  app/
    login/               Username + password sign-in
    admin/               Staff-facing dashboard, gated by role
    portal/              Signed-in user's own account and permissions
    actions/auth.ts      Sign-in / sign-out server actions
  lib/
    auth.ts              requireUser / requireRole / hasPermission
    env.ts               Lazy, validated environment access
    supabase/            Browser, server and proxy clients
    types/database.ts    Generated from the live schema — do not edit
```

## Modules

| Module | What it covers |
| --- | --- |
| Sales | Point of sale, price tiers, discounts, voids and void requests |
| DabzTech repairs | Tickets through their status flow, services, parts from stock, payments |
| Apparel job orders | Orders, per-player name and size lists, options, down payments |
| Inventory | Stock levels from movements, receiving, suppliers, payables, customers |
| Expenses & bills | Expense capture and approval, recurring bills, loans |
| Payroll & attendance | Staff, attendance, weekly payroll, cash advances |
| Reports | Ledger, takings per day, day closing against a cash count |
| Settings & users | Accounts, permissions, shop settings, audit log |

## Database

The Supabase project holds the full schema already: sales, repair tickets,
apparel orders, stock and suppliers, payroll and attendance, expenses, bills,
loans, the ledger and day closings, plus `profiles`, `user_permissions` and
`audit_log`.

Row level security is enabled on all 42 tables, and business operations are
implemented as SQL functions (`complete_sale`, `record_repair_payment`,
`mark_payroll_paid`, and so on). This app is a client of that schema — it does
not own it. See `CLAUDE.md` for the rules that follow from that.

### Roles

| Role | Access |
| --- | --- |
| `owner` | Everything, including payroll, reports and settings |
| `admin` | Everything except owner-only controls; bypasses permission checkboxes |
| `staff` | Limited to the permissions granted in `user_permissions` |

Money is stored throughout as integer **centavos**.

## Environment

See `.env.example`. `SUPABASE_SERVICE_ROLE_KEY` bypasses row level security and
must never reach the browser.
