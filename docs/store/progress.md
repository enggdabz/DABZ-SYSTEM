# Dabz Apparel online store — what is built, how to check it, what is next

The store is its own module: `/store` for customers, `/admin/store` for staff,
tables prefixed `store_`. It was started while another session was working on
the sales system, so it deliberately touches almost nothing that already
exists. The rules it was built under are in `decisions.md`.

It sits **beside** the Phase 14 shop (`/shop`, `online_*`), which is untouched
and keeps working. One of the two is meant to retire in Phase 2; until then a
customer must only ever be sent to one of them.

## Where it stands

| Step | What | State |
| --- | --- | --- |
| 1 | Foundation and browsing: migration `0025`, store frame, home, categories, search with suggestions, sort, product page | ✅ |
| 2 | Cart, checkout, shipping zones, GCash receipt upload, order summary, tracking | next |
| 3 | Admin at `/admin/store`: products, designs, orders | |
| 4 | Team orders: roster form, CSV/Excel import, production export, jersey preview, design gallery | |
| 5 | Accounts: phone OTP, Facebook Login, profile, wishlist, reorder | |
| 6 | Promos: vouchers, flash sales, loyalty points | |
| 7 | After-sales: reviews, Q&A, shop profile, cancellation, returns | |
| 8 | Messenger: webhook, chat inbox, notifications, abandoned carts, CRM | |
| 9 | PWA and push, then the dashboard graphs | |

## Step 1 — what exists

**Database** (`supabase/migrations/0025_store_catalogue.sql`, tested by
`supabase/tests/20_store_catalogue_rls.test.sql`): `store_settings`,
`store_categories` (the five the owner named), `store_size_charts`,
`store_products`, `store_product_photos`, `store_variants`,
`store_size_prices`, `store_bulk_tiers`, `store_stock_movements`,
`store_banners`, the view `store_variant_availability`, and one public storage
bucket, `store-images`. No product, banner or price is seeded.

**Pages**: `/store`, `/store/c/[slug]`, `/store/search`, `/store/p/[slug]`, and
`/api/store/suggest` and `/api/store/products` for the search box and the
recently-viewed strip.

**Logic** (pure, tested, in `src/lib/store/`): unit price by quantity tier and
size surcharge, sort (a quote-only product is always last), filter, search-term
cleaning and suggestion ranking, badges, stock buckets, variant choice, the
Messenger link, recently viewed.

### What is deliberately not there yet, and why

- **Add to cart / Order now, the cart icon, login.** A button that goes nowhere
  is worse than none. They arrive with steps 2 and 5.
- **"Most ordered" and "Rating" sorts, the "X sold" and rating badges.** They
  need orders and reviews. A sort over a column of zeros is a control that
  lies, and "0 sold" on every card is a claim. The sort function already has
  the shape to take them.
- **Design gallery, jersey preview, team roster** — step 4.
- **Privacy and Terms pages** — needed for Facebook Login, built with step 5.

## How to check it

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run test:rls`, `npm run check:schema` — all green at this step.

To see it with real rows: apply `0025` (`npm run db:push`), then open `/store`.
With no products it says "Our products are on their way." — which is the
honest state until step 3 gives you a way to add them. (Until then, rows can be
inserted in the Supabase SQL editor; photos go in the `store-images` bucket and
the row's `storage_path` is the path inside it.)

Checked in a browser (390, 768, 1024 and 1440px) against a local stand-in for
Supabase that ran the real RLS policies: no horizontal scroll at any width;
price follows size and quantity and matches the tests; the full-screen photo
view covers the whole screen on a phone (it is portalled into `<body>`); the
search suggestions work by keyboard; a quote-only product shows no peso figure
anywhere on its page; a hidden product is a 404.

## Before you switch the homepage to the store

1. **Remove `robots: { index: false }`** from `src/app/(store)/store/layout.tsx`.
   It keeps search engines away from a store still being built; forgetting it
   would keep the finished store out of search for ever.
2. Decide what happens to `/shop` (Phase 14) and its `online_*` data.
3. Give the store a Privacy and Terms page (step 5) — Facebook Login refuses
   to go live without them.
4. Set the Messenger name (Settings → Your public page). Without it the
   "Chat now" button is hidden.
