# Dabz System

Business management system for **Dabz Printshoppe**, **Dabz Apparel** and
**DabzTech Solutions** — money in and out, bills and loans, staff and payroll,
point of sale, job orders, repairs and stock.

Owner: Eddie boy Garcia · Founded 18 June 2017 · Philippines · Philippine peso
(₱) · Asia/Manila

> **Status: Phases 1–9 complete — the system the specification asked for is
> built.** Logins and permissions, bills and loans, the money ledger, staff and
> payroll, the printing counter, expenses and stocks, Dabz Apparel job orders,
> DabzTech repair tickets, reports that add all of it up, and now a **public
> page** customers can find you on and send a message from. What is left needs
> accounts the shop does not yet have: the Messenger API, Meta Ads tracking, a
> chatbot and push notifications. See [docs/PHASES.md](docs/PHASES.md).

## Two things worth knowing up front

**You do not have to set everything up before you start.** Every figure only
you can know — a bill's due day, a loan's interest rate, a staff daily rate, a
product price, a material's reorder level — starts empty on purpose, and the
system runs anyway. It says
what it cannot do without each one rather than guessing. The **To fill in**
screen gathers them all in one place, so you can work through them over weeks
while the shop is open.

**It runs on a desktop, a tablet and a phone.** The counter puts the sale
total and the pay button in a fixed bar at the bottom on a tablet or phone, so
they are always in reach; on a desktop the sale sits beside the buttons. Every
screen is checked at four sizes — 390px phone, 768px tablet portrait, 1024px
tablet landscape and 1440px desktop.

---

## What the parts are, in plain language

You are running four separate things. It helps to know which is which, because
when something breaks, the fix depends on which part broke.

| Part | What it actually is | Think of it as |
|---|---|---|
| **Next.js** | The program that draws every screen and handles button presses. Written in TypeScript. | The shop counter and the staff behind it |
| **Supabase** | The database in the cloud. Also handles logins and stores photos. Really PostgreSQL underneath. | The filing cabinet and the safe |
| **Vercel** | The company that runs the Next.js program on the internet so you can open it from any device. | The building the counter sits in |
| **Vitest** | Runs the automated money checks. | The auditor who re-adds every total |

**TypeScript** is just JavaScript with labels on things. When you say an amount
is a whole number, TypeScript complains *before* you run the code if something
tries to put "12.50" there. That is the whole benefit: mistakes get caught while
writing, not while a customer is waiting.

### One rule that shapes the whole codebase

**Money is stored as whole centavos, never decimals.** ₱12.50 is stored as
`1250`.

Computers cannot hold 12.50 exactly, so decimals slowly drift — add a thousand
sales and your total is off by a centavo or two, and the drawer no longer
matches the report. Whole numbers never drift. The conversion to "₱12.50"
happens only at the last moment, on screen or on a receipt.

That rule lives in [`src/lib/money.ts`](src/lib/money.ts) and is covered by the
tests in [`src/lib/money.test.ts`](src/lib/money.test.ts).

---

## Running it on your own computer

