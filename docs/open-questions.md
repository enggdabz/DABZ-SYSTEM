# Online Orders — open questions and mapped decisions

Two lists. The first is what the **owner** still has to answer (spec section 15).
The second is what had to be **decided** to build the module into the system
that already existed, and where to change each one back.

The system's older decisions live in `docs/DECISIONS.md`; the build order lives
in `docs/PHASES.md`. This file is only about the Online Orders module.

---

## 1. Waiting on the owner (spec section 15)

None of these are guessed at. Where an answer is a **figure only the owner can
know** — a price, a capacity, a target — the system leaves it EMPTY, says so on
screen, and lists it on the **To fill in** screen. That is the house rule
(`AGENTS.md`) and it is also spec 0.4: every figure in the prototype is sample
data and must never become a business rule.

| # | Question | What the system does until it is answered |
| --- | --- | --- |
| D1 | Should staff be able to add Messenger and walk-in orders by hand? | Built. **Add order** on the Orders screen saves with `source = 'manual'`, so reports count the whole shop rather than the website half. |
| D2 | Which products, which are fixed price, and at what price | **Nothing is seeded.** The shop is empty until the owner adds products, and every screen says so. See "No sample data" below. |
| D3 | Minimum order and lead time per product | Typed per product on the product form. The form's own defaults are 1 piece and 7 days (spec 6.2), which are the shape of the column, not a price. |
| D4 | Size chart image per product type | None shown. The product form has the upload; nothing is invented. |
| D5 | Delivery areas and fee | Delivery is offered; no fee is shown or added anywhere. The checkout says the fee is settled on Messenger. |
| D6 | Down payment rule | **Empty until the owner sets one**, reusing the existing `apparel_down_payment_percent` setting (Phase 6 made the same decision for job orders). With no percentage set, the Messenger message asks for a down payment without naming a share. |
| D7 | Facebook Page username, and the alert email address | The Messenger button is hidden while the username is empty; the new-order email is skipped while the address is empty. The owner is told on **To fill in**. |
| D8 | Pieces the shop can finish for one due date | **Empty.** The calendar shows no FULL marker and says the shop's daily capacity has not been set. A made-up 60 would turn away a customer on a day the shop was free. |
| D9 | Monthly sales target | **Empty.** Reports show no target meter and say the target has not been set — the same rule as "a daily target of zero means *not known*, never *reached*". |
| D10 | Should customers see the production step list? | Yes (spec default). A switch in Settings turns it off. |
| D11 | Exact brand red and gold | The shop's existing brand colours are used: `--accent` `#d10a0a` and `--apparel-gold` `#ebb417`, already in `globals.css` since Phase 0. Changing them is one edit in that file, as the spec intends. |
| D12 | Domain name | The Vercel default domain. Nothing in the code hard-codes a host. |

---

## 2. Mapped onto the existing system

Spec 0.1: *"If the website system already exists and uses a different stack than
section 3, keep the existing stack and conventions and map this spec onto them.
Do not start a second app next to an existing one."*

It did exist — eleven built phases, its own rules in `AGENTS.md`, 44 tables.
Everything below is that mapping. Each one says what the spec asked for, what
was built, and why.

### Money is integer centavos, not `numeric(10,2)`

Spec 6 asks for `numeric(10,2)`. The whole system stores money as a **whole
number of centavos** (`src/lib/money.ts`), and `AGENTS.md` makes that
non-negotiable: ₱12.50 is `1250`. Two money types in one database is how a
₱0.01 hole appears in a report that adds both up — and spec 1 says the later
finance modules will read these very tables.

So every money column here is `*_centavos bigint`. The peso figures a person
types go through `parsePesos`, and everything printed goes through
`formatPesos`. To change it back, change the columns and delete the helper
calls — but then the ledger and these orders can no longer be added together.

### Peso formatting keeps the centavos

