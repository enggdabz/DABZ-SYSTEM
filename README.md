# DABZ-SYSTEM

Next.js 15 + Supabase. This repo currently contains the authentication
foundation: a one-time owner setup, sign in, and a protected page.

## Setup

**1. Install**

```bash
npm install
```

**2. Configure**

```bash
cp .env.example .env.local
```

Fill in the three values. Where each one lives in the Supabase dashboard:

| Variable | Dashboard location |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → Data API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API Keys → *Legacy anon, service_role API keys* → `anon` |
| `SUPABASE_SERVICE_ROLE_KEY` | Same tab → `service_role` (click Reveal) |

`SUPABASE_SERVICE_ROLE_KEY` bypasses row level security. It stays in
`.env.local`, which is gitignored. Never paste it into a browser, a chat, or a
commit.

**3. Run**

```bash
npm run dev
```

**4. Create the owner account**

Open <http://localhost:3000/setup> and fill in the form. The account is created
with its email pre-confirmed, so no confirmation mail is needed and the
project's SMTP setup does not matter.

That page closes itself permanently once any account exists.

**5. Sign in**

Open <http://localhost:3000/login>. A successful sign in lands on `/dashboard`.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Redirects to `/dashboard` or `/login` depending on session |
| `/setup` | One-time owner creation; closes itself after the first account |
| `/login` | Email + password sign in |
| `/dashboard` | Protected; shows the signed-in user |
| `/api/setup` | `POST` — creates the first account, refuses once one exists |
| `/auth/signout` | `POST` — clears the session |

## Notes on the database

The Supabase project already has its schema (`profiles`, `bills`, `loans`,
`customers`, `products`, and others). This repo deliberately ships **no
migrations** so it cannot conflict with what is already there. The auth flow
above touches only `auth.users`, so it works regardless of the table shapes.

Before building features on those tables, confirm row level security is enabled
on each one: Dashboard → Advisors → Security Advisor.

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm run typecheck  # tsc --noEmit
```
