# Dabz Apparel online store — decisions, assumptions and things waiting on you

## Rules the store was built under

The owner's instruction while the sales system was being edited by another
session:

- Do not edit existing files for Counter, Sales, Projects, Calendar, End of
  Day, Expenses, Stocks or the sidebar. Do not alter an existing table. New
  code in new folders, new tables prefixed `store_`. No sidebar items yet.
- If something truly needs a shared file, stop and ask.

The owner approved these shared-file touches (30 Sep 2026):

| File | Change | Why |
| --- | --- | --- |
| `src/lib/auth/public-paths.ts` (+ test) | `/store` added | without it every signed-out customer is sent to `/login` |
| `src/lib/schema-health.ts` | the `store_*` relations listed | `schema-health.test.ts` fails otherwise |
| `supabase/tests/run.sh` | migration `0025` and test `19` added | so `npm run test:rls` runs them |
| `AGENTS.md` | one pointer paragraph at the end | so the next session finds these docs |

The owner also approved a **fifth sanctioned use of the service-role key**, for
the store's webhook, OTP and reminder jobs. **Nothing in step 1 uses it** —
the catalogue is read with the ordinary client through `anon` policies, like
the Phase 14 shop. (The Messenger name is read through the existing
`getShopSettings()`, which is the Phase 9 public page's reader.) When step 5 and
step 8 need it, the boundary is: the Meta webhook after its signature is
verified, OTP checking, and the reminder cron — checked, capped, rate-limited,
and nothing else.

## Decisions made without asking (change any of them)

- **Migration number `0025`.** Two other branches already both use `0022`, and
  the sales session may take `0023`/`0024`. `0025` leaves them room. Check the
  highest number on `main` before adding the next store migration.
- **The store is always light.** The rest of the system follows the theme
  switch and defaults to dark. A customer should see white, black, red and gold
  whatever theme is left on the staff tablet, so `.store` in
  `src/app/(store)/store/store.css` re-declares the tokens with their light
  values. To let the store follow the theme, delete that file's rule and its
  import in `layout.tsx`.
- **A quote-only product has no price stored at all** (a check constraint), and
  its size surcharges and bulk tiers are unreadable to a stranger. So hiding the
  price is a fact about the data, not a promise made by a screen.
- **Stock is movements, not a number** (the same rule as Phase 5). A stranger
  can read only a bucket — in stock / low / out — never a count.
- **Variants come in one of three shapes**: all sizes, all colours, or all
  size-and-colour pairs. The admin screen (step 3) will keep it that way.
- **"Low stock" means everything buyable is running low**, not one size of
  several. A badge that cried wolf would be ignored on the day it was true.
- **"New" is 14 days** (`NEW_BADGE_DAYS`), a display convention, not a shop
  figure.
- **Search and sort are server-side and in the address bar**, as links, so they
  work without a script and can be shared.
- **Customer sign-in will use the store's own sessions**, not Supabase Auth, so
  customers never share an account pool with staff (step 5).

## Figures only the owner can know (never invented)

| Figure | Where | Until then |
| --- | --- | --- |
| Product prices, tiers, size surcharges | admin, step 3 | a product cannot exist without a price, or the words "quote only" |
| Low-stock threshold | per variant, `store_variants.low_stock_at` | no "low stock" badge |
| Messenger Page name | Settings → Your public page (already on To fill in) | "Chat now" is hidden |

`src/lib/data/checklist.ts` (the To fill in screen) is **not edited yet** — it
is a shared file and the owner's approval covered four others. The store's
prices arrive as a catalogue the owner enters, which the checklist already
treats as an empty list; the low-stock threshold should join it in step 3, with
the admin screen that sets it.

## Waiting on the owner

- Facebook/Meta app: the App ID and Secret, the Page name and a Page Access
  Token (step 5 and step 8). What to configure on the Meta side was given in
  the plan; **Messenger "post-purchase" message tags were retired by Meta on
  27 April 2026**, so order-update messages go inside the 24-hour window plus
  web push and the tracking page until Utility Templates are confirmed.
- An SMS provider for phone OTP (Semaphore or Twilio).
- Whether `/shop` is retired when the store replaces the homepage.
