# Online Orders — what is built, how to check it, what is next

Read `docs/spec.md` first (the module's specification), then
`docs/open-questions.md` (what is waiting on the owner, and every place that
spec was mapped onto the system that already existed).

This file is the handover note. A session starts with no memory of the last
one.

---

## Where it stands

| Milestone | State |
| --- | --- |
| M0 — docs, tokens, shells | ✅ |
| M1 — database, RLS, views, storage | ✅ |
| M2 — admin products and designs | ✅ |
| M3 — public catalogue | ✅ |
| M4 — cart, checkout, order creation, track | ✅ |
| M5 — admin orders and the order page | ✅ |
| M6 — production steps and board | ✅ |
| M7 — calendar | ✅ |
| M8 — reports and settings | ✅ |
| M9 — hardening | ✅ except the Playwright suite (see below) |

**One acceptance criterion of spec 16 is not met**, and it is the same one
throughout: the nine end-to-end tests of spec 14. The reason and what covers
each of them instead are in `docs/open-questions.md` under "Playwright is not
wired up". Everything else in that table is done.

---

## Turning it on

The code is deployed the moment the branch merges; the database is not.

1. **`npm run db:push`** applies `0019`, which creates sixteen tables, two
   views, three storage buckets and the six new settings columns. Then open
   **System check** (`/system`) — it now asks the live database about every one
   of them by name.
2. **Settings → The online shop.** Two figures are yours and start empty:
   how many pieces you can finish for one date, and the monthly sales target.
   Leaving either empty is a real answer — the calendar then marks no day full
   and Reports show no meter, rather than inventing a number. They are both on
   the **To fill in** screen until you decide.
3. **Settings → Your public page → Messenger name**, if it is not already set.
   Without it the "Continue on Messenger" button on the receipt is hidden.
4. **Manage → Online shop** and add your first product. Until then the shop is
   empty, and a customer is told so honestly.
5. Optional: `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` in Vercel, for the
   new-order email. Without them a new order still reaches your phone through
   the notifications from Phase 11.

---

## How to check it in a browser

**As a customer**, with no sign-in at all:

| Open | You should see |
| --- | --- |
| `/` | An "Order jerseys online" button, first on the page |
| `/shop` | The hero, the three steps, the designs strip, and the products with search, category chips and a sort |
| `/shop/products/<slug>` | The price, the options, the design picker, and either a team roster, a box per size, or one quantity — with the pieces and the running price adding up as you type |
| `/shop/order` | Your lines, the size summary, and a total that says "₱2,700 + quote" when part of the order has no price yet |
| `/shop/order/details` | The address asked for only if you chose delivery, and a date box that will not offer a date the shop would refuse |
| `/shop/order/received/<token>` | The order number very large, and Continue on Messenger |
| `/shop/track` | Your own order, with its production steps — and one flat refusal if the number and the mobile do not match |

**As the shop**, signed in:

| Open | You should see |
| --- | --- |
| **Online orders** | Five tiles, the filter chips, and the orders with the soonest due at the top |
| An order | The items and the roster, the message to paste into Messenger, the history, the moves that are allowed, the steps, the money and the customer |
| **Production board** | Every order in the card for the step it is waiting for. Tap OK and it moves to the next card |
| **Calendar** | The month of due dates. With a capacity set, a day over it is marked FULL in red |
| **Reports** (owner/admin) | This month against the same days of last month, the target meter, and three charts — each with a **Show table** toggle |

---

## Verifying

The same five commands as the rest of the system (`AGENTS.md`):

```bash
npm test              # 1,054 unit tests, 262 of them this module's
npm run test:rls      # the security rules against a real PostgreSQL
npm run check:schema  # every table and column the app asks for exists
npm run typecheck && npm run lint && npm run build
```

`test:rls` and `check:schema` need a local PostgreSQL. Point them at one with
`PGHOST`/`PGPORT`/`PGUSER`.

A sixth thing was checked in a browser and is worth knowing about, because it
could not have been caught any other way: **the proxy has to let a customer
in.** It only redirects once Supabase is configured, so a page missing from
`src/lib/auth/public-paths.ts` works perfectly on a developer's machine and
sends every customer to a staff login screen on the day it goes live. That
file now has its own tests, and the behaviour was confirmed against a stand-in
Supabase answering 401: every `/shop` page 200, `/overview` and
`/online-orders` redirected to the login screen.

**What was checked in a browser**, because no unit test can see a pixel:
every customer-facing page at 390, 768, 1024 and 1440 px in both themes — no
sideways scroll anywhere — and every computed colour on those pages against
spec 5.1 (red, gold and neutrals only; the two places it bends are written
down in `docs/open-questions.md`). The cart was exercised for real: lines,
the size summary from a roster, the "+ quote" total, removing a line updating
the header, and a corrupted `localStorage` reading as an empty order rather
than a white screen.

---

## What is NOT built

- **The nine Playwright tests** (spec 14). See `docs/open-questions.md`.
- **Online payment.** `online_payments.method` can hold `gateway` and the
  table keeps a `gateway_ref`, so PayMongo can be wired in later without a
  migration. Nothing charges anybody, and the payment form refuses `gateway`
  so nobody can type one in by hand.
- **Messenger automation.** `customers.messenger_psid` is a column and nothing
  more. Sending a message needs a Meta app, a page token and Meta's own app
  review — the owner's to obtain.
- **A link between an online order and the shop's ledger.** A payment here is
  recorded against the order and nowhere else, so the three sanctioned ways
  money reaches the ledger stay three. Whether an online order is the same
  money as an apparel job order is a decision about the books; see
  `docs/open-questions.md`.

---

## If you are picking this up next

Start with `docs/open-questions.md`. Section 1 is what the owner still has to
answer, and none of it blocks anything — every one of those is a real empty
state the screens already handle. Section 2 is every place this module differs
from `docs/spec.md` and why, which is the thing that is hardest to work out by
reading the code.

Then, in rough order of value:

0. **Check the storage policies landed.** `0018` creates three buckets and the
   policies on `storage.objects` that guard them. If your project's `postgres`
   role may not write those, the migration says so by name and tells you to
   paste that block into the SQL editor - it fails rather than skipping,
   because a bucket with no write policy is one nobody can upload to and the
   screen would just do nothing.
1. **Wire up Playwright** against a Supabase project with a seeded staff
   account. The nine flows are listed in spec 14.
2. **Ask the owner about the ledger.** It is the one structural question the
   module left open, and it gets harder the more orders there are.
3. **Reorderable product photos.** The form uploads and removes them; the
   order is the order they were added in.
4. **Paginate the orders list** past a few hundred rows. It reads every order
   today, which is right for a shop this size and will not stay right.
