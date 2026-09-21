# Dabz Apparel Online Orders: Build Spec

Version 1.0, 21 September 2026. Owner: Dabz Printshoppe (Dabz Apparel division).

This file is the single source of truth for building the **Online Orders** module of the Dabz website system. It is written for Claude Code. Read all of it before writing code.

The repository root holds a short `CLAUDE.md` that points here. Claude Code loads `CLAUDE.md` by itself at the start of every session, but not this file. Long auto-loaded instructions are followed less reliably, so keep `CLAUDE.md` under 200 lines, keep all detail in this file, and do not pull this file into `CLAUDE.md` with an `@` import. Read it with the Read tool when a task needs it.

A working clickable prototype of every screen ships with this spec at `docs/prototype/online-orders-prototype.html`. Open it in a browser. When this spec and the prototype disagree, **this spec wins**. When this spec is silent, **copy the prototype's behavior and wording**.

> **How this spec meets the repository it landed in.** The Dabz system already
> existed when this spec arrived: eleven built phases, its own rules in
> `AGENTS.md`, its own migrations, its own money type. Section 0.1 below says
> what to do about that — keep the existing stack and conventions and map this
> spec onto them. Every place where that mapping changed something this spec
> names is written down in `docs/open-questions.md` under "Mapped onto the
> existing system", with the reason. Read that file next.

---

## 0. Working agreement for the agent