Spec 0.10 asks for `₱12,300`, no decimals unless non-zero. The system's
`formatPesos` always prints two decimals, and every screen in eleven phases uses
it. One module printing `₱12,300` beside ten printing `₱12,300.00` reads as a
bug, so this module uses the house format. Dates already match what the spec
asks for (`Sep 21, 2026`), so `formatCivilDate` is used unchanged.

### Table names are prefixed `online_`

Spec 6.2 names the tables `products`, `orders`, `payments`, `customers`,
`categories`. Three of those already exist here and mean other things: the
Counter's catalogue, the shop's customers, and nothing at all - `payments` is
`ledger_entries` plus three per-division payment tables. So every table this
module adds is prefixed, and the later finance modules can still read them.

### Statuses are `text` with a `check`, not `enum`

Spec 6.1 asks for seven PostgreSQL enums. Every status column in eleven phases
here is `text` with a `check` constraint, and one enum would be the odd one
out - a new value would need a migration where the others need none, and the
`check` says what is allowed in the same place a reader is already looking.

### One extra table, and one extra setting, the spec does not name

`online_rate_events`, which spec 0.3 says to write down here. It is the
server's own notebook: an address and a storage path, so the hourly upload
limit and the ten-minute track limit can be counted per address the way the
enquiry form counts messages, and so the purge can find a file in `tmp/` that
no order claimed. It has no policy of any kind, for anybody.

And `online_shop_enabled`, matching the Phase 9 `public_page_enabled` switch:
a way to take the shop down without removing anything. It ships as true, and
it is not something anybody fills in.

### Products and designs are Owner/Admin, not staff

Spec 4 lets staff manage products and designs. Here they do not: the counter's
products, the apparel price list and the repair services are all set by the
owner and read by everybody, and `AGENTS.md` makes that a rule. A staff member
who could reprice the shop is a different decision from one who can write an
order, and it is the owner's to make. One line in the migration's policies
changes it back.

### The module's screens have a tab bar, AND two rail links

Spec 9 gives the admin its own tab bar. This system's navigation is the
sidebar, which already carries twenty-three links. So the module has both: two
links in the rail - the orders and the production board, the two somebody
opens without being sent there - and the spec's tab bar across the top of
every one of its screens for the other four.

### The palette, and two places it bends

The customer-facing shop obeys spec 5.1: a browser check over every page at
390px in both themes found only red, gold and neutrals. Two honest exceptions:

- **The system's greys carry a 1-2% cool tint** (`#18181b`, `#9a9aa0`), set in
  Phase 0 and shared with every screen in the app. The spec asks for greys with
  no tint at all. The difference is 3 parts in 255, nobody can see it, and
  restyling eleven built phases to close it would be this module changing
  something that is not its own.
- **The admin screens keep the system's warning amber and success green.**
  Those are `--attention` and `--success`, used by every screen since Phase 1,
  and the house rule is that a warning carries an icon and a word as well as a
  colour. Six screens in a different palette from the other twenty-three would
  read as a different application.

### Routes: the shop lives under `/shop`

Spec 8 puts the customer's catalogue at `/`. In this system `/` is already the
**shop's public page** (Phase 9) — three divisions, their price lists, and the
enquiry form — and `AGENTS.md` says so explicitly. Replacing it would delete a
built phase.

So the online shop is mounted at `/shop`, and the public page gained an "Order
online" way in. Every other route is as the spec writes it, under that prefix:

| Spec | Built |
| --- | --- |
| `/` | `/shop` |
| `/designs`, `/designs/[code]` | `/shop/designs`, `/shop/designs/[code]` |
| `/products/[slug]` | `/shop/products/[slug]` |
| `/order`, `/order/details` | `/shop/order`, `/shop/order/details` |
| `/order/received/[token]` | `/shop/order/received/[token]` |
| `/track` | `/shop/track` |

`/products` could not be reused: it is already the Counter's product screen.

### Admin: the sidebar, not `/admin` tabs

Spec 9 puts the admin under `/admin` with its own tab bar. This system's admin
is the `(app)` route group behind the existing sidebar, and `AGENTS.md` says a
new section needs a `group` on its `NavSection` or it will not appear. A second
navigation would leave staff with two different menus in one app.

