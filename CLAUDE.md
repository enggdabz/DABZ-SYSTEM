@AGENTS.md

# DABZ System

Next.js (App Router) front end over an existing Supabase Postgres database.

## The database is the source of truth

The Supabase project already contains a complete 42-table business system with
row level security on every table and ~24 SQL functions holding the business
rules. **It predates this codebase and must not be recreated or reset.**

- Never write a migration that creates tables which already exist.
- Regenerate types instead of hand-editing them: `npm run db:types`.
- `src/lib/types/database.ts` is generated output. Do not edit it.
- Prefer calling the existing SQL functions (`complete_sale`, `record_expense`,
  `void_sale`, `mark_payroll_paid`, …) over reimplementing their logic in TypeScript.

## Auth model

- Staff sign in with a **username**, not an email. Supabase Auth keys accounts by
  email, so `SUPABASE_USERNAME_EMAIL_DOMAIN` bridges the two.
- Roles are `owner`, `admin`, `staff` (`profiles.role`). There is no customer role.
- `staff` is further limited by rows in `user_permissions`; `owner` and `admin`
  bypass those checks, matching `public.has_permission()`.
- Server-side role checks in `src/lib/auth.ts` decide what to render. Row level
  security in Postgres is the actual security boundary — keep both in step.

## Conventions

- Money is stored as integer **centavos**. Never use floats for currency.
- Route protection lives in `src/proxy.ts` (Next.js 16 renamed `middleware` to `proxy`).
- Use `createClient()` from `src/lib/supabase/server.ts` in server code. Reach for
  `createAdminClient()` only when RLS genuinely cannot express the operation.