You need [Node.js](https://nodejs.org) version 22 or newer. Check with
`node -v`.

```bash
npm install          # download everything the project needs (first time only)
npm run dev          # start the shop system on your computer
```

Then open **http://localhost:3000**.

`npm run dev` keeps running and watches your files: save a change and the
browser updates by itself. Stop it with `Ctrl+C`.

The screen works even before Supabase exists — it will say **"Setup needed"**
on the database card. That is expected on day one.

### Connecting the database

1. Follow [docs/SETUP.md](docs/SETUP.md) to create the free Supabase project and
   run the migration files in `supabase/migrations/`, in number order.
2. Copy the settings template and fill in the three values:
   ```bash
   cp .env.example .env.local
   ```
3. Stop `npm run dev` and start it again (settings are only read at startup).
4. Open **http://localhost:3000/setup** once, to create your owner account.

After that, sign in at **/login**.

### The three keys, and why one is different

`.env.local` holds three values. Two are safe in a browser; one is not.

| Setting | Safe in a browser? |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes — the database still decides what each person may see |
| `SUPABASE_SERVICE_ROLE_KEY` | **No. Never.** It bypasses all security |

The `NEXT_PUBLIC_` prefix is what sends a value to the browser, so the secret
key deliberately does not have it. The code that uses it is also marked
server-only, so the build fails rather than leaking it by accident.

---

## The commands you will use

| Command | What it does | When |
|---|---|---|
| `npm run dev` | Runs the system on your computer | While building or trying things |
| `npm test` | Re-checks every money calculation | Before pushing any change to money |
| `npm run test:watch` | Re-runs tests automatically as you edit | While working on a calculation |
| `npm run typecheck` | Finds mistakes without running anything | Before pushing |
| `npm run lint` | Checks code style | Before pushing |
| `npm run build` | Makes the fast version used on the internet | To confirm it will deploy |
| `npm run test:rls` | Proves the security rules against a real database | After changing anything in `supabase/` |
| `npm run check:schema` | Confirms every column the app asks for exists | After changing a query or a migration |

The last two need PostgreSQL on the machine, so they are for whoever is
developing, not for the shop. Everything else runs anywhere.

### What a passing test run looks like

```
 Test Files  18 passed (18)
      Tests  461 passed (461)
```

If it says **failed**, read the lines above it — Vitest prints what it expected
and what it got. A failing money test means real money would have been wrong,
so nothing should be deployed until it passes.

---

## Where things live

```
src/
  proxy.ts            Runs before every request: refreshes the session,
                      sends signed-out visitors to the login screen -
                      except on "/", which is the shop's public page
  app/
    layout.tsx        The frame every screen sits in (font, theme)
    globals.css       THE DESIGN SYSTEM - all Dabz colours and sizes
    login/            Sign in, and the sign-out action
    setup/            First-time setup: creates the owner account, once
    change-password/  Choosing a new password
    (public)/         The shop's page at "/" - no sign-in, and the one
                      form a stranger may send into the system
    (app)/            Every screen you must be signed in to see
      layout.tsx        Top bar, navigation, idle sign-out
      overview/         The owner's home
      enquiries/        Messages sent from the public page
      staff/            Accounts, roles, permission checkboxes
      settings/         Working days, hours, staff limits, public details
      activity/         The audit log and sign-in history
  components/
    ui.tsx            Buttons, cards, fields, notices - used everywhere
    AppTopBar.tsx     Black frosted top bar with the navigation
    AutoLogout.tsx    Signs an idle person out
    ThemeToggle.tsx   Light / dark switch
  lib/
    money.ts          Centavos: parsing, formatting, discounts, change
    settings.ts       Shop settings, approval limits, public details
    enquiries.ts      Checking and counting messages from customers
    audit.ts          Writing the audit log
    divisions.ts      The three divisions as data
    datetime.ts       Manila-time formatting
    auth/
      permissions.ts  Who may do what
      navigation.ts   Which sections a person sees
      credentials.ts  Usernames, temporary passwords, the lockout
      dal.ts          "Who is asking?" - checked by every screen
    supabase/         Database connections (browser, server, admin)
supabase/
  migrations/         Database changes, in order, as .sql files
  tests/              Security tests for the rules above (optional)
scripts/
  check-schema-usage.mjs   Catches a misspelled column before you do
docs/
  SETUP.md            Step-by-step Supabase and Vercel setup
  PHASES.md           The build plan and what is done
  DECISIONS.md        Questions still open, and answers already given
```

### How the security works

Three layers, and the important one is the last:

1. **The navigation** hides sections a person may not open. A courtesy, not
   security.
2. **Every screen and every action** re-checks who is asking, through
   `src/lib/auth/dal.ts`. A button being hidden is not enough — the action
   behind it checks too.
3. **The database itself** refuses the data, through PostgreSQL Row Level
   Security. Even if layers 1 and 2 had a bug, a staff member asking for
   payroll gets nothing back.

That third layer is why `npm run test:rls` exists: it proves the rules against
a real database instead of trusting that the code reads correctly.

**The one exception, and how it is fenced.** Since Phase 9 a stranger can send
the shop a message from the public page. That is the only write in the whole
system that does not start with somebody signed in, so the `enquiries` table has
**no insert policy at all** — there is no way into it from a browser. The single
way in is one server function that checks every field, caps every length,
silently drops anything filling a hidden field no person can see, and refuses
more than five messages an hour from the same address. Enquiries are then read
by the owner and admins only: a message carries a stranger's name and phone
number.

### About `globals.css`

Colours are **not** written into individual screens. They are defined once in
`globals.css` as tokens (`--surface`, `--ink`, `--accent`, ...) with a light
value and a dark value. A screen says `bg-surface text-ink` and automatically
looks correct in both modes. To change the whole system's look, change that one
file.

Warnings always use an **icon (⚠) and a word**, never colour alone — because
red is the Dabz brand colour and a red label would look like a button
(spec 3.2).

---

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — create the Supabase project, deploy to Vercel
- [docs/PHASES.md](docs/PHASES.md) — the 10 build phases and current progress
- [docs/DECISIONS.md](docs/DECISIONS.md) — open questions for the owner
