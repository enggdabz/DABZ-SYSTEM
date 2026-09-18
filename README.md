# Dabz System

Business management system for **Dabz Printshoppe**, **Dabz Apparel** and
**DabzTech Solutions** — money in and out, bills and loans, staff and payroll,
point of sale, job orders, repairs and stock.

Owner: Eddie boy Garcia · Founded 18 June 2017 · Philippines · Philippine peso
(₱) · Asia/Manila

> **Status: Phase 0 complete.** The project runs, the design system is in place,
> and the money rules are tested. No real business data yet — that starts in
> Phase 1. See [docs/PHASES.md](docs/PHASES.md).

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

1. Follow [docs/SETUP.md](docs/SETUP.md) to create the free Supabase project.
2. Copy the settings template and fill it in:
   ```bash
   cp .env.example .env.local
   ```
3. Stop `npm run dev` and start it again (settings are only read at startup).

The database card should turn to **"Connected ✓"**.

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

### What a passing test run looks like

```
 Test Files  1 passed (1)
      Tests  24 passed (24)
```

If it says **failed**, read the lines above it — Vitest prints what it expected
and what it got. A failing money test means real money would have been wrong,
so nothing should be deployed until it passes.

---

## Where things live

```
src/
  app/
    layout.tsx        The frame every screen sits in (font, theme, top bar slot)
    page.tsx          The Phase 0 hello screen
    globals.css       THE DESIGN SYSTEM - all Dabz colours and sizes
  components/
    TopBar.tsx        Black frosted top bar
    ThemeToggle.tsx   Light / dark switch
  lib/
    money.ts          Centavos: parsing, formatting, discounts, change
    money.test.ts     The automated money checks
    divisions.ts      The three divisions as data
    datetime.ts       Manila-time formatting
    health.ts         "Can we reach the database?" check
    supabase/         Database connection (browser + server)
supabase/
  migrations/         Database changes, in order, as .sql files
docs/
  SETUP.md            Step-by-step Supabase and Vercel setup
  PHASES.md           The build plan and what is done
  DECISIONS.md        Questions still open, and answers already given
```

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