1. **Inspect the repository first.** If the website system already exists and uses a different stack than section 3, keep the existing stack and conventions and map this spec onto them. Do not start a second app next to an existing one. If the repository is empty, scaffold exactly the stack in section 3.
2. Build in the milestone order of section 16. Finish a milestone (code, migrations, tests passing, acceptance criteria met) before starting the next. One commit or PR per milestone at minimum.
3. Do not add features, pages, colors, libraries or third-party services that this spec does not name. If something seems missing, write it in `docs/open-questions.md`, use the default this spec gives (or the prototype's behavior), and continue.
4. All figures in the prototype (prices, minimum orders, lead times, capacity, monthly target, customers, orders) are **sample data**. Never hard-code them as business rules. Real values come from the admin screens and the `settings` table.
5. Every database change is a migration file. Never edit the database by hand.
6. Never expose the Supabase service role key or any secret to the browser. Never commit secrets. Provide `.env.example`.
7. Before finishing any milestone run: typecheck, lint, unit tests, and the e2e tests that exist so far.
8. Put business rules (section 7) in pure functions under `lib/domain/` with unit tests, and call them from both UI and server code. Do not re-implement a rule inside a component.
9. Each session starts with no memory of the last one. After every milestone, and whenever work stops midway, update `docs/progress.md`: what is finished, how the owner can check it in the browser, what comes next, and anything left half done.
10. UI language is English. Currency is Philippine peso, formatted `₱12,300` (`en-PH`, no decimals unless non-zero). Dates display as `Sep 21, 2026`. All business dates (today, overdue, week and month buckets) use the **Asia/Manila** time zone. Weeks start on Monday.

---

## 1. Context

Dabz Printshoppe is a printing shop in the Philippines. Its apparel division, **Dabz Apparel**, makes full-sublimation jerseys, shirts, jackets, long sleeves and DTF-printed shirts. Today almost all orders arrive through Facebook Messenger chats, and details (sizes, names, numbers, designs, payments, production progress) live in chat threads.

The Online Orders module replaces that with:

- a Shopee-style shop where customers order from a phone without chatting first;
- an admin where staff upload products and jersey designs, quote, take payments, push each order through production, see a calendar of due dates, and see sales and order graphs.

Messenger stays the channel for talking to the customer. The site hands the customer over to Messenger with the order number attached.

This module is the first part of a larger business system (cash in/out, expenses and bills, payroll, Meta Ads). Those later modules will read the same `orders` and `payments` tables, so keep the schema clean and do not bury data in JSON when a column will do.

### Glossary

| Term | Meaning |
| --- | --- |
| Sublimation | Full-print garment: design is printed on transfer paper, heat-pressed onto fabric, then the fabric is cut and sewn |
| DTF | Direct-to-film print, heat-pressed onto a finished shirt |
| Tabas | Filipino shop term for cutting the fabric pieces |
| Roster | The list of players for a team order: name on jersey, number, size |
| Quote item | A product with no fixed price; staff sets the price after seeing the design and quantity |
| Order number | Public identifier like `DA-0042` |

---

## 2. Scope

### In scope (version 1)

- Public shop: home, product catalog with search, categories and sorting, product page with options, sizes, roster, design picker and file upload, jersey design gallery, cart, checkout, confirmation with Messenger handoff, track-my-order.
- Two pricing modes that can mix in one order: **fixed price** and **price on quote**.
- Admin with staff login and two roles (owner, staff): orders list and order page, quoting, payments recorded by hand (cash, manual GCash, bank transfer), production steps and production board, order calendar, sales and orders reports, products, jersey designs, settings.
- Email alert to the shop when a new order arrives.
- Ready-made Messenger messages that staff copy and paste.

### Out of scope (do not build, but do not block)

- Online payment. GCash auto-confirmation through a payment gateway (PayMongo QR Ph) is planned later. Keep `payments.method` able to hold `gateway` and keep `payments.gateway_ref`, but build no gateway code, routes or UI.
- Automatic Messenger messages, Meta webhooks, chatbot. Store `customers.messenger_psid` as a nullable column only.
- Customer accounts and login.
- Other divisions (print services, mugs and souvenirs, repair booking). Categories must be data-driven so they can be added later without code changes.
- Expenses, bills, payroll, Meta Ads.
- Live on-screen recoloring of jersey designs.

---

## 3. Tech stack and project layout

Use current stable versions. Do not pin to versions you cannot verify.

| Concern | Choice |
| --- | --- |
| Framework | Next.js, App Router, TypeScript (strict) |
| Styling | Tailwind CSS with the tokens of section 5 defined as CSS variables and mapped into the Tailwind theme. No component kit. |
| Database | Supabase Postgres |
| Auth | Supabase Auth, email and password, staff only |
| File storage | Supabase Storage |
| Server logic | Next.js server actions or route handlers. Public writes go through the server with validation, never straight from the browser to the database. |
| Validation | Zod schemas shared by client and server |
| Charts | Hand-built HTML and CSS bars as in the prototype, or a small library if needed. No dual-axis charts. |
| Email | Resend (or the repository's existing mailer) |
| Tests | Vitest for unit tests, Playwright for e2e |
| Hosting | Vercel |

Suggested layout:

```
app/
  (shop)/                     public pages, section 8
  admin/(auth)/login/
  admin/(panel)/              staff pages, section 9
  api/                        route handlers (uploads, order create, track)
components/
lib/
  domain/                     pure business rules + tests (section 7)
  supabase/                   server and browser clients
  validation/                 zod schemas
supabase/
  migrations/
  seed.sql
tests/unit/  tests/e2e/
CLAUDE.md                     short pointer to docs/spec.md, plus the run commands
docs/spec.md
docs/prototype/online-orders-prototype.html
docs/open-questions.md
docs/progress.md              what is done, how to check it, what is next
```

Environment variables (`.env.example`):

```
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only
RESEND_API_KEY=                   # server only
NOTIFY_FROM_EMAIL=
```

---

## 4. Roles and access

| Role | Who | Can do |
| --- | --- | --- |
| Visitor | Anyone, no login | Browse visible products and designs, place an order, track an order with order number plus mobile number |
| Staff | Logged-in shop staff | Everything in admin except Reports, Settings and Staff accounts |
| Owner | Shop owner | Everything, including Reports, Settings and Staff accounts |

- There is no public sign-up. The owner creates staff accounts from Settings (email, full name, role, active switch).
- A deactivated staff member cannot log in or call any admin action.
- Every admin route and server action checks the session and role on the server. Hiding a menu item is not access control.
- Every change to an order (status, quote, payment, production tick, date change) writes a `status_log` row with the staff member's id and name.

---

## 5. Design system

The look is clean and minimal: a light grey page, white rounded cards, a lot of space, large bold headings, pill buttons. The prototype is the visual reference for spacing, sizes and layout.

### 5.1 Palette (strict)

The whole site, shop and admin, uses **only red, black, white and yellow gold**. Greys are allowed only as neutral steps between the black and the white (no blue or warm tint). No other hue may appear anywhere in the UI, including charts, status badges, icons, illustrations and focus rings.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ground` | `#F4F4F4` | `#000000` | Page background |
| `--surface` | `#FFFFFF` | `#1A1A1A` | Cards, panels, inputs |
| `--tile` | `#F4F4F4` | `#262626` | Thumbnails, chat bubble |
| `--seg` | `#E9E9E9` | `#262626` | Segmented controls, search field, progress tracks |
| `--ink` | `#141414` | `#F5F5F5` | Text, primary buttons, selected states |
| `--muted` | `#6A6A6A` | `#A3A3A3` | Secondary text |
| `--line` | `#D4D4D4` | `#3A3A3A` | Borders, dividers |
| `--red` | `#D2122E` | `#FF4D5E` | Brand accent and attention |
| `--gold` | `#E5A900` | `#F0B323` | Done, ready, positive |
| `--on-gold` | `#141414` | `#141414` | Text and icons on gold |
| `--st-new` | `#6A6A6A` | `#A3A3A3` | "New" status |
| `--st-completed` | `#A3A3A3` | `#6E6E6E` | "Completed" and "Cancelled" |

If the owner supplies an exact brand red or gold later, change only these tokens.

How each color is used:

| Color | Used for |
| --- | --- |
| Black (`--ink`) | Text, primary buttons, selected filter chips, orders in production, sales bars in charts |
| White (`--surface`) | Cards and surfaces. In dark mode black and white swap roles. |
| Red | Links, small labels (eyebrows), logo dot, today's date marker, and anything that needs attention: overdue, unpaid balance, delete buttons, the current production step ring, a falling figure in reports. Red is never used for a normal, healthy state. |
| Yellow gold | Finished and positive things: Ready to ship, production steps marked OK, progress bars, cash collected bars, the prototype notice strip. Gold is a fill color with black text on it. Do not use gold as text color on white (contrast is too low). |

Support light and dark mode with the same tokens: `prefers-color-scheme` by default, and a `data-theme="light|dark"` attribute on `<html>` that overrides it.

### 5.2 Type, shape, layout

- Font stack: `-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. Load Inter as the web fallback. One family everywhere, including big numbers.
- Headings weight 600, letter-spacing about `-0.025em`, sentence case. Hero headline `clamp(38px, 6.4vw, 72px)`. Body 16px, line-height 1.47.
- Radius: cards and panels 18px, hero 28px, inputs and option boxes 12px, buttons and chips fully round (pill).
- Primary button: `--ink` fill, `--surface` text. Secondary: transparent with 1px `--ink` border. Danger: red text and red-tinted border, solid red only on the final "Yes, delete".
- Text links are red with a trailing `›`; back links have a leading `‹`.
- Category and filter chips: text pills; the selected one is `--ink` fill. Product option boxes: outlined; the selected one gets a 2px `--ink` outline.
- Top bar: sticky, translucent `--surface` with backdrop blur, thin bottom border.
- Content max width 1080px. Side gutter at least 16px at every width. The page body never scrolls sideways; only tables may scroll inside their own container.
- Mobile first. Most customers arrive from Facebook on a phone around 360 to 400px wide. Product grid is 2 columns on phones. Two-column pages collapse to one column under 760px.
- Visible keyboard focus on every control. Respect `prefers-reduced-motion`. Hover motion is limited to a slight card lift.
- Product cards put text on top and the image below, on a white card.

### 5.3 Order status styles

Status must be readable without relying on hue. Early statuses are outlines, work in progress is solid black, ready is solid gold, red is reserved for overdue.

| Status | Badge (pill) | Calendar entry |
| --- | --- | --- |
| New | Grey dot, grey-tinted pill | Solid grey, light text |
| Quoted | Hollow gold ring, gold-tinted pill | White fill, gold outline, ink text |
| Confirmed | Hollow ink ring, grey-tinted pill | White fill, ink outline, ink text |
| In production | Solid ink dot, grey-tinted pill | Solid ink, surface-color text |
| Ready to ship | **Solid gold pill, black text, black dot** | Solid gold, black text |
| Completed | Faded grey dot | Solid faded grey at 55% opacity |
| Cancelled | Faded grey, label struck through | Not shown on the calendar |
| Overdue (overlay) | Red "Overdue" label next to the badge | Solid red, white text, replaces the status style |

### 5.4 Charts

- Two series maximum. Series 1 is `--ink` (Sales booked, and every single-series chart). Series 2 is `--gold` (Cash collected).
- Columns at most 24px wide, 4px rounded top, square at the baseline, 2px gap between neighbors. Horizontal bars 10px thick with a rounded right end.
- Hairline solid gridlines in `--seg`, axis line in `--line`, axis text in `--muted`. Clean tick values (`₱0`, `₱20K`, `₱40K`).
- A legend whenever there are two series. Text is never colored with a series color.
- Every chart has a **Show table** toggle that swaps the plot for a table of the exact numbers, and a tooltip on hover **and** on keyboard focus showing all series for that bar. Tooltip content must be set as text, not HTML.
- Growth figures: up is ink with `▲`, down is red with `▼`, always with the signed percentage and what it is compared to.

---

## 6. Data model

Postgres on Supabase. Use `uuid` primary keys (`gen_random_uuid()`), `timestamptz` for timestamps, `numeric(10,2)` for money. Add `created_at` and `updated_at` to every table unless noted. Names below are required; add indexes on foreign keys and on the columns named in "Index".

### 6.1 Enums

```sql
create type order_status   as enum ('new','quoted','confirmed','in_production','ready_to_ship','completed','cancelled');
create type pricing_mode   as enum ('fixed','quote');
create type fulfil_method  as enum ('pickup','delivery');
create type staff_role     as enum ('owner','staff');
create type payment_method as enum ('cash','gcash_manual','bank_transfer','gateway');
create type production_path as enum ('full','dtf');
create type order_source   as enum ('website','manual');
```

Display labels: `new` New, `quoted` Quoted, `confirmed` Confirmed, `in_production` In production, `ready_to_ship` Ready to ship, `completed` Completed, `cancelled` Cancelled. Payment methods: Cash, GCash (manual), Bank transfer.

### 6.2 Tables

**staff_profiles**: `id uuid pk references auth.users`, `full_name text not null`, `role staff_role not null default 'staff'`, `is_active boolean not null default true`.

**categories**: `id`, `name text unique not null`, `slug text unique not null`, `production_path production_path not null default 'full'`, `sort_order int default 0`. Seed: Jerseys, Shirts, Jackets, Long Sleeves (all `full`), DTF Prints (`dtf`).

**products**: `id`, `category_id fk`, `name text not null`, `slug text unique not null`, `description text`, `pricing_mode pricing_mode not null`, `min_order_qty int not null default 1 check (min_order_qty >= 1)`, `lead_time_days int not null default 7 check (lead_time_days >= 1)`, `uses_sizes boolean not null default true`, `uses_roster boolean not null default false`, `uses_design_gallery boolean not null default false`, `size_chart_path text`, `is_visible boolean not null default true`, `deleted_at timestamptz`. Index: `(is_visible, deleted_at)`, `created_at`.
- "Delete" in the admin is a **soft delete** (`deleted_at = now()`), so past orders keep their link. Deleted products never appear in the shop or in admin lists.
- `uses_roster = true` implies sizes are asked per player.

**product_images**: `id`, `product_id fk on delete cascade`, `storage_path text not null`, `alt text`, `sort_order int`. At most 8 per product (enforce in the server action). The first image is the card image.

**product_price_variants**: `id`, `product_id fk on delete cascade`, `label text not null` (for example "A4 print"), `price numeric(10,2) not null check (price >= 0)`, `sort_order int`. A `fixed` product must have at least one row. A `quote` product has none.

**product_options**: `id`, `product_id fk on delete cascade`, `name text not null` (for example "Collar"), `choices text[] not null` (at least one), `sort_order int`.

**designs**: `id`, `code text unique not null` (for example `DJ-101`), `name text not null`, `description text`, `image_path text`, `is_visible boolean not null default true`, `deleted_at timestamptz`. Soft delete, same rule as products.

**design_products**: `design_id fk`, `product_id fk`, primary key on both. A design is offered on a product page only if a row exists here **and** the product has `uses_design_gallery = true`.

**customers**: `id`, `mobile text unique not null`, `name text not null`, `facebook_name text`, `address text`, `messenger_psid text`. One row per mobile number; update name, Facebook name and address to the latest order's values.

**orders**: `id`, `order_no text unique not null`, `customer_id fk`, `customer_name text not null`, `mobile text not null`, `facebook_name text`, `method fulfil_method not null`, `address text`, `date_needed date not null`, `notes text`, `status order_status not null default 'new'`, `quote_amount numeric(10,2)`, `source order_source not null default 'website'`, `receipt_token text unique not null`, `completed_at timestamptz`, `cancelled_at timestamptz`. Index: `status`, `date_needed`, `created_at`, `mobile`.
- `order_no` comes from a database sequence inside the insert (function or trigger): `'DA-' || lpad(nextval('order_no_seq')::text, 4, '0')`. It grows past four digits naturally. Never compute it in application code.
- Customer name, mobile and Facebook name are copied onto the order so old orders do not change when a customer record is updated.

**order_items**: `id`, `order_id fk on delete cascade`, `product_id fk` (nullable), `product_name text not null`, `category_name text not null`, `production_path production_path not null`, `pricing_mode pricing_mode not null`, `variant_label text`, `unit_price numeric(10,2)` (null for quote items), `options jsonb not null default '{}'` (option name to chosen value), `qty int not null check (qty > 0)`, `sizes jsonb not null default '{}'` (size to quantity, for non-roster items), `design_id fk` (nullable), `design_code text`, `design_name text`, `team_colors text`, `notes text`.
- Product name, category, path, price and design code are **snapshots** taken at order time. Later edits or deletions of products and designs must not change past orders.

**order_item_roster**: `id`, `order_item_id fk on delete cascade`, `position int not null`, `player_name text`, `player_number text`, `size text not null`.

**order_files**: `id`, `order_item_id fk on delete cascade`, `storage_path text not null`, `original_name text not null`, `mime_type text`, `size_bytes bigint`.

**payments**: `id`, `order_id fk`, `amount numeric(10,2) not null check (amount > 0)`, `method payment_method not null`, `paid_on date not null default (now() at time zone 'Asia/Manila')::date`, `recorded_by uuid references staff_profiles`, `note text`, `gateway_ref text`, `voided_at timestamptz`, `voided_by uuid references staff_profiles`. Index: `paid_on`, `order_id`.
- Every payment is also a cash-in entry for the later finance module, so payments are never deleted and never negative. A mistake is corrected by the owner voiding the row (sets `voided_at`, logged in `status_log`). Voided rows are shown struck through and are excluded from every sum.

**production_stages** (seeded, read-only in version 1): `key text pk`, `label text`, `customer_label text`, `description text`, `position int`, `in_dtf_path boolean`.

| position | key | label | customer_label | description | in_dtf_path |
| --- | --- | --- | --- | --- | --- |
| 1 | `design` | Design | Design | Layout made and approved by the customer | true |
| 2 | `pattern` | Pattern | Pattern | Pattern pieces laid out for every size | false |
| 3 | `print` | Print | Print | Design printed on transfer paper or film | true |
| 4 | `heat_press` | Heat press | Heat press | Print pressed onto the fabric | true |
| 5 | `tabas` | Tabas | Cutting (tabas) | Fabric pieces cut | false |
| 6 | `sewing` | Sewing | Sewing | Pieces sewn into finished garments | false |
| 7 | `quality_check` | Quality check | Quality check | Names, numbers, sizes and stitching checked | true |
| 8 | `packaging` | Packaging | Packaging | Folded, counted and packed | true |

**order_production**: `order_id fk on delete cascade`, `stage_key fk`, `done_at timestamptz not null`, `done_by uuid references staff_profiles`, `skipped boolean not null default false`, primary key `(order_id, stage_key)`. A row means the stage is finished (or marked not needed).

**status_log**: `id`, `order_id fk on delete cascade`, `event text not null` (for example "Quoted", "Sewing OK", "Tabas: not needed", "Undo: Sewing", "Date moved to Oct 5", "Payment ₱2,250 Cash"), `actor_id uuid`, `actor_label text not null` ("Website" or the staff member's name), `created_at`.

**settings**: `key text pk`, `value jsonb not null`. Keys and defaults:

| key | default | meaning |
| --- | --- | --- |
| `messenger_page_username` | `""` | Facebook Page username for the m.me link |
| `notify_email` | `""` | Where new-order alerts go |
| `daily_capacity_pcs` | `60` (sample) | Calendar "FULL" threshold |
| `monthly_sales_target` | `100000` (sample) | Reports target meter |
| `min_days_ahead` | `2` | Earliest selectable "date needed" is today plus this |
| `down_payment_percent` | `50` | Used only in message wording |
| `show_production_steps_to_customers` | `true` | Track page shows the step list or only the main status |

### 6.3 Views

- `product_order_stats`: per product, total pieces and number of distinct orders from non-cancelled orders. Drives "Most ordered" and the admin "Ordered" column.
- `order_totals`: per order, `fixed_total`, `total`, `paid`, `balance`, `pieces`, using the rules of section 7.2.

### 6.4 Row level security

Enable RLS on every table.

- `anon` may `select` only: `categories`; `products` where `is_visible and deleted_at is null`, with their images, price variants and options; `designs` where `is_visible and deleted_at is null`, with `design_products`; `production_stages`; `product_order_stats`. Nothing else, and no writes.
- Orders are created and tracked **only through server code** using the service role after validation and rate limiting. `anon` has no policy on `customers`, `orders`, `order_items`, `order_item_roster`, `order_files`, `payments`, `order_production`, `status_log`, `settings`, `staff_profiles`.
- Authenticated users with an active `staff_profiles` row get full read and write on operational tables. `settings` and `staff_profiles` writes, and the reports queries, require role `owner`.

### 6.5 Storage buckets

| Bucket | Access | Limits |
| --- | --- | --- |
| `product-images` | Public read, staff write | JPG, PNG, WebP, 5 MB each. Resize on upload to at most 1600px on the long side. |
| `design-images` | Public read, staff write | Same |
| `order-files` | Private. Staff read through short-lived signed URLs. | JPG, PNG, WebP, PDF, 20 MB each, one file per order item in version 1 |

Customer uploads happen before the order exists: the server issues a signed upload URL into `order-files/tmp/<random>/`, and order creation moves the file under `order-files/<order_no>/`. Purge `tmp/` files older than 24 hours. Check type by content, not just by extension.

---

## 7. Business rules

Implement these as pure, unit-tested functions in `lib/domain/`.

### 7.1 Sizes and validation

- Sizes are fixed: `XS, S, M, L, XL, 2XL, 3XL`.
- Mobile number: exactly 11 digits starting with `09` (`/^09\d{9}$/`).
- Date needed: not earlier than today plus `min_days_ahead` (Manila date).
- Delivery requires an address. Pickup does not.
- Roster: player name is stored upper case, trimmed, at most 20 characters. Number is 0 to 3 digits. Blank names and numbers are allowed (some teams decide later); size is required.
- Item quantity: roster products: number of roster rows. Products with sizes: sum of the size quantities. Products with neither: the quantity field.
- An item cannot be added to the order when its quantity is below 1 or below the product's `min_order_qty`. Say so in plain words, with the numbers.
- Re-validate everything on the server at order creation, and re-read prices from the database. Never trust prices, names or totals sent by the browser.

### 7.2 Money

- `fixed_total` = sum of `unit_price × qty` over fixed items.
- `has_quote_items` = the order has at least one quote item.
- `total` = `fixed_total + coalesce(quote_amount, 0)`.
- `paid` = sum of non-voided payments. `balance` = `total − paid`.
- While `has_quote_items` and `quote_amount` is null, show the total as "To be quoted" (or `₱X + quote` when there are fixed items too) and do not show a balance.
- For "Sales by product", a quote amount is split across the order's quote items in proportion to their pieces.

### 7.3 Order status flow

```
new ──(staff sets quote)──────────► quoted ──(customer agrees)──► confirmed
new ──(no quote items; staff confirms)───────────────────────────► confirmed
confirmed ──(Start production, or first step marked OK)──► in_production
in_production ──(last step in the order's path is done)──► ready_to_ship   (automatic)
ready_to_ship ──(picked up or delivered)──► completed
new | quoted | confirmed ──► cancelled
ready_to_ship ──(undo last step)──► in_production
```

- Saving a quote amount on a `new` order sets status `quoted` in the same action.
- An order with quote items cannot be confirmed until `quote_amount` is set.
- There is no manual jump to `ready_to_ship`. It is reached only through the production steps.
- Staff can change `date_needed` at any open status; log it ("Date moved to Oct 5").
- `completed` and `cancelled` are final in version 1.
- Derived flags:
  - **open** = status is not `completed` or `cancelled`.
  - **overdue** = open, status is not `ready_to_ship`, and `date_needed` is before today (Manila).
  - **needs a quote** = status `new` and `has_quote_items`.

### 7.4 Production steps

- An order's step list is the **DTF path** (Design, Print, Heat press, Quality check, Packaging) when **every** item's `production_path` is `dtf`; otherwise the **full path** (all eight stages in order).
- Steps are done strictly in order. Only the **current step** (the first step without an `order_production` row) can be acted on.
- Actions on the current step, allowed while status is `confirmed` or `in_production`:
  - **Mark OK**: insert the row with `done_at`, `done_by`.
  - **Not needed for this order**: same, with `skipped = true`.
  - If the order was `confirmed`, either action first moves it to `in_production`.
  - If no step remains afterwards, status becomes `ready_to_ship` automatically.
- **Undo** removes the most recently completed step (last in path order). Allowed while `in_production` or `ready_to_ship`. Undoing from `ready_to_ship` returns the order to `in_production`.
- Every action writes `status_log` ("Sewing OK", "Pattern: not needed", "Undo: Sewing") with the staff member.
- The stage note shown around the app is `"<current step label> · <done count> of <path length>"`, for example `Sewing · 5 of 8`.

### 7.5 Calendar capacity

A day is **FULL** when the pieces of all open orders with that `date_needed` add up to more than `daily_capacity_pcs`. Show `FULL <pieces>` in red on that day.

### 7.6 Sorting

| Where | Options (default first) |
| --- | --- |
| Shop catalog | Most ordered, Newest, Price: low to high, Price: high to low, Name: A to Z |
| Admin products | Newest upload, Oldest upload, Most ordered, Least ordered, Name: A to Z, Price: low to high, Price: high to low |

- Most ordered = total pieces in non-cancelled orders (`product_order_stats`), ties broken by newest.
- A product's price for sorting is its lowest price variant. Quote products have no price and always come after priced products in both price sorts.
- Sorting combines with search and category filter.

### 7.7 Reports

- **Sales booked** for a period = sum of `total` of non-cancelled orders whose `created_at` (Manila date) falls in the period.
- **Cash collected** = sum of non-voided payments whose `paid_on` falls in the period, from all orders.
- **Orders received** = count of non-cancelled orders created in the period; also pieces.
- **Average order** = sales booked ÷ orders received.
- Month-to-date tiles compare with the **same day range of the previous month** (Sep 1 to 21 against Aug 1 to 21), and say so.
- Periods: last 8 weeks and last 12 weeks (weekly buckets, Monday start, labeled by the Monday), last 6 months (monthly buckets). The current week or month is included.

---

## 8. Public shop

Cart contents live in the browser (`localStorage`, guarded with try/catch) until the order is submitted. No account, no login.

| Route | Page |
| --- | --- |
| `/` | Home and catalog |
| `/designs` | Jersey design gallery |
| `/designs/[code]` | One design |
| `/products/[slug]` | Product page |
| `/order` | Your order (cart) |
| `/order/details` | Your details (checkout) |
| `/order/received/[receiptToken]` | Order received |
| `/track` | Track my order |

### 8.1 Home and catalog

- Top bar: wordmark "Dabz ● Apparel" (red dot), links "Designs ›" and "Your order (n) ›".
- Hero card: red eyebrow "Custom teamwear", headline "Your team. Your colors.", line "Full sublimation and DTF uniforms, ordered online in minutes.", primary button "Shop uniforms" (scrolls to products), link "Track my order ›", and a row of three product images.
- Three step cards: "Choose your style.", "Add your team.", "We take it from there."
- "Ready-made jersey designs": first four visible designs and "See all designs ›". Hidden when there are no visible designs.
- "Products": search field, category chips (All plus each category that has visible products), "Sort by" select, product grid.
- Product card: category eyebrow, name, price (`₱150`, or `from ₱150` when variants differ) or "Price on quote", "Min 6 pcs · ready in about 10 days", image.
- Empty result: "No products match. Try another word or category."

### 8.2 Product page

Top to bottom:

1. Back link, category eyebrow, product name, large image. When a gallery design is selected, the large image shows that design.
2. Price per piece (follows the selected price variant) or "Price on quote" with: "We check your design and quantity, then send the price on Messenger before anything is printed."
3. Description, then "Minimum order N pcs · normally ready in about N days".
4. Price variant boxes (fixed products), labeled `A4 print · ₱220`.
5. One row of option boxes per product option. The first choice is preselected.
6. **Choose a design** (only when the product uses the gallery and has linked visible designs): first tile "My own design, upload it below", then one tile per design (image, code, name). Picking a design reveals a text field "Your team colors" with the hint "We recolor the design for you. Example: black body, red accents, white numbers."
7. Quantity input, one of:
   - **Team roster**: table with row number, Name on jersey, Number, Size, remove button; buttons "Add player" and "Add 5 players". Starts with `min_order_qty` rows.
   - **Quantity per size**: one number field per size.
   - Plain quantity field.
   - Under it, live: total pieces, the running price for fixed products, a size count summary (`S 2 · M 4 · L 3`), and a red "minimum is N" note while below the minimum.
8. File upload: "Upload your design, logo or reference photo", or "Upload your team logo or sponsor logos (optional)" when a gallery design is selected.
9. "Notes for this item".
10. Buttons "Add to order" and "View order (n)".

### 8.3 Your order and your details

- Order page: item lines (image or chosen design image, name, variant and options, design code and colors, size summary, attached file name, notes, pieces, line price or "To be quoted"), "Remove", summary with the totals of 7.2, "Continue to your details", "Add another product ›".
- Details page fields: full name or team name, mobile number, Facebook name ("So we can find your chat"), date needed, pick up or deliver, delivery address (delivery only), anything else. Text: "No payment is taken here. We confirm the price and down payment with you first." Button "Place order".
- On submit the server: validates, re-prices from the database, upserts the customer by mobile, creates the order, items, roster rows and file links in **one transaction**, writes `status_log` "New" by "Website", sends the shop email, clears the cart, and redirects to the received page.

### 8.4 Order received

- Shows "Order received", the order number very large, "Thank you, NAME. Keep this order number.", needed-by date, pieces, pickup or delivery.
- Primary button **Continue on Messenger**: opens `https://m.me/<messenger_page_username>?ref=<order_no>`. If the username setting is empty, hide the button.
- Button "Track this order".
- Next-step line: with quote items, "Next: we review your design and send your quote on Messenger, usually within the day."; otherwise "Next: we confirm your order and down payment on Messenger."
- The page is addressed by the unguessable `receipt_token`, never by order number alone.

### 8.5 Track my order

- Inputs: order number and the mobile number used. Both must match; otherwise show one generic message: "We could not find that order. Check the order number and the mobile number you used when ordering."
- Result: order number and status badge; a main progress row (New, Quoted, Confirmed, In production, Ready to ship, Completed; "Quoted" is left out for orders that never had a quote); needed-by date and pieces.
- When the status is In production, Ready to ship or Completed, and the `show_production_steps_to_customers` setting is on: a "Production progress" card with a progress bar and the step list using `customer_label`. Done steps show "OK · Sep 16" (no staff names). The current step shows "In progress now". The last row is "Ready to ship" with "We message you as soon as your order is packed".
- Then the items, totals, paid and balance.
- Never show other customers' data, staff names, internal notes or file links here. Rate limit this endpoint (section 12).

---

## 9. Admin

All under `/admin`, staff login required. Top bar shows the signed-in name and a sign-out control. Tabs: **Orders, Production, Calendar, Reports** (owner only), **Products, Designs, Settings** (owner only). On phones the tab bar scrolls sideways.

### 9.1 Orders

- Tiles: Open orders, Need a quote, Due in 7 days, Overdue (red number), Unpaid balance (sum of positive balances of open orders).
- Filter chips: Open (default), All, Overdue, then each status, then Cancelled.
- Table: Order, Customer, Items (first item name, "+n" for more, pieces), Needed (with red "Overdue"), Total (or "No quote yet"), Balance, Status badge with the stage note under it for orders in production. Open orders first, then by date needed. Rows open the order page. Paginate or lazy-load past 50 rows.
- **Add order** button (see 15, decision D1): staff enter an order that came by Messenger or walk-in using the same fields as the shop; it is saved with `source = 'manual'`.

### 9.2 Order page

Two columns on desktop, one on phones.

- **Items**: as in the cart, plus the chosen design thumbnail, code, name and requested colors, the uploaded file as a signed download link, a collapsible roster table (number, name, jersey number, size) and the size count summary.
- **Message for the customer**: the ready-made message for the current state (section 10) in a chat bubble with "Copy message" and the hint "Paste it in the customer's Messenger chat."
- **Status history**: `status_log`, newest first: event, date, who.
- **Move this order**: quote amount field and "Send quote" (orders with quote items and no quote yet); "Mark as Confirmed"; "Start production"; "Mark as Completed" (from Ready to ship); "Cancel order" (New, Quoted, Confirmed, with a confirm step); the date-needed field. While in production, show: "In production. Tick the steps in the Production box. The order becomes Ready to ship when the last step is OK."
- **Production**: "n of N steps OK", a gold progress bar, the step list. Done steps: gold circle with a black check, "OK · Sep 16 · Staff name" or "Not needed · …" (grey circle with a dash). Current step: red ring and a "Mark OK" button. Future steps: muted, showing the step description. Last row "Ready to ship". Under the list: "<Step> is not needed for this order" and "Undo <last step>". Before confirmation: "Production starts once the order is confirmed."
- **Payment**: totals per 7.2, Paid, Balance (red when above zero), list of payments (date, method, amount), and for open orders a form: amount, method (Cash, GCash (manual), Bank transfer), "Record payment".
- **Customer**: name, mobile (tap to call), Facebook name, pickup or delivery and address, customer notes, ordered date, source.

### 9.3 Production board

- Intro: "Every order sits in the step it is waiting for. Tap OK when that step is finished and the order moves to the next card. After Packaging it becomes Ready to ship by itself."
- Cards in this order, in a wrapping grid: **Waiting to start** (Confirmed orders, button "Start"), then the eight stages as **Step 1 to Step 8** (orders in production whose current step is that stage, button "OK"), then **Ready to ship** (button "Completed").
- Card: red eyebrow, stage name, description, count badge (black when not zero). Rows: order number and customer, "24 pcs · due Sep 25", red "Overdue", the action button. Sorted by date needed. Tapping the row text opens the order.
- Buttons apply the same rules as 7.4 and update the board in place.

### 9.4 Calendar

- Month grid (Sunday first), Previous, Today, Next. Status legend and "Red = overdue".
- Each non-cancelled order appears on its `date_needed`, styled per 5.3, labeled with the last four digits of the order number and the customer name. The tooltip adds the status and stage note. Tapping opens the order page.
- Today's date is a red filled circle. Days outside the month are muted.
- FULL marker per 7.5.
- On phones the entries shrink to thin colored bars, and the list below does the reading work.
- "Due this month": date, order number, customer, pieces, red "Overdue", stage note, status badge. Tapping opens the order.

### 9.5 Reports (owner only)

Layout and rules exactly as in the prototype and sections 5.4 and 7.7:

1. "<Month> so far": four tiles (Sales booked, Cash collected, Orders received, Average order), each with growth against the same days of last month.
2. "<Month> sales target": text "₱87,860 of ₱100,000 · 88% · ₱12,140 to go" (or "target reached"), an editable monthly target (saves to `settings`), and a meter (ink fill on a `--seg` track).
3. One period control above the charts: Last 8 weeks, Last 12 weeks, Last 6 months. It scopes every chart below it.
4. "Sales and cash collected": grouped columns with legend, and the footnote "Sales booked counts each order total on the day it was ordered, with cancelled orders left out. Cash collected counts each payment on the day it was received."
5. "Orders received": single-series columns; tooltip and table show orders and pieces.
6. "Sales by product": horizontal bars, highest first, value at the right.

Compute report numbers in SQL (views or RPC), not by loading every order into the browser.

### 9.6 Products

- List: thumbnail, name with "Min 6 · 10 days · roster", category, price ("₱150+" or "Quote"), Ordered ("27 pcs · 2 orders" or "None yet"), Uploaded date, Shown or Hidden switch, **Edit** and **Delete** buttons. "Sort by" select and "Add a product" at the top. Text: "Products you add here appear in the shop right away."
- Delete asks inline on the same row: "Delete for good?" with "Yes, delete" and "Keep". It performs the soft delete of 6.2 and removes the product's `design_products` links. Toast: "Product deleted. Past orders keep their details."
- Form: name, category, description, pricing (Fixed price or Price on quote), price list rows (label and price, fixed only), option rows (option name plus comma-separated choices), minimum order, lead time, switches "Ask for sizes (XS to 3XL)", "Team product: ask for names and numbers per player", "Let customers pick from the jersey design gallery", up to 8 photos with reorder and remove, optional size chart image. Buttons "Publish product" or "Save changes".
- Validation: name required; a fixed product needs at least one price above zero.

### 9.7 Designs

- List: thumbnail, code and name, "Used on" (categories of linked products, or "Not linked"), Shown or Hidden switch, Edit, Delete with the same inline confirm. Toast: "Design deleted. Past orders keep the design code."
- Form: design code (pre-filled with the next free `DJ-###`, unique, stored upper case), name, short description, checkboxes for the products that can use it (only products with the gallery switch on), mockup image upload. Buttons "Publish design" or "Save changes".

### 9.8 Settings (owner only)

Edit every key of the `settings` table, and manage staff accounts (invite by email, full name, role, active switch).

---

## 10. Messenger handoff and message templates

Version 1 sends nothing automatically. Build a pure function `messageFor(order)` returning the text below; the order page shows it with a copy button. `{name}` is the customer name, `{no}` the order number.

| State | Message |
| --- | --- |
| New | Hi {name}! We received your order {no}. We are checking your design and will send the quote shortly. |
| Quoted | Hi {name}! Your quote for order {no} ({pieces} pcs) is {total}. Reply YES to confirm and we will send the down payment details. |
| Confirmed | Hi {name}! Order {no} is confirmed. Payment received so far: {paid}. We will send your layout for approval next. |
| In production, no step done | Hi {name}! Order {no} is now in production. The first step is your design layout. Please check it carefully when we send it, especially names, numbers and sizes. |
| In production, some steps done | Hi {name}! Update on order {no}: {last step} is done and it is now in {current step} (step {n} of {N}). Target date: {date needed}. |
| Ready to ship | Hi {name}! Order {no} is packed and ready for {pickup or delivery}. Remaining balance: {balance}. |
| Completed | Thank you {name}! Order {no} is complete. We would love to see your team photo. See you on your next order! |
| Cancelled | Hi {name}, order {no} has been cancelled. Message us any time if you want to order again. |

For a fixed-price-only order in state New, use: "Hi {name}! We received your order {no}. We will confirm it and send the down payment details shortly."

## 11. New-order email

To `notify_email` on every website order. Subject: `New order {no}: {customer} ({pieces} pcs, needed {date})`. Body: customer name and mobile, item lines, whether a quote is needed, and a link to the admin order page. If sending fails, the order must still be created; log the failure.

---

## 12. Security, privacy and quality bar

- Server-side validation with the shared Zod schemas on every write. Escape all user text on output; never inject it as HTML.
- Rate limit by IP: order creation (for example 5 per hour), track lookups (for example 10 per 10 minutes), upload URL requests. Add a hidden honeypot field to the checkout form.
- Track-my-order never confirms whether an order number exists on its own; the mobile number must match too.
- Customer files are private. Staff get signed URLs that expire within minutes. Verify file type by content and enforce size limits on the server.
- Admin pages are `noindex`. Public pages have proper titles, descriptions and Open Graph tags.
- Accessibility: labels on every input, keyboard reachable controls with visible focus, status never conveyed by color alone, text contrast at least 4.5:1, charts have the table view.
- Performance: optimized responsive images, no layout shift on the product grid, the catalog usable on a slow mobile connection.
- Personal data stored is limited to name, mobile, Facebook name and address. Do not put personal data in URLs or logs.

## 13. Seed data

`supabase/seed.sql` for development only: the five categories, the eight production stages, the default settings, one owner account (credentials from env), seven sample products and eight sample designs matching the prototype, and a few sample orders in different statuses. Mark the seed clearly as sample data and keep it out of production.

---

## 14. Testing

**Unit (Vitest), all of `lib/domain/`:** quantity and minimum-order validation; totals, balance and "To be quoted" display; quote split by pieces; every status transition allowed and refused; production path selection (full or DTF), mark OK, not needed, undo, auto start, auto Ready to ship, undo from Ready to ship; overdue at the Manila date boundary; calendar FULL; all sort orders including quote products in price sorts; report buckets (week starts Monday, month-to-date comparison, cancelled orders excluded, voided payments excluded); `messageFor` for every state.

**End to end (Playwright):**

1. Visitor orders a team jersey: picks options, picks a gallery design and types colors, fills a roster, uploads a logo, checks out, sees the order number, tracks it.
2. Visitor orders a fixed-price DTF shirt, and a mixed order with one fixed and one quote item; totals display correctly.
3. Staff: quote, confirm, record a down payment, start production, mark every step OK on the board, order becomes Ready to ship, record the balance, complete. The track page reflects each step.
4. Staff: not needed and undo on the order page; a DTF-only order shows five steps.
5. Staff: add, edit, hide and delete a product and a design; the shop reflects it; a past order still shows the deleted product and design code.
6. Sorting and search on the shop and in admin products.
7. Owner sees Reports and Settings; staff cannot, even by typing the URL.
8. Phone viewport (390px): no horizontal page scroll on any page.
9. Both themes render with only palette colors (assert computed colors of key elements).

---

## 15. Decisions the owner still has to give

Record answers in `docs/open-questions.md`. Until then use the defaults.

| # | Decision | Default until answered |
| --- | --- | --- |
| D1 | Should staff be able to add Messenger and walk-in orders by hand so reports are complete? | Yes, build "Add order" in milestone 5 |
| D2 | Real products, which are fixed price, and their prices | Sample products from the seed |
| D3 | Minimum order and lead time per product | Sample values |
| D4 | Size chart image per product type | None shown |
| D5 | Delivery areas and fee | Delivery offered, fee settled on Messenger |
| D6 | Down payment rule | 50 percent, wording only |
| D7 | Facebook Page username and the alert email address | Empty; Messenger button hidden, email skipped |
| D8 | Pieces the shop can finish for one due date | 60 |
| D9 | Monthly sales target | ₱100,000 |
| D10 | Should customers see the production step list? | Yes |
| D11 | Exact brand red and gold color codes | Section 5.1 values |
| D12 | Domain name | Vercel default domain |

---

## 16. Milestones

Each milestone ends with its acceptance checks passing and the app deployable.

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | Project setup: stack, lint, typecheck, test runners, design tokens, light and dark theme, shop and admin layout shells; fill in the real run commands in `CLAUDE.md`; start `docs/progress.md` | Both shells render in both themes using only palette tokens; CI script runs |
| M1 | Database: migrations for section 6, RLS, views, storage buckets, seed | Fresh database builds from migrations; anon cannot read any order table (tested) |
| M2 | Admin login and roles; Products and Designs management with image upload | e2e test 5 passes; staff cannot open owner pages |
| M3 | Public catalog: home, search, categories, sorting, product page with all input types, design gallery | e2e test 6 passes; product page matches 8.2 for roster, per-size and plain quantity products |
| M4 | Cart, checkout, order creation in one transaction, customer file upload, received page with Messenger link, email alert, track-my-order | e2e tests 1 and 2 pass; rate limits in place |
| M5 | Admin Orders list and order page: quote, status moves, payments, message templates, status history, Add order (D1) | First half of e2e test 3 passes; unit tests for 7.2, 7.3 and section 10 pass |
| M6 | Production: steps on the order page, production board, stage notes, track page progress | e2e tests 3 and 4 pass; unit tests for 7.4 pass |
| M7 | Calendar with status styles, overdue, FULL marker, month list | Matches 9.4 on desktop and phone |
| M8 | Reports and Settings | Numbers match hand-checked seed data; e2e test 7 passes |
| M9 | Hardening: accessibility pass, phone pass (e2e 8), palette check (e2e 9), error and empty states, README with setup and deploy steps, production deploy on Vercel | All tests green; README lets a new developer run the project from zero |

## 17. Later phases (context only, do not build)

1. GCash auto-confirm: PayMongo QR Ph, one-time QR per order for the exact amount, webhook marks the payment and moves the order to Confirmed.
2. Messenger automation: Meta app and webhook, link the chat to the order through the `ref` value, send status and payment messages automatically within Meta's messaging-window rules.
3. Other divisions as new categories, repair booking form.
4. Expenses and bills, payroll, Meta Ads, reading the same `orders` and `payments` tables.
