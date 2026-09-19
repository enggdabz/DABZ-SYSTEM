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

### 2. Create the tables — one command

The thirteen files in `supabase/migrations/` are the whole database. The Supabase
CLI runs them all, in order, and remembers which ones it has already run, so it
can never apply one twice.

You need your **project ref**: in Supabase, **Project Settings** → **General**,
the *Reference ID*. It looks like `abcdefghijklmnopqrst`.

```bash
npx supabase login                      # opens your browser, once per computer
npx supabase link --project-ref <your-ref>
npm run db:push
```

`link` asks for your **database password** — the one you chose when you created
the project. If you have lost it, **Project Settings** → **Database** →
*Reset database password*.

You should see all thirteen applied:

```
Applying migration 0000_phase0_hello.sql...
Applying migration 0001_phase1_foundation.sql...
...
Applying migration 0010_finish_password_change.sql...
Applying migration 0011_clear_catalogue_and_allow_delete.sql...
Applying migration 0012_clear_apparel_and_repair_prices.sql...
Finished supabase db push.
```

| File | What it creates |
|---|---|
| `0000_phase0_hello.sql` | One table whose only job is to prove the app can reach the database |
| `0001_phase1_foundation.sql` | Accounts, permissions, settings, the audit log, sign-in history |
| `0002_phase2_money.sql` | Bills, loans and the money in/out ledger |
| `0003_phase3_staff.sql` | Staff records, the time clock, weekly payroll and cash advances |
| `0004_timeclock_own_login.sql` | Tightens the time clock so each person clocks only themselves in |
| `0005_phase4_pos.sql` | Customers, products, sales and the end-of-day count |
| `0006_phase5_expenses_stocks.sql` | Expenses, materials and their movements, suppliers and what you owe them |
| `0007_phase6_apparel.sql` | Dabz Apparel job orders, rosters, sizes and payments |
| `0008_phase7_repairs.sql` | DabzTech tickets, services, parts fitted and payments |
| `0009_phase9_public.sql` | Your public page's details, and messages customers send |
| `0010_finish_password_change.sql` | Lets a person finish the forced password change on their first sign-in |
| `0011_clear_catalogue_and_allow_delete.sql` | Empties the bills, loans and products, so you enter your own — **and lets you delete one you entered wrongly** |
| `0012_clear_apparel_and_repair_prices.sql` | The same for the apparel items and the repair services, and lets you say which service is the checking fee |

Every table gets **Row Level Security** switched on. RLS means the database
itself refuses to hand out rows unless a rule says it may — so a mistake in the
app can never leak staff salaries or customer records.

**Every list starts empty**, because you asked to enter them yourself
(19 September 2026). `0002`, `0005`, `0007` and `0008` used to put in figures
and names from the specification; `0011` and `0012` take them back out. Each
prints how many rows it removed, and how many it kept because they had already
been used. The **Bills**, **Loans**, **Products**, **Apparel prices** and
**Repair prices** screens each have an *Add* form, and the **To fill in**
screen lists every empty one until it has something in it.

The one list that stays is the apparel **size ladder**, XS to 5XL. Those are
not prices — they are the sizes a roster can use, and the add-on beside each
one is already blank and waiting for you.

Nothing is ever guessed for you. A bill's **due day** and a loan's **interest
rate** stay blank until you type them, because a made-up warning gets trusted.

To see what has been applied at any time:

```bash
npm run db:migrations
```

### 3. Or create them by hand, without the CLI

If you would rather not install anything, the same thirteen files can be pasted in:

1. In the left sidebar click **SQL Editor**, then **New query**.
2. Open `supabase/migrations/0000_phase0_hello.sql`, copy everything in it,
   paste it into the editor, and click **Run**. You should see *Success. No rows
   returned* — the file creates a table rather than reading one.
3. Repeat for each remaining file, **in number order**, using the table above.

> **Run the migration files in number order, and only once each.** They are the
> written history of the database. Never edit one that you have already run;
> later changes arrive as new numbered files. The CLI enforces this for you;
> by hand, you have to keep track.

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

> **Note on where the system runs:** `vercel.json` in the repository pins it to
> **Singapore (`sin1`)**, the same place as the database. Vercel's own default
> is Washington, D.C., which put every single database query on a round trip
> across the Pacific and back — the shop felt this as a pause on every screen.
> Because it is a file in the repository rather than a dashboard setting, it
> survives the project ever being deleted and re-imported. If you ever move the
> Supabase project to another region, change this to match it.

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

**`supabase link` says the password is wrong**
It wants the **database** password, not your Supabase account password. Reset it
at **Project Settings** → **Database** → *Reset database password*, then link
again.

**`npm run db:push` says a migration is already applied**
Then it is, and it will not run twice — that is the point of the CLI keeping a
record. `npm run db:migrations` shows you the list.

**`npm run db:push` says my local and remote histories differ**
That happens if some files were pasted into the SQL Editor by hand and others
pushed, so the CLI's record does not match what actually ran.
`npx supabase migration repair --status applied <version>` tells it a file has
already been run — for example `0000`. Do that for each one you pasted by hand,
then push the rest.

**`supabase test db` fails with strange errors**
It is not our test command. That one expects pgTAP tests, and the files in
`supabase/tests/` are plain psql scripts that happen to end in `.test.sql`. Use
`npm run test:rls`.

**Anything else** — tell me what the screen says and I will work it out with you.
