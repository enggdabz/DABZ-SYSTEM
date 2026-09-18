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

### 3. Create the rest of the tables

Repeat step 2 for each remaining migration file, **in number order**:

| File | What it creates |
|---|---|
| `0001_phase1_foundation.sql` | Accounts, permissions, settings, the audit log, sign-in history |
| `0002_phase2_money.sql` | Bills, loans and the money in/out ledger — **and seeds your eleven real bills and six loans** |
| `0003_phase3_staff.sql` | Staff records, the time clock, weekly payroll and cash advances |

Every table gets Row Level Security switched on.

After `0002` runs, your bills and loans are already in the system: ₱141,127.00
of monthly bills and ₱1,336,264.00 of debt, taken from what you told me. Two
things are deliberately left blank, because a guess would be worse than a
gap — every bill's **due day**, and every loan's **interest rate**. The screens
ask you for them.

> **Run the migration files in number order, and only once each.** They are the
> written history of the database. Never edit one that you have already run;
> later changes arrive as new numbered files.

### 4. Copy the three settings into the project

1. In Supabase, go to **Project Settings** (the gear) → **API**.
2. You need three values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - The **public** key, labelled **anon public** or **publishable**
   - The **secret** key, labelled **service_role** (see the warning below)
3. On your computer, in the project folder:
   ```bash
   cp .env.example .env.local
   ```
4. Open `.env.local` in a text editor and paste the values in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=paste-the-public-key-here
   SUPABASE_SERVICE_ROLE_KEY=paste-the-secret-key-here
   ```
5. Save the file, then restart the app:
   ```bash
   npm run dev
   ```

### 5. Create your owner account

Open **http://localhost:3000/setup**.

Fill in your name, pick a username (for example `eddie`) and choose a password.
That creates the owner account and **closes the setup page forever** — from then
on, every account is created from the Staff screen.

You can now sign in at http://localhost:3000/login.

> **Why there is no sign-up page:** spec 4.1 says only the Owner or an Admin may
> create accounts. The setup page exists purely to solve the first-account
> problem, and it refuses to work the moment any account exists.

### 6. Fill in your bill due days

Open **Bills**. Most of your bills will show **⚠ Due day not set**.

This is the one job the system cannot do for you. Until a bill has a due day it
cannot be counted as overdue, cannot appear in the 5-day reminder, and cannot
warn you before a late fee. Type the day of the month beside each one and press
Save.

While you are there, open **Loans** and enter each interest rate from your
statements. Without the rate the system cannot tell you whether a balance is
growing — which is the single most useful thing it can say about a debt.

### 7. Add your staff and their daily rates

Open **Staff** and add each person. The **daily rate** is the important one:
payroll will not guess a wage, and until at least one rate is set the daily
target on the Home screen covers bills only and says so.

Leave the login blank for anyone who only uses the time clock — that is a
supported setup, not a gap. Give a login to the people who need to see their own
attendance and payslips, or to use the POS later.

### ⚠ About the keys

Supabase gives you more than one key, and the difference matters a great deal:

| Key | Safe in a browser? | What it is for |
|---|---|---|
| **anon** / **publishable** | Yes | Normal use. Row Level Security still decides what each person may see |
| **service_role** / **secret** | **No, never** | Skips *all* security. Used only by the server, for signing in and creating accounts |

The system keeps them apart by their names: anything starting with
`NEXT_PUBLIC_` is sent to the browser, and the secret key deliberately does not
start with it. The code that uses the secret key is also marked server-only, so
the build fails rather than shipping it by accident.

**Never** paste the secret key into a chat, a screenshot, or a file you commit.
If it leaks, go to **Project Settings → API** and reset it immediately — that
invalidates the old one.

---

## Part 2 — Put the system online with Vercel

Do this once the database is connected. It gives you a web address you can open
from the counter computer and from your phone.

1. Go to **https://vercel.com** and sign up **with GitHub**.
2. Click **Add New → Project**.
3. Find the `dabz-system` repository and click **Import**.
4. Before clicking Deploy, open **Environment Variables** and add the same
   three values from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

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
Settings → Environment Variables, add all three values, then **Redeploy**.

**A bill shows "Due day not set"**
That is correct, not a fault — you have not told the system when it falls due.
Type the day of the month beside it on the Bills screen.

**A loan says its payoff time "ignores interest"**
Also correct. Enter the monthly interest rate from that lender's statement and
the figure becomes a real one.

**"Sign in" says the system is not connected to its database**
The `SUPABASE_SERVICE_ROLE_KEY` is missing from `.env.local` (or from Vercel).
Signing in cannot work without it.

**The setup page says setup is already done, but I have no account**
An account row exists without you remembering it. Open Supabase →
**Table Editor** → `profiles` to see what is there.

**I am locked out after five wrong passwords**
Wait 15 minutes and try again. If it is the owner account and you have
forgotten the password, reset it from Supabase → **Authentication** → **Users**.

**Anything else** — tell me what the screen says and I will work it out with you.
