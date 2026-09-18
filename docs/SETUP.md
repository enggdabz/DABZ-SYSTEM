# Setup: the database and putting it online

Two jobs, about 30 minutes total. Do them in order. Nothing here costs money.

- [Part 1 — Create the Supabase database](#part-1--create-the-supabase-database)
- [Part 2 — Put the system online with Vercel](#part-2--put-the-system-online-with-vercel)
- [Costs](#what-this-costs)
- [If something goes wrong](#if-something-goes-wrong)

---

## Part 1 — Create the Supabase database

### 1. Make the project

1. Go to **https://supabase.com** and sign up (signing in with GitHub is
   easiest, since the code already lives there).
2. Click **New project**.
3. Fill in:
   - **Name:** `dabz-system`
   - **Database password:** click Generate, then **save it in your password
     manager**. You will rarely need it, but it cannot be recovered later — only
     reset.
   - **Region:** **Southeast Asia (Singapore)**. This is the closest one to the
     Philippines, which makes every screen faster.
4. Click **Create new project** and wait about two minutes.

### 2. Create the first table

1. In the left sidebar click **SQL Editor**, then **New query**.
2. Open the file `supabase/migrations/0000_phase0_hello.sql` from this project,
   copy everything in it, and paste it into the editor.
3. Click **Run**.

You should see *Success. No rows returned*. That is correct — the file creates a
table rather than reading one.

> **What you just did:** created a one-row table whose only purpose is to prove
> the app can reach the database, and switched on **Row Level Security** for it.
> RLS means the database itself refuses to hand out rows unless a rule says it
> may. Every table in this system will have it on, so a mistake in the app can
> never leak staff salaries or customer records.

### 3. Copy the two settings into the project

1. In Supabase, go to **Project Settings** (the gear) → **API**.
2. You need two values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - The **public** key, labelled **anon public** or **publishable**
3. On your computer, in the project folder:
   ```bash
   cp .env.example .env.local
   ```
4. Open `.env.local` in a text editor and paste the values in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=paste-the-public-key-here
   ```
5. Save the file, then restart the app:
   ```bash
   npm run dev
   ```

Open http://localhost:3000. The database card should now read
**Connected ✓ — Dabz database is connected**.

### ⚠ About the two keys

Supabase shows you more than one key. The difference matters:

| Key | Safe in the browser? | Use it |
|---|---|---|
| **anon** / **publishable** | Yes | This is the one that goes in `.env.local` |
| **service_role** / **secret** | **No, never** | Skips all security. Server-side only, and we do not need it yet |

If the secret key ever ends up in a browser or a screenshot, go to
**Project Settings → API → Reset** and generate a new one.

---

## Part 2 — Put the system online with Vercel

Do this once the database is connected. It gives you a web address you can open
from the counter computer and from your phone.

1. Go to **https://vercel.com** and sign up **with GitHub**.
2. Click **Add New → Project**.
3. Find the `dabz-system` repository and click **Import**.
4. Before clicking Deploy, open **Environment Variables** and add the same two
   values from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   This step is the one people forget. Vercel cannot see your `.env.local` file
   — that file never leaves your computer — so the settings must be entered
   here as well.
5. Click **Deploy** and wait a couple of minutes.

You get an address like `https://dabz-system.vercel.app`. Open it on your phone
and add it to your home screen; it behaves like an app.

From now on, every time new code is pushed to GitHub, Vercel rebuilds the site
by itself.

> **Note on the address:** a `.vercel.app` address is fine to start with. Later
> you can point your own domain (for example `system.dabzprintshoppe.com`) at it
> from Vercel's Domains tab.

---

## What this costs

| Service | Free tier | When you would outgrow it |
|---|---|---|
| **Supabase** | 500 MB database, 1 GB file storage, 50,000 signed-in users/month | The 1 GB of storage is the realistic limit — unit photos and layout files add up. Paid tier is about US$25/month (roughly ₱1,400) |
| **Vercel** | Plenty for one shop | Only if the site gets heavy public traffic, which a shop system will not |

A printing shop with a handful of staff fits inside both free tiers. Expect
**₱0/month** to start.

Two things to keep in mind:

- A free Supabase project is **paused after about a week with no activity**.
  Daily use prevents this; if it does pause, one click in the dashboard restores
  it.
- Free-tier backups are limited. Before the system holds real money records,
  turn on scheduled backups (paid) or export a copy regularly. Worth revisiting
  at the end of Phase 2.

---

## If something goes wrong

**The database card still says "Setup needed"**
The app only reads settings when it starts. Stop `npm run dev` with `Ctrl+C` and
start it again. Also check the file is named exactly `.env.local` — not
`.env.local.txt`.

**"The database answered with an error"**
The connection works but the table is missing. Re-run
`supabase/migrations/0000_phase0_hello.sql` in the SQL Editor.

**"Could not reach the database"**
Check the Project URL for a typo, and check your internet connection. If the
Supabase dashboard shows the project as paused, resume it.

**It works on my computer but not on Vercel**
You almost certainly skipped step 4 of Part 2. Go to the Vercel project →
Settings → Environment Variables, add the two values, then **Redeploy**.

**Anything else** — tell me what the screen says and I will work it out with you.