So the module's screens are sections of the existing app:
`/online-orders`, `/online-orders/production`, `/online-orders/calendar`,
`/online-orders/reports`, `/online-orders/products`, `/online-orders/designs`,
and the order page at `/online-orders/[orderNo]`.

### Roles: Owner **and Admin** where the spec says Owner

The spec has two roles, owner and staff. This system has three: owner, admin,
staff, and eleven phases of rules written as "Owner/Admin only" (spec 4.3 of the
main specification). Admin is the owner's deputy and already sees the books.

So "owner only" in this spec maps to `requireOwnerOrAdmin`, and everything a
staff member may do is behind an existing permission checkbox,
`apparel_job_orders` — the online orders are Dabz Apparel's work, and a person
trusted with the job orders is the person who runs these too.

### Settings: columns on `app_settings`, not a key/value table

Spec 6.2 asks for a `settings` table of `key`/`value` jsonb. This system has a
single-row `app_settings` with a column per setting, plus two rules that hang
off that shape: `SETTINGS_COLUMNS_ADDED_LATER` in `src/lib/settings.ts` (so one
unapplied migration costs one setting rather than the whole form) and the column
probes in `src/lib/schema-health.ts`. A jsonb bag would be invisible to both.

| Spec key | Column on `app_settings` |
| --- | --- |
| `messenger_page_username` | `messenger_username` — already there since Phase 9 |
| `notify_email` | `online_notify_email` |
| `daily_capacity_pcs` | `online_daily_capacity_pcs` (null until set — D8) |
| `monthly_sales_target` | `online_monthly_target_centavos` (null until set — D9) |
| `min_days_ahead` | `online_min_days_ahead` (default 2, as the spec gives) |
| `down_payment_percent` | `apparel_down_payment_percent` — already there since Phase 6 |
| `show_production_steps_to_customers` | `online_show_steps_to_customers` (default true) |

### Staff accounts stay where they are

Spec 6.2 asks for a `staff_profiles` table. This system already has `profiles`,
`user_permissions`, an Accounts screen and a `SECURITY DEFINER` helper set that
every policy in eleven phases depends on (`is_owner()`, `has_permission()`, …).
A second table of staff would mean two answers to "who is this person".

So there is no `staff_profiles`. `recorded_by`, `done_by`, `voided_by` and
`actor_id` all reference `profiles`, and the module's policies use the existing
helpers.

### Customers stay where they are

The system already has a `customers` table (Phase 4) keyed by name and phone,
used by the Counter. The spec's `customers` is keyed by mobile. Rather than a
second customers table, the module adds the spec's columns
(`facebook_name`, `address`, `messenger_psid`) to the existing one and matches
on the phone number. One customer walking in and ordering online is one row.

### No Zod

Spec 3 names Zod. This system validates by hand in pure, tested functions
(`checkEnquiry`, `validateSettingsForm`, …) and has no schema library. Adding
one for a single module would leave two ways to validate. The module's checks
live in `src/lib/online/` with unit tests, and the SERVER runs the same
functions the browser does, which is the property the spec is actually after.

### No sample data

Spec 13 asks for a dev seed with seven sample products, eight designs and a few
orders. `AGENTS.md`: *"Nothing in the catalogue is seeded … An empty list is a
real state too."* Migrations `0011`–`0013` exist precisely to delete rows an
earlier migration shipped, after they were mistaken for the shop's real prices.

So `0018` seeds only what is **structure, not commerce**: the five categories
and the eight production stages, both of which the spec fixes by name and
neither of which is a figure anybody could get wrong. No products, no designs,
no orders, no capacity, no target.

### Email, and the alert that actually arrives

Spec 3 names Resend. There is no mailer in this system and no Resend account.
`src/lib/mail.ts` posts to Resend's HTTP API when `RESEND_API_KEY` is set — no
new dependency, and it fails soft: a failed send never fails the order (spec
11).

