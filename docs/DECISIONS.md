# Decisions

Section 17 of the specification lists what still needs the owner's answer. I ask
for each one **before the phase that needs it**, rather than all at once.

## How decisions are made now

On 18 September 2026 the owner said: *"just decide which is best and then we
will revise it later if necessary."*

So from Phase 4 onward I make the call, build it, and record it here as an
assumption with a note on how to change it — rather than stopping to ask.

The one exception is a **figure only the owner can know**: a price, a due day,
an interest rate, a wage. Those are never invented. They stay empty, with a
warning and a box to type them into, because a confident wrong number gets
trusted.

## Answered

| # | Question | Answer | Date |
|---|---|---|---|
| 17.1 | Technology and hosting | **Approved:** Next.js + TypeScript + Supabase + Vercel, as in spec section 2 | 18 Sep 2026 |
| 17.4 | Default theme | **Dark mode**, with a light/dark switch available | 18 Sep 2026 |
| 17.6 | Half days | **Half the daily rate.** A ₱500 daily rate pays ₱250 for a half day | 18 Sep 2026 |
| 17.2 | Devices / time clock | **Each person clocks only themselves in**, which means every staff member needs a login. Owner and Admin can still record a shift for anyone, as a logged correction | 18 Sep 2026 |

Still open from 17.1: **is there a monthly hosting budget limit?** The free
tiers cover the shop for now (see [SETUP.md](SETUP.md#what-this-costs)), so this
is not blocking.

## Asked for Phase 1, and not blocking after all

These four were put to the owner before Phase 1. The owner said to go ahead, and
it turned out Phase 1 did not depend on them: it builds the machinery, and these
answers are data typed into it. **Nothing needs rebuilding when they arrive.**

| # | Question | How Phase 1 handles it |
|---|---|---|
| 17.2 | **Devices:** one shared shop computer, staff's own phones, or both? | Built for both. Every screen works at counter width and on a phone, and the shared-computer case is covered by the **Switch user** button and the idle sign-out |
| 17.5 | **Work schedule:** working hours, working days, payday, week start | Seeded with the spec's defaults (8:00–17:00, 26 days a month, week starts Monday) and editable on the **Settings** screen. Payday matters from Phase 3 |
| 17.7 | **Staff list:** who, which need logins, which permissions | The owner adds them on the **Staff** screen, one at a time, ticking the boxes each person needs |
| 17.8 | **Limits:** staff expense limit, staff discount limit | Seeded with the spec's examples (₱2,000 and 10% / ₱100) and editable on **Settings**. Both discount limits apply at once, so whichever is reached first wins |

**Still worth answering** when convenient, so the defaults stop being guesses:
the real shop hours, which day is payday, and whether ₱2,000 / 10% / ₱100 are
the right limits.

## Asked for Phase 2, and now waiting on you in the app

> **Superseded on 19 September 2026.** Phase 2 used to ship with your figures
> from the specification already entered — 11 bills, 6 loans, and the 11
> counter buttons from Phase 4. You asked for all three lists to be emptied so
> you could enter them yourself, so migration `0011` removes them. The
> questions below no longer point at rows that exist; what replaces them is
> simply **the lists are empty, and the To fill in screen says so**.

Rather than guess the missing pieces, the screens ask for them and warn until
they are filled in.

| # | Question | Where to answer it |
|---|---|---|
| 17.13 | **The bills themselves, then the due day of each.** Without a due day the system cannot warn you before a bill is late | **Bills** screen → Add a bill. Each one shows **⚠ Due day not set** until you fill it in |
| 17.13 | **Each debt, with the balance from its latest statement** | **Loans** screen → Add a loan |
| 17.13 | **Interest rates from the statements** | **Loans** screen. Until a rate is entered, the payoff time ignores interest and says so, and no balance-growing warning can be raised |
| — | Whether any bill is **already paid this month** | Mark it paid on the **Bills** screen once the bill exists |
| 12.3 | Estimated monthly payroll for the daily target | Built in Phase 3, from each staff member's daily rate × the working days in a month |

**Why nothing was guessed:** a made-up due day would produce confident, wrong
warnings — worse than no warning at all, because you would start trusting them.
The same reasoning is now why the lists start empty: a bill you did not type in
is a figure you did not check.

## Asked for Phase 3, and now waiting on you in the app

| # | Question | Where to answer it |
|---|---|---|
| — | **Each staff member's daily rate** | **Staff** screen. Until a rate is set, payroll will not guess a wage, and the daily target says it is short |
| 17.5 | The real **shop hours** and which day is **payday** | **Settings**. Shop hours decide who is marked late and how overtime hours are counted, so the 8:00–17:00 default is worth correcting |

## Decided for Phase 4 — POS and receipts

Made by me, per the owner's instruction to decide and revise later. Each one
says how to change it.

| # | Question | What I decided | How to change it |
|---|---|---|---|
| 17.3 | Receipt printer | **58mm thermal by default**, the common choice for a shop this size. 80mm thermal and short bond paper are also supported | **Settings → Receipt paper**. No code change |
| 17.9 | What the colour tiers are for | Labelled by **ink coverage**: ₱5 light, ₱8 medium, ₱10 heavy, ₱15 full page / photo. That is the usual reason a print shop tiers colour | Rename them on the **Products** screen |
| 17.9 | Bulk discount rules | Built the **mechanism** — per-product quantity tiers, e.g. "50 pages or more: ₱2.50 each" — and seeded **no rules at all** | Add tiers per product on **Products** |
| 17.12 | Payment methods | **Added Maya** alongside Cash, GCash and Bank. An unused method costs nothing; a missing one costs a sale | It is a fixed list in the code; tell me to add another |

**Prices I did not invent.** Lamination, stickers, mugs, souvenirs and DTF
prints are seeded as products with **no price**, so the POS asks for the amount
each time until the owner sets one. Same rule as bill due days and daily rates:
a price is a figure only the owner can know.

Still worth sending when convenient: **one-colour black logo files** for
receipts. Until they arrive, receipts print a plain text wordmark, because a
white crest on white paper is invisible (spec 3.3).

## Decided for Phase 5 — Expenses and stocks

Made by me, per the owner's instruction to decide and revise later.

| # | Question | What I decided | How to change it |
|---|---|---|---|
| 17.14 | Quick-pick expenses | Seeded **eight buttons** named after the specification's own expense categories — Paper, Ink, Tarpaulin roll, Meals & snacks, Fuel, Delivery / shipping, Machine repair, Other — with **no amounts at all** | Rename, add or hide them on **Expenses**. Rename them to what you actually buy and the pop-up gets faster |
| 17.14 | Where the expense pop-up lives | A **+ Expense** button in the top bar, on every screen. Spec 11 asks for under ten seconds; walking to a screen first does not fit in ten seconds | It is in `AppTopBar` |
| 17.15 | Starting stock items | **None seeded.** Your materials, the unit you count each in, and the level you reorder at are all figures only you can know | Add them on **Stocks** |
| — | Receiving stock that is not paid for | Becomes a **supplier payable**, and paying it later writes the ledger entry. Buying on account is normal for a shop this size, and pretending the money left when it did not would make the drawer look short | Choose "Paid now" on the delivery form instead |
| — | Physical counts | The count writes the **difference** as its own movement. Overwriting the level would hide the loss, and a loss is the reason you count | — |

**Amounts I did not invent.** No quick pick has a usual amount and no material
has a reorder level or a price, so every one of them asks. Same rule as bill
due days, loan interest rates, daily rates and product prices: a figure only
the owner can know is never guessed, because a confident wrong number gets
trusted.

Still worth sending when convenient: your **most frequent purchases and usual
suppliers** (17.14), and your **main materials with their units, reorder levels
and costs** (17.15). All of it goes in while the shop is running, and the
**To fill in** screen lists whatever is still missing.

## Decided for Phase 6 — Dabz Apparel job orders

Made by me, per the owner's instruction to decide and revise later.

| # | Question | What I decided | How to change it |
|---|---|---|---|
| — | The steps an order moves through | **Quoted → Confirmed → Layout approved → In production → Ready for pickup → Released**, plus Cancelled. "Layout approved" is its own step because a sublimation order stalls there more than anywhere else, waiting on the customer to say yes to the design | It is a fixed list in the code; tell me to add or drop a step |
| — | Names, numbers and sizes | A **pasted list**, one player per line: `name, number, size`. A team captain sends a list — typing fifteen names into fifteen little forms is how a shop ends up keeping it on paper instead | — |
| — | How a line is counted | The **name list is the quantity**. A typed quantity is used only when there is no list (50 plain shirts) | — |
| — | Releasing with money owed | **Allowed**, and said out loud. A shop does let a regular take the jerseys; the order stays on the list until the balance is paid | — |
| 17.10 | Down payment policy | **Left empty.** Spec 17.10 offers "e.g. 50%" as an example, not as your answer | **Settings → Dabz Apparel**. Until then the order screen asks for whatever the customer hands over and never calls a payment short |
| 17.10 | Item prices and size add-ons | **The five items and the size ladder XS–5XL are seeded with NO amounts** | **Apparel → Set the apparel prices** |
| 17.10 | Fabric and collar options | **None seeded** — those are your suppliers and your words. The order form takes free text, so no job is ever blocked, and the list is only a shortcut | Add them on the apparel prices screen |

**What this means in practice:** a job order works today. Write the team, paste
the names, and the price is asked for on each line. Filling in the price list
only makes it faster and stops two people quoting the same jersey differently.

## Decided for Phase 7 — DabzTech repair tickets

Made by me, per the owner's instruction to decide and revise later.

| # | Question | What I decided | How to change it |
|---|---|---|---|
| 9.3 | Laptop passwords | **Never stored.** There is no box for one anywhere in the system, and a database test fails the build if a password-shaped column ever appears. A ticket records only how to get in: the customer unlocks it, it arrived unlocked, or it needs no unlocking. The claim stub tells the customer this too | Not changeable — it is a rule from the specification |
| 17.11 | Does a laptop cost the same as a desktop? | **Left open, in the shape of the data.** A service can be priced for one machine or for "any machine", and *Cleaning & repaste* and *Operating system install* are listed once per machine so you can price them apart — or give them the same number | **Repairs → Set the repair prices** |
| 17.11 | The checking fee and repair prices | **Twelve services seeded from your own list, all with no price.** A ticket works anyway: the price is asked for on each charge | Same screen. The checking fee is worth setting first, because it is charged even when the customer says no |
| — | The steps a ticket moves through | **Received → Being checked → Quoted → Being repaired → Ready for pickup → Released**, plus two refusals: "customer said no" and "cannot be repaired" | It is a fixed list in the code |
| 17.11 | What to do with unclaimed units | **Counted and warned about**, never disposed of by the system. A unit is flagged once it has sat for the number of days in Settings (30 today), counting from the day it was ready — not from the day it arrived | **Settings → DabzTech repairs**. What you then DO with them is your call; the system only makes sure you know they are there |
| 17.11 | Warranty period | **30 days**, the spec's own default, **copied onto each ticket at release** | **Settings**. Changing it never shortens a warranty already given |

**What this means in practice:** a repair ticket works today. Take the unit in,
write what is wrong in the customer's words, and the price is asked for on each
charge. The claim stub prints with what came in, what came with it and what it
looked like on arrival — the three things an argument later turns on.

---

## Decided on 19 September 2026 — the catalogue is yours to enter

You asked for the products, the loans and the bills to be cleared so you could
add them yourself, and for a way to edit or delete one already entered.

**What was decided, and why**

- **The seeded rows are removed by a migration, not by hand** —
  `supabase/migrations/0011_clear_catalogue_and_allow_delete.sql`. An earlier
  migration must never be edited once it has been applied, so the way to undo
  one is a later migration that removes what it put there. The useful side
  effect is that a database built from scratch ends up in the same state as
  your real one: empty, waiting for you. To put a starter list back, add a new
  migration that inserts it — never edit `0002` or `0005`.
- **A row may be deleted only while nothing has happened to it.** A bill that
  has been marked paid, a loan that has been paid down, a product that has been
  sold: those have payment records and ledger entries hanging off them, and the
  database would take those with them. Those can only be **stopped** (or
  hidden), which keeps every figure and takes the row out of the running
  totals. The screen says which is which before you press anything.
- **The rule lives in the database**, as delete policies, not only in the
  button — a Server Action is a public endpoint. `supabase/tests/11_delete_rules.test.sql`
  proves it against a real PostgreSQL. To loosen it, change the policies in
  `0011`; do not add a Server Action that works around them.
- **Deleting is recorded.** The whole row is written to the audit log first,
  with a before/after, so what was removed is still readable afterwards. That
  is the only trace left, which is why it is the whole row and not a summary.
- **Loans gained a Stop button**, which they never had. A loan could be added
  and edited but never set aside, so a settled debt stayed in the total owed
  for good.
- **A daily target of zero now reads as "no target yet", not "reached".** With
  no bills entered the target is zero, and the Overview used to put a green
  ✓ Reached at the top of the screen before a single sale. Zero means not
  known. `src/lib/target.ts` and `src/lib/closing.ts`.

**How to change it:** the wording of every refusal is in `src/lib/deletable.ts`,
in one place, so the button and the message cannot drift apart.

**Then, the same day: the apparel and repair price lists too** (`0012`). Same
rules, plus three decisions of their own:

- **The apparel size ladder is NOT cleared.** XS to 5XL are not a price list —
  they match `APPAREL_SIZES` in the code, they are what a roster picks from,
  and the add-on beside each one was already blank. The screen edits those rows
  and has no "add a size" form, so clearing them would have removed the only
  place to type a surcharge. To make the ladder editable instead, add an
  add/remove form there and then it could be cleared like the rest.
- **The checking fee is now nameable.** `is_checking_fee` marks the one charge
  that applies even when the customer says no, and it arrived on a seeded row
  with no control anywhere — so clearing the list would have left the shop
  unable to have a checking fee at all. The service form has a tick box, and a
  partial unique index allows only one row to carry it.
- **A bill labelled "loan installment" now has to be pointed at a loan.** This
  was a real bug the clearing exposed: `bills.loan_id` had no writer anywhere
  in the app, so once the seeded bills were gone, marking an installment paid
  would take money out of the ledger and move no balance, silently. The bill
  form asks for the loan, `billLoanLink()` clears it when the bill goes back to
  being an operating cost, and the Bills screen warns about any installment
  that has no loan behind it.
- **A `SECURITY DEFINER` helper checks the caller itself.** The `*_has_history`
  functions are PostgREST URLs, so one that answered a staff account would be a
  way round "staff see nothing of the bills and loans" — one bit at a time.
  They return null to anyone but Owner/Admin. The catch, learned the hard way:
  a migration's own `DO` block then cannot call them either, because nobody is
  signed in, and `where not null` deletes nothing while reporting success.

**And then `0013`, the same day.** `0011` and `0012` kept two bills and two
loans, because the owner had marked them paid while trying the system out, and
those had payment history. The owner asked for them gone too. `0013` removes
them **and the ledger entries their payments wrote** — leaving those behind
would put a money-out row on the books for a bill the system can no longer
explain, and the monthly expense totals would still count it.

It stops there on purpose: sales, job orders and repair tickets are untouched,
because a customer may be holding the receipt, and the audit log is
append-only and is now the only record that any of it existed. **The general
rule is unchanged** — a row with history is stopped, never deleted. `0013` is a
one-off for a database that was only ever being tried out. If real months of
payments ever need clearing, that is a different conversation, not another
migration like this one.

## Decided after Phase 9 — Printable payroll summary for any dates

You asked for a printable payroll summary for any run of dates, Owner and Admin
only. It lives at **/payroll/summary**, with a **Print payroll summary** button
beside the heading on the Payroll screen.

The hard part is that a payroll week and a calendar month do not line up: the
week beginning Monday 28 September is paid partly out of September and partly
out of October. Everything below follows from that.

| Question | What I decided | How to change it |
|---|---|---|
| A week cut by the dates | **Day pay and overtime count day by day**, so only the days inside the range are paid here. **The week's bonus and cash advance deduction count whole**, in whichever summary holds the week's **first day** | `buildPayrollSummary` in `src/lib/payroll-summary.ts`. The rule is one `startsInRange` check, and the tests beside it prove a split week is counted exactly once across two months |
| One row per person, or one per week | **One row per person**, with "Includes part of a week" under the name when one of their weeks runs past an end | Same file: the rows are grouped by staff id. A week-by-week sheet would be a different table over the same figures |
| Weeks not yet paid | **Included**, with the row marked *Not yet paid* or *Partly paid* and the total split into **Already paid out** and **Still to pay** | Filter on `status === "paid"` before building the rows if you only ever want a record of money that has left |
| How long a range may be | **400 days.** Not a technical limit — a guard against a mistyped year, which would otherwise print a wall of nothing instead of an obvious mistake | `MAX_RANGE_DAYS` in `src/lib/payroll-summary.ts`, one number |
| Paper | **Landscape.** Ten columns across A4 portrait would shrink the figures to the point where somebody checking their own pay cannot read them | The `@page` rule at the top of `src/app/(app)/payroll/summary/page.tsx`. Dropping a column would be the other way to make portrait fit |

**Three things it deliberately does not do.**

- **It never reads the stored weekly total.** Every figure is added up from the
  saved days, the same rule as a payslip and a receipt — a stored total cannot
  be cut in half honestly, and seven saved days can. Where a week lies *wholly*
  inside the dates, the two are compared and any disagreement is printed as
  **⚠ A week needs saving again**. A week the dates cut in two is never
  compared, because half a week *should* come to less than the stored total,
  and a warning on every month boundary would teach you to ignore it.
- **It does not quietly leave anyone out.** An active staff member with a daily
  rate and nothing saved in those dates is named under the table as **⚠ Not on
  this sheet**. A missing row on a wage sheet looks exactly like a person who
  earned nothing.
- **It stores nothing and adds no migration**, the same as Reports (Phase 8).
  The sheet is worked out fresh each time it is opened, so it can never fall
  out of step with the payroll screen it was built from.

Two smaller calls, for the record: **a quick pick covers a whole period** — This
week is the full seven days of the payroll week, This month the full calendar
month — because this is a sheet for a pay period, not a "so far" figure; and
**dates entered the wrong way round are swapped rather than refused**, with a
note saying so, because that is a slip, not a mistake.

---

## Decided for Phase 10 — One counter, all three divisions

Phase 10 connects the Counter, Dabz Apparel and DabzTech into one place to take
money and one place to see it. It adds almost no new storage on purpose:
`public.collections` is a **view**, so it stores nothing and can never fall out
of step with the rows underneath it.

**The calls I made**

| Question | What I decided | How to change it |
|---|---|---|
| Who may take an Apparel or DabzTech payment at the counter | **The division's own permission.** `Add sales` alone gives neither, and somebody with only `Add sales` does not see the button at all | Tick **Dabz Apparel job orders** or **DabzTech job tickets** on the **Staff** screen. This matches the security rules that already existed — nothing was widened to make the counter work |
| Which jobs the counter can take money against | **Anything with a balance that is not cancelled**, including a **released** order or ticket | Spec 8 says a shop does let a regular take the jerseys and settle later, so those have to stay findable — an order that disappears is an order nobody chases. To hide them, filter on `isOpenOrder` / `isOpenTicket` in `getPayableJobs` |
| Whether a payment is a down payment or a balance | **Chosen on the form, not deduced.** It starts on the old rule — the first money is a down payment, everything after is a balance — but a customer *can* hand over a second down payment on a job that has not started | The `defaultPaymentKind` helper in `src/lib/collections.ts` sets where the box starts |
| DabzTech payments taken before this phase | **They keep no kind at all** and read as plain **Payment** | Nothing to change. `repair_payments.kind` is nullable with no default precisely so those rows stay honest — nobody can now know which they were, and a guess would be trusted |
| A down payment under your policy | **Warned about with ⚠, never refused.** You may have agreed to take less | `checkPaymentAmount` refuses only nothing and too-much. With no percentage set, nothing is shown at all |
| Takings paid into the **owner's pocket** | **Counted in the day's total, kept out of the drawer.** It is money the shop collected, so leaving it out of the total understated the day against its target; it never reached the drawer, so putting it in the cash figure would make an honest drawer read as short | `ownersPocketCentavos` in `computeClosing` (`src/lib/closing.ts`), with tests either side of it |
| Which timestamp the feed calls "when" | **When the row was written**, not the "Paid on" date somebody typed | It has to be, because the matching ledger entry is stamped in the same transaction and the two are required to agree for any day. A backdated payment still says so on screen — the typed date rides along as `recordedForISO` |
| What a closed day remembers | **Ten nullable per-division columns plus the owner's pocket**, frozen at the moment the drawer was counted | A day closed before Phase 10 stays **null** and the screen says "Breakdown not recorded for this day". Zero would be a claim; null is the truth. Columns are on `day_closings` in `0015` |
| Down payments held | **A view of existing data, not a new category.** Nothing about how income is recognised changed | `heldForUnfinishedWork` in `src/lib/collections.ts`. It must never be subtracted from anything, or the same peso is counted twice in opposite directions |
| Which repairs count as "work still owed" | **Any ticket not released**, including **declined** and **cannot be repaired** | The unit is still on the shelf and nothing has been handed back — that is exactly the pile spec 9.4 is about. `getHeldMoney` in `src/lib/data/collections.ts` |
| A DabzTech down payment percentage | **Not added.** The spec offers one only as a possibility, and inventing a policy would have staff turning a customer away over a rule nobody set | If you want one, add it as a **nullable** setting, leave it **empty**, and list it in `src/lib/data/checklist.ts` like every other figure only you can know |

**Two things that were already wrong, and are now fixed**

- **Maya was missing from every form but the counter.** The database has
  accepted `maya` on every money table since migration `0005` (open decision
  17.12, decided), and the End of day screen has counted a Maya line ever
  since — but `MONEY_SOURCES` in `src/lib/ledger.ts`, which is what builds
  *every other* form, never included it. So a Maya apparel down payment, a Maya
  bill payment and a Maya expense were all impossible to record, and the Maya
  line could only ever be filled by a counter sale. One entry in one list.

- **A deactivated account could still read its own old sales.** `sales_read_own`
  compared `created_by` to `auth.uid()` and checked nothing else, so it did not
  obey spec 13.1 the way every other policy does. Signing in already refused a
  deactivated account, so nothing leaked through a screen — but Row Level
  Security is the boundary, and a boundary that relies on the layer in front of
  it is not one. `0015` adds `current_role_name() is not null` to that policy
  and to the two beside it, which costs an active person nothing. The Phase 10
  test found it, and now guards it.

**Three things Phase 10 deliberately does not do**

- **It does not create a new way for money to reach the ledger.** The counter's
  new payment action calls `record_apparel_payment` and `record_repair_payment`
  — the same two functions those screens have always used. A second path is how
  two paths end up disagreeing.
- **It does not build a second void.** Apparel and DabzTech payments are still
  voided by the owner from their own order or ticket. The Sales feed links
  there rather than offering its own button.
- **It does not change how income is categorised or when it is recognised.**
  Every figure it shows is a reading of money the ledger already holds.

---

## Decided after Phase 10 — a short read is never a total

Phase 10 made `public.collections` the one place the day's money is read from,
and made it `security_invoker` so the three tables' own policies decide what
comes back. That is the right design. What it also did was make **a partial
read the normal case**, and six screens went on treating whatever came back as
the whole day.

| Question | What I decided | How to change it |
|---|---|---|
| A read that fails | Comes back as `failed: true`, and the screen says so. It used to `return []`, which prints as **PHP 0.00** and "Nothing has been taken yet today" — a missing migration or a stale PostgREST cache reading as a quiet, confident empty day | `getCollections` in `src/lib/data/collections.ts` |
| A read that hits its row cap | Comes back as `truncated: true` and every screen, the print view and the CSV say the figures are a floor rather than a total. Detected by asking for `limit + 1` — there is no other way to know | `COLLECTIONS_DEFAULT_LIMIT` (500 a day) and `COLLECTIONS_REPORT_LIMIT` (5,000 a report) |
| How much of a door somebody sees | Three answers, not two: **all**, **own**, or **none**. Apparel and DabzTech are all-or-nothing on a permission; the COUNTER is not — without `view_daily_sales_report`, `sales_read_own` returns only your own rows | `doorVisibility` in `src/lib/collections.ts`, with tests beside it |
| What End of day stores for a door the closer cannot see | **Null, never zero.** The columns were made nullable for exactly this, and `toBreakdown` already treats one null as "no breakdown recorded" rather than a partly invented one | `saveClosingAction` in `src/app/(app)/closing/actions.ts` |
| What the ledger is compared against | Only income from `sales`, `apparel_payments` and `repair_payments` — the three tables the feed is a view of | `readFeedIncome` in `src/app/(app)/closing/totals.ts` |

**The counter one is the one worth reading twice.** `printshoppe` was treated as
always visible, so an assistant with only Add sales saw their own PHP 1,200
printed under the whole counter's name, with no warning — and End of day froze
that same shortfall into `day_closings` as fact. The figure was never wrong;
its *label* was. It now reads "Counter (your sales)" and the day total carries
a ⚠ saying part of today is missing.

**Why the ledger comparison was raising a false alarm every day.** End of day
compares the collections table against the ledger and shouts if they disagree.
It was comparing against *all* income — including anything typed in by hand on
Money in/out, which the feed has no row for. So a shop that records one manual
income entry saw "This table and the ledger do not agree" every single day.
The SQL suite had it right all along (`12_phase10_rls.test.sql` restricts the
ledger side to the three source tables); the screen did not. An alarm that
cries wolf daily is worse than no alarm, because the day it is right nobody
looks.

**The general rule this all serves, which was already written down:** a zero is
a claim. `target.ts` has `unknown`, the closing columns are nullable, a bill
with no due day stays empty. A read that could not see everything belongs in
the same family, and now says so out loud.

## Decided after Phase 10 — Sales shows one day, and says which

**What happened.** The owner opened Sales on the morning of 21 September, saw
**PHP 0.00** under Collected today, Counter, Apparel and DabzTech, and asked me
to fix it because the sales "have been reset".

Nothing had been reset. The screen read **today and only today**, with no way
to ask for another day: no arrows, no date box, no `?on=` in the URL. Before the
first customer of the day, every figure on a screen called "Sales" is honestly
zero — and from the outside that is indistinguishable from the shop's takings
having been wiped. The empty state made it worse by saying "Nothing has been
taken yet today" and stopping there, which answers a question nobody was
asking.

| Question | What I decided | How to change it |
|---|---|---|
| Which day Sales shows | Whichever `?on=YYYY-MM-DD` names, and today when it names none | `salesDay` in `src/lib/collections.ts`, with tests beside it |
| What a bare `/sales` means | **Today, always.** Today carries no parameter at all, so a link saved this morning still opens on the right day tomorrow and the sidebar needs no special case | `salesHref` in `src/app/(app)/sales/page.tsx` |
| An unreadable date in the URL | Falls back to today rather than refusing to draw. The heading always names the day being shown, so nothing is silently wrong | `salesDay` |
| How far forward you can go | **Today.** There is no forward arrow on today, because tomorrow cannot have taken anything and a button that leads nowhere is tapped once and trusted less afterwards | `next` in `salesDay` |
| A day typed in that has not happened | Says "has not happened yet" — **not** "nothing was taken". One is about the calendar, the other is a claim about the shop | `EmptyDay` in the Sales page |
| What an empty day says | Which day it was empty on, and that this screen shows one day at a time with the earlier days still on their own days | `EmptyDay` |
| Whether a filter survives a change of day | Yes, both ways. The door and the method ride along in the URL and as hidden fields on the date form | `hrefFor` in the Sales page |

**Why the wording carries as much weight as the arrows.** The arrows fix "I
cannot look at yesterday". They do not fix "I think my money is gone" — that
needed a sentence, in the empty state, saying out loud that this is **one day**
of a book that still has all its other days in it. It is the same rule the rest
of the system already follows: a zero is a claim, and a claim has to say what
it is a claim about.

**What this deliberately does not do.** It does not turn Sales into a range
report. A range that crosses days would make "Collected today" meaningless, and
Reports already adds up a month with a comparison against the period before it.
Sales stays a day at a time; it just stopped pretending there is only one day.

**One consequence worth knowing.** `partialReadWarning` no longer says
"Today's payments could not be read" — it says "The payments for this day",
because the screen can now be pointed at any day. Overview still shows today
only, and the wording is true there too.

---

---

## Decided for Phase 11 — Notifications

You asked for these knowing the build plan lists them under *Later, not in the
first build*, and knowing phases 4 to 10 are still waiting to be confirmed.
Recorded here so the reason is on paper: **you asked, twice, after I raised
both points.** They are independent of Phase 10, so nothing is stacked on
unverified work.

| Question | What I decided | How to change it |
|---|---|---|
| A daily summary, or an alert per event | **One summary each morning.** A shop generates dozens of these a week; twelve a day gets the channel muted, and a muted channel is worse than none because everyone still believes it works | Add a kind to `digestLines` in `src/lib/notifications.ts` |
| What happens on a quiet day | **Nothing is sent.** Not "all clear" — enough cheerful notifications and you swipe them away unread, and the one that mattered goes too | `buildDigest` returns null. It is the behaviour most likely to be "fixed" by mistake; there is a test named for it |
| When the summary arrives | **Your shop's opening time**, read from the `workDayStart` you already set. Nothing invented | The cron fires at `0 0 * * *` UTC = 8am Manila, in `vercel.json`. Change your opening hour and change that line to match (UTC = Manila − 8) |
| Anything immediate | **A customer message, and nothing else.** It is the only one with a person waiting at the other end (spec 9) | `notifyOwnersOfEnquiry` in `src/app/(public)/actions.ts` |
| What the customer alert says | **That somebody wrote, and nothing about who.** A lock screen is readable by whoever is near the phone, and a stranger's name and number are Owner/Admin material (spec 4.3) | `enquiryAlert`. Worth keeping as it is |
| Who may receive them | **Owner and Admin only**, refused by the database and not only by the screen. Every figure a summary carries is beyond a staff checkbox | The insert policy in `0017`. Widening it means deciding what a staff digest could safely say, which is a real question, not a toggle |
| Whether admins see each other's phones | **No.** An endpoint is a device; one admin reading another's device list is a privacy question with no upside | `push_subscriptions_read_own` in `0017` |
| Per-kind on/off switches | **Not built.** One summary does not need filtering, and every switch is another thing to get wrong | If you want them they belong on the subscription row, not in Settings — a person may have two phones with different answers |
| Turning a phone off | **Deletes the row.** The one place in this system where deleting is right: it is a standing permission, not a money record, and a withdrawn permission must leave nothing behind that anything could still send to | `unsubscribeAction` |
| A phone that stops answering | **404 and 410 switch it off** (the browser is gone); anything else is forgiven ten times first | `MAX_FAILURES` and `subscriptionVerdict`. Switching off after one bad afternoon is how somebody silently stops getting warnings |
| A third use of the service-role key | **Allowed, for the digest cron**, which runs as nobody and must read every Owner/Admin's phones and the shop's warnings. Now listed in AGENTS.md beside sign-in and the public page | It is the only way a cron can read anything. What keeps it safe is `CRON_SECRET` and the fact that the route only ever sends |
| Hand-rolling the Web Push crypto | **No — added the `web-push` package.** It is a VAPID JWT plus RFC 8291 aes128gcm encryption, and getting either subtly wrong does not raise an error, it just makes the push service answer 400 and nobody learns why | It is the standard implementation. The alternative is ~120 lines of crypto this project has no business owning |

**Two things worth knowing before you rely on it**

- **The last hop is untested.** Everything up to the moment a message leaves
  the server is covered by the 645 tests. Whether it lands on your phone needs
  a real deployment, a real project and a real handset — the steps are in
  [PHASES.md](PHASES.md).
- **On an iPhone you must add the system to your Home Screen first.** Apple
  only allows notifications for an app installed that way. Safari in an
  ordinary tab will say it is unsupported, and it is right.
## Decided after Phase 10 — a deactivated account reads nothing of its own

Deactivating an account is supposed to remove all access **immediately**
(spec 4.2), and a token stays valid until it expires. So "immediately" has to
be the policies' job, not the sign-in screen's. `current_role_name()` returns
null for a deactivated person, so every policy written in terms of a role or a
permission already refused them — but the **own-row** policies matched on
`auth.uid()` alone. Somebody dismissed this morning could still read, this
afternoon: their own daily rate, address and emergency contact; their own
permission list; and their own payslips, attendance, cash advances and
deductions.

Migration `0015` fixed the same defect on `sales`, `sale_lines` and
`void_requests`. `0017` is the rest of it, found by listing **every** policy
whose predicate reaches `auth.uid()` and **every `SECURITY DEFINER` helper that
resolves the caller**, in a real database, rather than by looking where a test
happened to fail.

| Question | What I decided | How to change it |
|---|---|---|
| Five tables that never mention `auth.uid()` | Fixed in **one place**: `my_staff_id()`. It is `SECURITY DEFINER`, so it bypasses RLS on `staff` and answered for anybody whose profile id matched, active or not. `payroll_weeks`, `payroll_days`, `attendance_entries`, `cash_advances` and `advance_deductions` all compare against it, so guarding the helper closes all five | `my_staff_id()` in `0017` |
| `staff_read_own`, `user_permissions_read_self` | Guarded with `current_role_name() is not null`, the same shape `0015` used | The policies in `0017` |
| `profiles_read_self` | **Deliberately left open.** It is the row the app reads to discover the account is inactive — `getSignedInUser()` reads `status` from it and sends the person to "your account is no longer active". Guarding it would make a dismissed person's own name unreadable to the very screen trying to explain the situation, and they would get a blank "signed out" instead. It carries their own username and name and nothing about anybody else | Add the same clause if that message is ever worth losing |
| `stock_movements_insert` | **Nothing to do.** It looks unguarded and is not: its check goes through `has_permission()`, which is already false for a deactivated account | — |

**A `SECURITY DEFINER` helper must check the caller itself.** This is the third
time that rule has come up — after the `*_has_history` functions and
`is_active_staff` — and it is the same lesson each time: being `SECURITY
DEFINER` is exactly what makes the check mandatory rather than optional,
because nothing above it will do the check on the way past.

**The test runs every check twice**
(`supabase/tests/13_deactivated_account.test.sql`): once while the account is
active, to prove the policies still serve the people they are meant to, and
once after it is deactivated with the same live token. A test that only
checked the second half would pass just as well on a policy that refuses
everybody.

---

## Decided on 21 September 2026 — a tarpaulin rate can be typed in

The four rates on the counter (₱30, ₱25, ₱20, ₱15) are the ones you quoted, and
they stay the list. What was missing was the job none of them covers: a price
agreed on the phone, a bulk order, an unusual material. The counter had to pick
the nearest rate and then correct the total afterwards, and once that happens
the receipt no longer says what was actually agreed — the line still reads
"× 30.00" while the money says otherwise.

So the rate picker now has a **Custom amount** entry. Choosing it opens a box
for pesos per square foot, and the total, the receipt line and the sale all
carry the figure typed there: 3 × 5 ft at ₱27.50 reads
"Tarpaulin 3 × 5 ft — 15 sq ft × 27.50" and adds up to ₱412.50.

Three choices inside it are worth keeping.

**The box starts empty and no figure is suggested.** The placeholder is `0.00`,
which is a format and not a price — what a square foot is worth is yours to
say, the same rule as a bill's due day or a staff member's daily rate. Until
something real is typed there is no total and no **Add to sale** button, and the
warning under the calculator names the missing figure rather than blaming the
measurements.

**There is deliberately no upper limit on the rate.** A ceiling would be the
code inventing a price rule, and the total is on screen before anything reaches
a sale, so a typo is visible where it can be corrected.

**A typed rate is not saved as a new preset.** It prices one job and is gone,
because a rate that quietly joined the list would start being used by somebody
who was not standing there when it was agreed. To change that: the presets are
`TARPAULIN_RATES` in `src/lib/pos.ts` — tell me a rate to add and it becomes a
permanent entry in the picker.

The reading of the typed amount is `parseTarpaulinRate` in `src/lib/pos.ts`,
beside the calculator rather than in the screen, because it is a money
calculation: "30", "27.5" and "1,250.75" all have to land on the same centavo
the presets do. `src/lib/pos.test.ts` proves that, and
`src/app/(app)/pos/PosScreen.test.tsx` walks the counter through picking
**Custom amount**, typing a rate and adding the banner to a sale.

---

## Fixed on 21 September 2026 — a form that opened on last time's answer

You recorded a ₱5.00 expense, and the next time you opened the pop-up it still
said "₱5.00 recorded." above no form at all. The same fault was in twenty-odd
other panels across the system, and in two of them it was worse than
confusing.

**The cause is one React fact.** `useActionState` holds whatever the server
last said until the NEXT submit, and nothing can clear it from outside — not a
refresh, not closing the panel. Every one of these forms kept that state in a
component that never goes away: the expense pop-up lives in the top bar, and
the panels on Bills, Loans, Apparel, Repairs, Stocks and the rest ARE the
button you tap, so they have to stay on screen when they are closed. Open one a
second time and you were reading the first visit's answer.

**Two fixes, because the panels are not the same shape.** Where the thing can
simply be unmounted, it now is: the expense pop-up keeps its state inside the
dialog, so closing the dialog forgets it — the pattern `TakeOrderPayment` on
the counter already used. Where it cannot, `useFormPanel`
(`src/components/use-form-panel.ts`) remembers which answer was already on
screen when the panel was opened and hides that one. It is the same trick
`PosScreen` uses with `finishedSaleId`, made shared.

**The answer is hidden from the moment the panel OPENS, not when it closes.**
That is deliberate. "₱500.00 recorded." beside the button after you close the
form is the receipt for what just happened and belongs there; the same sentence
above an empty form you have just opened is an answer to a question nobody has
asked yet.

**Two screens were not just confusing, they were stuck.** `New job order` and
`Take a unit in` replaced themselves with a success notice and had no way back,
so a second team at the counter — or a second laptop on it — needed the page
reloading before the order could even be started. Both now offer "Write another
order" / "Take another unit in" beside the link to the one just opened.

To change any of it: `useFormPanel` is thirty lines and one idea, and a panel
that wants last time's answer kept can simply read `state` instead of `answer`.

---

## Assumptions I am working under

Where the spec gives a default, I use it and note it here rather than stopping
to ask:

- Week runs **Monday–Sunday** (spec 2.1) — changeable in settings.
- **26 working days** per month for the daily target (spec 12.3).
- Warranty period **30 days** (spec 9.3).
- Unclaimed units flagged at **30 days** (spec 9.4).
- Auto-logout after **15 minutes** idle (spec 4.1) — **for owner and admin
  accounts. Staff accounts stay signed in until they sign out** (owner's
  request, 21 September 2026: the counter staff kept being thrown back to the
  login screen mid-day). I kept the timer on owner and admin accounts because
  those can open payroll, the ledger and the bills, and the counter computer is
  shared. To change it: Settings → *Keep staff accounts signed in until they
  sign out* (untick to put staff back on the timer); the minutes box beside it
  still sets the timer, up to 480. Stored in `app_settings.staff_stay_signed_in`
  (migration `0014`); the rule itself is `idleSignOutMinutes` in
  `src/lib/settings.ts`.

  **What "until they sign out" covers, and what it does not.** This system no
  longer starts a timer for a staff account, so nothing in *our* code signs
  them out. Supabase can still end the session itself, from the **dashboard**
  — *Authentication → Sessions*, "time-box user sessions" and "inactivity
  timeout". The owner checked those on **21 September 2026 and both are off**,
  so as of that date nothing at any layer signs a staff member out.

  That is a fact with a date on it, not a property of this code, and it can be
  changed by anyone with the dashboard. Two things follow. It is NOT set by
  `supabase/config.toml` — that file configures the Supabase CLI running
  locally, and `npm run db:push` sends migrations only, never auth settings,
  so neither the repository nor a deploy can tell you what those two settings
  are today. And if a staff member IS ever signed out after a long gap, that
  is Supabase doing it rather than this system: check those two settings again
  before looking at `idleSignOutMinutes`.
- New staff get **Add sales (POS)** permission by default, nothing else
  (spec 4.3).
- Passwords need **at least 8 characters, with a letter and a number**. Supabase's
  own floor is 6, which felt low for a system holding payroll.
- Temporary passwords are **10 characters** and leave out `O`, `0`, `I`, `l` and
  `1`, because the owner has to read them out or write them down.
- Usernames are **lowercase, 3–30 characters**, letters and numbers with dots,
  underscores or hyphens inside. Narrow on purpose: easy to type at 7am, hard to
  confuse with someone else's.
- A bill due on the **31st falls due on the last day** of a short month, rather
  than being skipped or spilling into the next one — which is how a lender
  treats it too.
- A loan's remaining balance subtracts only payments made **after** the
  statement date, since earlier ones are already inside the statement figure.
- **"Equal to" counts as growing**: a payment that exactly matches the monthly
  interest never reduces the debt, so it earns the warning (spec 12.2).
- The daily target is **rounded up**, so a month of daily targets covers at
  least what is actually owed.
- Undoing a bill payment **voids** its ledger entry but **removes** the loan
  payment. The first is a record that money moved; the second is a claim the
  balance went down, which is no longer true.
- A **half day pays half the daily rate**, rounded to the nearest centavo. On a
  whole-peso rate the halves are exact; an odd-centavo rate can differ from a
  true half by one centavo.
- **What makes a day a half day is the owner's choice**, set on the payroll
  screen, exactly like the overtime choice in spec 13.3. The system suggests it
  when someone worked less than half the scheduled hours, but never decides it -
  a wrongly guessed half day is a wrong wage.
- A **cash advance deduction is capped at gross pay**, so net pay can never go
  negative. The remainder carries over to the next payday (spec 13.4).
- Money is never hard-deleted by staff; corrections go through voids and
  adjustments with a reason (spec 2.1).
- A stock quantity is stored as **whole thousandths** of its unit (20 reams is
  20000), so a level built from hundreds of movements stays exact. Three
  decimals is as fine as a print shop measures.
- **At the reorder level counts as low**, not below it: "order more when you
  are down to 5 reams" means 5 is already the moment, not the moment after.
- **An expense exactly at the staff limit is allowed.** The limit is what staff
  may spend, not what they may not.
- **Receiving stock with no price recorded still updates the shelf**, and
  claims no money moved. That is the honest answer when nobody at the counter
  knows what the delivery cost.
- The daily target now measures **profit**: today's income less today's
  materials and running costs. Bills, loan payments, wages and cash advances
  are excluded, because the target is what pays for them.
- A **size surcharge is copied onto each name** when it is added, so raising it
  later never rewrites a quote the customer already agreed to.
- A size with **no surcharge set** goes onto an order at no extra charge, and
  the screen says so when the list is pasted in. That is not the same as free —
  it is unknown, and the order still has to total something.
- An apparel **order number is `A-YYMMDD-NNN`**, counting orders within the day,
  the same shape as a receipt number. A repair ticket is `T-YYMMDD-NNN`.
- A **declined or unrepairable unit is still in the shop**, so it counts toward
  the unclaimed warning. The work ended; the unit did not leave.
- The **unclaimed count runs from the day a unit was ready**, not from the day
  it arrived. A repair that took three weeks is not an abandoned unit.
- Removing a part from a repair charge **does not put it back on the shelf**.
  The part did leave; putting it back is a delivery somebody records on Stocks.
- A report period is compared with the **same length of time immediately
  before** it, not with the previous calendar month — eleven days against
  eleven days, so a half month never looks like a collapse.
- A percentage change against **zero is not given at all**. "Up 100%" from
  nothing is meaningless, so the report says "nothing to compare with".
- **Share percentages are not forced to total 100.** The amounts are exact; the
  percentages are a reading aid and the screen says so.
- Reports are **computed on the spot, never stored**. Nothing to rebuild,
  nothing to fall out of step.
- The shop's **address, phone, opening hours, Facebook page and Messenger name
  are settings that start empty**, and the public page leaves out whatever is
  missing. They are facts only the owner knows, and this page is read by people
  who might drive to it. They are listed on **To fill in** instead — to change
  that, edit `src/lib/data/checklist.ts`.
- The public page is **on by default**. Off by default would mean a page nobody
  could see and no reason to look for the switch; on, it simply shows less
  until it is filled in.
- **The public page never carries a note addressed to the owner.** What is
  missing is on the To fill in screen. A "fill this in" message on the front of
  the shop reads to a customer as a shop that is not open yet.
- The **owner's home moved from `/` to `/overview`** when `/` became the public
  page. Everything that used to send a person to `/` now sends them to
  `/overview`.
- A repair service on the public page is shown **with its machine in the name**
  — "Cleaning & repaste (laptop)". Internally the machine is its own column;
  on a page read once by a customer, two identical lines at two prices look
  like a mistake.
- **An enquiry is written only by the server.** The `enquiries` table has no
  insert policy for anyone, so the single way in is a Server Action that
  validates, drops honeypot submissions and rate-limits first. An insert policy
  open enough to let a stranger write is open enough to fill with rubbish, and
  there is no closing it afterwards. To change the limits, edit
  `ENQUIRY_LIMITS` in `src/lib/enquiries.ts`.
- **Five enquiries an hour from one address.** Generous for a person — an
  office or an internet café shares one address — and useless for a script.
  Where there is no address header at all, everyone counts as one sender, which
  makes the limit stricter rather than looser.
- **Staff cannot read an enquiry at all.** It carries a stranger's name and
  phone number, so it sits with bills and payroll (spec 4.3) rather than behind
  a staff checkbox. Change this by adding a staff policy to `enquiries` and a
  permission to go with it.
- **The system does not send the reply.** The shop answers on Messenger, by
  text or by phone, and records here that it did. Sending mail would need a
  mail account the shop has not set up, and a reply that silently failed is
  worse than no reply button at all.
- **"How did you hear about us" is the whole of the advertising measurement.**
  Meta Ads tracking needs a Meta app, a page token and Meta's app review — the
  owner's own credentials. The customer's own answer needs none of them, and a
  pixel cannot tell you somebody came because their cousin recommended you.
- Answers are **grouped without regard to case but shown as first spelled** —
  "Facebook" and "facebook" are one line, printed the way the first person
  typed it.

- **Every tappable piece of text carries `TAP_AREA`** from
  `src/components/ui.tsx` - links and small actions worded as links alike.
  Bare underlined text measures about 20px and the design rules ask for 24px,
  which had been quietly broken in thirty places across phases 1–8 until a
  browser measured them. It is padding only, so nothing looks different; what
  changed is how easy it is to hit. `src/components/tap-targets.test.ts` fails
  if the next one is added without it. To change the size, change that one
  constant.
- The padding is **not** `inline-block`. Half of these links sit inside a
  sentence, and an inline-block link cannot break across two lines. Vertical
  padding on an ordinary inline element leaves the line height alone - the
  paragraph does not reflow - and still takes the tap. Measured in a browser,
  not assumed.
- `py-1.5` rather than `py-1` because an inline box is sized by the **font**,
  not by the `line-height` class: a `text-xs` link with `py-1` comes out at
  23px, one pixel short of the rule.
- **The Supabase CLI is run through `npx`, not installed as a dependency.** The
  `supabase` npm package downloads a platform binary in its postinstall, and a
  devDependency would pull that into every `npm install` - including the Vercel
  build, where it is never used and could only slow a deploy down or break it.
  Verified against CLI 2.117.0. To pin the version instead, add it to
  `devDependencies` and drop the `npx` from the two `db:` scripts.
- **`supabase/config.toml` closes public sign-up** (`enable_signup = false`,
  spec 4.1). Accounts are created by the owner or an admin through Supabase's
  admin API, which that switch does not govern, so `/setup` and the Accounts
  screen are unaffected. Its password floor is 8 to match
  `MIN_PASSWORD_LENGTH`: if the two disagree, one accepts a password the other
  refuses and the person hitting it cannot tell which.
- **One loading outline serves every screen** (`src/app/(app)/loading.tsx`)
  rather than twenty-three tailored ones. Every screen in the system is a
  heading over a stack of cards, and bespoke outlines drift out of step with the
  screens they imitate. It also earns its keep twice over: without a loading
  boundary Next.js does not prefetch a dynamic screen at all, so adding the file
  is what lets a section be fetched as its link comes into view. If one screen
  ever needs its own, add a `loading.tsx` beside that page.
- **A screen already visited is reused for 30 seconds** when the person comes
  back to it (`staleTimes.dynamic` in `next.config.ts`). Every screen here is
  dynamic, and the default for those is zero - nothing kept at all - so darting
  between two sections while serving one customer re-fetched each of them from
  scratch every time. It cannot show a figure the shop itself just changed: a
  Server Action that writes anything calls `revalidatePath` for the screens it
  affects, which throws the held copy away. What the window can hold back is a
  change made on ANOTHER machine in the last half minute, and a screen sitting
  open is already staler than that. To turn it off, set `dynamic: 0`.
- **The system runs in Singapore (`sin1`), pinned in `vercel.json`.** Vercel's
  default is Washington, D.C., and the Supabase project is in Singapore
  (SETUP.md Part 1), so every database query was crossing the Pacific twice -
  read off the live deployment, which reported `"regions": ["iad1"]`. Cutting
  the NUMBER of round trips per screen only goes so far while each one is that
  long. It lives in the repository rather than in the Vercel dashboard so it
  is reviewable, and so re-importing the project cannot silently lose it. If
  the Supabase project ever moves region, change this to match - the two
  belong in the same place, whichever place that is.
- **Nobody may update their own profile row, and that stays true.** The fix for
  the sign-in loop (written up in [PHASES.md](PHASES.md)) could have been a "you may edit yourself" policy on
  `profiles`, and that would have been a mistake: a policy cannot say WHICH
  COLUMNS an update may touch, so a policy wide enough to let a staff member
  clear their own password flag is wide enough to let them set their own role
  to `admin`. Instead there is `finish_password_change()`, a `SECURITY DEFINER`
  function that takes no arguments, names no row but the caller's, and changes
  one boolean. Same shape as `unlock_payroll_week`: the table stays shut and
  there is one named way past it. If a person ever needs to change their own
  full name, add a second narrow function rather than opening the table.
- **The optional public details are listed, but never as a warning.** The owner
  asked for the email address and the map link to appear on the To fill in
  screen (21 Sep 2026); until then only the five details the page treats as
  expected were listed, and the screen could read "Nothing left to fill in"
  beside a public page giving a customer no way to email the shop and no way to
  find it. Both are now listed as their own item with `important: false`,
  rather than joining the five that carry the warning: those five are what a
  shop ought to have, these two are extras, and a warning that treats them
  alike is one that gets ignored. To change it, move the two fields into
  `missingPublicDetails` in `src/lib/data/checklist.ts` and they inherit the
  warning. Either way `src/lib/data/checklist.test.ts` now holds the public
  page and the checklist together, so the next field added to one cannot be
  forgotten in the other.
- **A failed read prints no peso figure at all.** The owner's production
  database was missing `0015`, so `public.collections` did not exist and every
  read of the feed failed. The screen printed **₱0.00** for the day and for
  each of the three doors in 4xl type, with the explanation in 12px grey
  underneath - and the owner spent a day believing the shop's takings had been
  wiped (21 Sep 2026). Two things were wrong and only one of them was the
  database. `#19` had already made a failed read carry `failed: true` and a ⚠,
  which was necessary and not sufficient: a big number beats a small warning,
  every time, so the warning lost. `figuresAreKnown()` now decides whether
  there is a NUMBER at all, separately from whether there is something to say.
  On a failed read the day reads "⚠ Could not be read" where the total goes and
  "Not known" per door, and the warning moves up to `text-sm`. A TRUNCATED read
  still shows its figures, because those are a floor - real money, just not all
  of it - and collapsing the two cases would hide money that was genuinely
  taken. The message also now says **"your takings are safe - nothing has been
  lost"**, which is true (a read touches no row) and is the sentence that was
  missing. To change it, `figuresAreKnown` in `src/lib/collections.ts`; the
  Sales screen and the Overview card both read it.
- **The system checks its own database, and says so before it shows a figure.**
  The missing `0015` cost a day because nothing in the system could say "this
  database is behind" - the only symptom was an empty till, and an empty till
  beside money reads as lost money. `npm run check:schema` could never have
  caught it: it builds a throwaway database from the migration files, so it
  proves the code agrees with the migrations and can know nothing about whether
  those migrations were ever applied. So there is now a runtime half:
  `src/lib/data/schema-health.ts` asks the live database, with one HEAD request
  per relation, which of them are actually there. Three choices inside it are
  the ones worth keeping. **A probe answers present, missing or UNKNOWN** - a
  timeout or a paused project is not evidence about the schema, and reporting
  it as missing would be this module committing the exact sin it was written to
  prevent. **The advice always names `0013`**, because the app cannot see which
  migrations are recorded and must assume the dangerous case is possible: a
  screen that says "run `npm run db:push`" to somebody who has never pushed is
  handing them an instruction that deletes every bill, loan and product.
  **Home probes one relation per migration, not all forty-four** - migrations
  are applied whole and in order, so that answers the question actually being
  asked at a quarter of the cost, and the full sweep is one tap away on
  **System check**. The banner is silent when everything is present, and
  silent when the check itself could not run: a warning that appears when
  nothing is wrong is the same mistake as a notification on a quiet morning.
  To change what is checked, `REQUIRED_RELATIONS` in
  `src/lib/schema-health.ts`; a test reads the migrations and fails if a new
  table is forgotten there.
- **The Sales screen no longer depends on the payments feed existing.** The
  same missing `0015` came back the same day: with `#24` deployed the screen
  stopped printing a phantom ₱0.00 and started saying "⚠ Could not be read" -
  honest, and still no use to an owner who wanted to see the morning's
  takings. Both of those changes improved what the screen SAID about a
  failure. Neither asked the better question, which is why a screen the whole
  shop looks at should fall over because a *convenience* is absent. The money
  was never in danger and never far away: it was in `sales`, one table from
  where the screen was looking. `public.collections` is a VIEW over `sales`,
  `apparel_payments` and `repair_payments` - it stores nothing, and it exists
  so one screen can ask one question instead of three. So when it cannot be
  read, the app now asks those three tables directly and shows the day
  (`rebuildCollections` in `src/lib/data/collections.ts`). **This opens
  nothing**, and that is the whole reason it is allowed: the view is
  `security_invoker`, so it holds no privilege of its own and every row it
  ever returned is a row those three tables' own policies would return to the
  same person anyway. It is the same question with the view taken out of the
  middle - no new policy, no service-role key, no `SECURITY DEFINER`.
  `12_phase10_rls.test.sql` now proves the equality rather than asserting it:
  it asks as five different people and requires the feed and the three tables
  to return the same rows, row for row, refusing to pass if nobody saw
  anything. Two details are deliberate. The apparel and repair joins are
  INNER, matching the view, so a payment whose order or ticket a person may
  not read stays invisible. And `repair_payments.kind` is **not** asked for,
  because `0015` adds that column too - naming it would fail the very read
  that is there to rescue the screen - so those rows read as a plain
  "Payment", the same answer the system already gives for a repair payment
  taken before Phase 10, and an honest one: in a database like this the kind
  genuinely is not recorded anywhere the query can reach. The figures print
  normally, because they are complete; underneath them a ⚠ says the database
  is behind and that other things will be missing too, with a link to System
  check for the Owner and Admin who can open it (`feedRebuiltNotice` in
  `src/lib/collections.ts`). **The fallback is a floor, not the fix.** The
  database still needs `0015`, and until it has one the counter cannot take a
  DabzTech payment and a closed day cannot remember its breakdown. To change
  it: delete `rebuildCollections` and the screens go back to "Could not be
  read" - which is truthful and shows nobody their money.
- **The apparel calendar plans against a date one day before the promised one,
  and carries unfinished work forward.** The owner asked for this on 21
  September 2026, and four things inside it were decided here rather than
  asked about. **The one-day lead is a constant, not a setting**
  (`PRODUCTION_LEAD_DAYS` in `src/lib/apparel-calendar.ts`): the owner stated
  the figure, so it is not one of the figures only they can know, and a setting
  would have meant a migration and a Settings field for a number nobody is
  waiting to change. To make it two days, change the constant — the tests read
  it rather than hard-coding one, so nothing else needs touching. **"Finished"
  means Ready for pickup or Released**, because whether the customer has
  collected the jerseys is a different question from whether the shop still
  owes anybody work; if the owner wants a job to keep appearing until it is
  collected, that is `isProductionDone` and one line. **Carried-forward work
  lands on today, not on the day after the one it missed.** Read literally the
  rule says "put it in the next day", and that is exactly what happens — every
  day, until it is done, which is why a job three days late is on today. A job
  left sitting on the square it missed would be on a day nobody can act on any
  more, and by the end of a busy week the calendar would be a record of the
  past rather than a plan. **Nothing is stored**: no table, no column, no
  nightly job that moves orders along, and no migration at all. The schedule is
  worked out from each order's own promised date and status every time the
  screen is opened, the same choice Phase 8 made for reports. A stored
  "scheduled day" and a promised date can disagree, and then nothing says which
  is lying — and a nightly job would mean a shop that was closed on Tuesday
  came back on Wednesday to find Tuesday's work had never been carried forward.
  The cost is one pass over the orders per visit; the benefit is that the
  calendar cannot fall out of step with the orders it is drawn from. A job with
  **no promised date gets no square** and is listed underneath instead: a date
  invented on a production calendar is worked to, and the customer was never
  told it. The calendar also became the first section that lives *inside*
  another one, so the sidebar now marks the longest matching link as the
  current page rather than every link that matches — without it, opening the
  calendar lit up **Apparel** and **Apparel calendar** at once.
- **A second action that must not be missed gets the accent as a frame, not as
  a fill** (`feature` in `src/components/ui.tsx`). The project calendar shipped
  with a text link for its way in and the owner could not find it, which is the
  Phase 2 Disclosure lesson again: a way in has to look like one. The rule that
  red is reserved for the main action still holds — two filled red buttons on a
  screen leave neither meaning anything — so this tints the background and
  draws the outline in the accent while leaving the label at full contrast.
  That last part came out of a measurement, not a preference: written the
  obvious way, as accent text on an accent tint, it is 3.06:1 against the dark
  surface, and dark is the default look. The label is `text-ink` instead, at
  15.72:1. To make something else prominent without it becoming a second
  primary, this is the variant to reach for.
- **The calendar is called "Project calendar", and its way in carries the
  count.** The owner's word for an apparel job order is a project, and
  "Apparel calendar" read as a corner of the Apparel screen rather than as its
  own screen. It stays in the **Daily** group beside Apparel rather than moving
  to another one: it is opened every morning and it is the same orders, and a
  group heading with one link under it would look like a mistake. The band sits
  ABOVE the three summary cards because on a phone those cards pushed it a
  screenful down, and what is due off the bench today is more use first thing
  than what is still owed in total. The line beside the button is counts
  (`summariseProjects`), never reassurance: with no promised dates entered it
  says nobody has set any, rather than implying nothing is due.
- **A settings column the database has not got is dropped, and the rest of the
  form is saved.** Decided on 21 September 2026, when the owner could not save
  Settings at all because `0014` had never reached the production database and
  the form writes every column in one statement. The alternative — the previous
  behaviour — was to refuse the whole screen, which is honest but throws away
  work the database would happily have taken. Three things keep the new
  behaviour from being the silent kind of wrong. It is **said out loud**: a ⚠
  beside the success notice names the setting in the words on the form and says
  what to run. Only columns **added to `app_settings` after `0001`** may be
  dropped, each of which has a database default, so leaving one out changes
  nothing; anything else still fails loudly, because that is a broken database
  rather than a behind one. And the **audit log records what reached the
  database**, not what was asked for. To change it: delete `saveSettingsRow` in
  `src/lib/settings.ts` and the action goes back to refusing the whole form.
- **The System check screen asks after one column per table per migration, not
  every column.** Migrations `0005`, `0007`, `0009`, `0014` and `0015` add
  columns to tables that already existed, and `0014` adds nothing else at all —
  so before this the screen reported "the database has everything the system
  needs" while Settings could not save a field. Probing every column would be
  twenty-three more round trips for no more information, because a migration is
  applied whole: that is the same bet the home-screen sentinels already rest on.
  To change it: add entries to `REQUIRED_COLUMNS` in `src/lib/schema-health.ts`;
  the guard test requires one per (table, migration) pair and accepts more.
- **A migration that only changes security rules, or only clears rows, is still
  invisible to the System check screen** — `0004`, `0010`, `0011`, `0012`,
  `0013` and `0017` among them. A policy has no cheap runtime probe the way a
  table or a column does, and inventing one would mean the screen asserting
  something it cannot actually check. So the screen says so instead, under
  "What this does not check". To change it: the honest version is to read
  `supabase_migrations.schema_migrations` directly and compare it with the
  files, which would answer the whole question at once and need a route that
  can see that schema.
