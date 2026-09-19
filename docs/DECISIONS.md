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

---

## Assumptions I am working under

Where the spec gives a default, I use it and note it here rather than stopping
to ask:

- Week runs **Monday–Sunday** (spec 2.1) — changeable in settings.
- **26 working days** per month for the daily target (spec 12.3).
- Warranty period **30 days** (spec 9.3).
- Unclaimed units flagged at **30 days** (spec 9.4).
- Auto-logout after **15 minutes** idle (spec 4.1).
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