Because that key may never be set, the module ALSO pushes the alert to the
owner's phone through the notification channel built in Phase 11. That channel
already carries exactly one immediate alert, a customer message, and earns it
for the same reason this one does: there is a person waiting at the other end.
Like `enquiryAlert`, it carries no name, number or figure — a push lands on a
lock screen anyone standing near the phone can read.

### The service-role key gets a fourth sanctioned use

`AGENTS.md` names three: sign-in, the public page's price lists, and the digest
cron. This module adds a fourth, and the spec asks for it in as many words
(6.4): *"Orders are created and tracked only through server code using the
service role after validation and rate limiting."*

It is the same shape as the enquiry form — a write by NOBODY, validated,
length-capped, rate-limited, honeypotted — and the tables stay shut: `orders`,
`order_items`, `order_item_roster`, `order_files`, `payments` and `status_log`
have **no `anon` policy at all**. The rule is written into `AGENTS.md` with its
boundary: catalogue reads, order creation, the track lookup and the customer's
file upload, and nothing else.

### Customer file uploads go through the server, not a signed upload URL

Spec 6.5 has the browser upload straight into `order-files/tmp/…` with a signed
URL. The file goes through a Server Action instead, for the reason the same
section gives two lines later: *"Check type by content, not just by
extension."* A browser that has the upload URL can put anything at the other
end of it; a server that has the bytes can look at them. The action checks the
magic bytes, caps the size, rate-limits by address, and writes to the same
`tmp/` prefix, which order creation then moves under `order-files/<order_no>/`.

### Playwright is not wired up

Spec 14 asks for nine end-to-end tests. They are not built, and this is the one
acceptance criterion of spec 16 that is not met. The reason is in `AGENTS.md`:
*"Supabase Auth cannot be run locally here (no Docker daemon), so the sign-in
round trip is the one thing that must be tried against a real project."* Every
one of the nine begins with either a signed-in staff member or a database full
of products. An e2e suite that cannot reach either would be nine tests that
prove the app renders its "not configured" screen.

What is covered instead, and where:

| Spec 14 e2e test | Covered by |
| --- | --- |
| 1, 2 — ordering, totals, mixed orders | `src/lib/online/*.test.ts` — the totals, quantity and validation rules the browser and the server both run |
| 3, 4 — production steps, undo, DTF path | `src/lib/online/production.test.ts` |
| 5 — soft delete keeps past orders | the snapshot columns, and `16_online_orders_rls.test.sql` |
| 6 — sorting and search | `src/lib/online/catalogue.test.ts` |
| 7 — staff cannot open owner pages | `16_online_orders_rls.test.sql`, as five different people, plus `requireOwnerOrAdmin` on the screen |
| 8, 9 — phone width, palette | by hand in a browser; no unit test can see a pixel (`AGENTS.md` says the same about overlays and the rail) |

To wire Playwright up later: a Supabase project with a seeded staff account,
`npx playwright test` against `next start`, and the nine flows above.

---

## 3. Things the spec is silent about, decided here

Spec 0.3: *"If something seems missing, write it in `docs/open-questions.md`,
use the default this spec gives (or the prototype's behavior), and continue."*

- **Where the online order's money goes.** Nowhere, in version 1. A payment on
  an online order is NOT written to the shop's ledger. The three sanctioned ways
  money reaches the ledger (`complete_sale`, `record_apparel_payment`,
  `record_repair_payment`) stay the only three, and `AGENTS.md` says adding a
  fourth is how two of them start disagreeing. When the owner decides that an
  online order is the same money as an apparel job order, the join is one
  function — and it is a decision about the books, not a detail.
- **A quote is one amount for the whole order,** as spec 7.2 has it, not a price
  per quote item. "Sales by product" splits it by pieces, which is the only
  split the data supports.
- **A cancelled order keeps its payments.** They are not refunded by the system;
  a payment row is a record that money changed hands. Voiding one is the owner's
  call and is logged.
- **The order number sequence starts at 1**, so the first online order is
  `DA-0001`.
