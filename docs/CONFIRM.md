# Confirming what has been built

Seven phases are finished and **waiting on you to confirm they work** — 4, 5, 6,
7, 8, 9 and 10. Until they are confirmed the build plan says the next phase does
not start, so this page exists to make confirming them a job you can actually
finish rather than a vague one you keep putting off.

Each phase's full write-up lives in [PHASES.md](PHASES.md). This is only the
checking part, pulled into one place and put in order.

**It should take about an hour.** Do it in one sitting if you can, because the
phases build on each other — the sale you ring up in Phase 4 is the one you
look for in Phase 8's report.

---

## Before you start: once, for all of them

```bash
git pull
npm install
npm run db:push     # applies all 16 migrations, in order
npm test            # expect: 592 passed
npm run dev
```

Two notes, because the older instructions in PHASES.md say otherwise and were
written before these were true:

- **`npm run db:push` replaces pasting SQL into the Supabase editor.** Each
  phase's own write-up tells you to run one migration by hand in the SQL
  editor. That was right at the time; it is not now. `db:push` applies every
  migration in order and records each one, so none can run twice.
- **Ignore the per-phase test counts in PHASES.md.** Each says what was true on
  the day it was written — 234, 270, 339, and so on. There is one number now
  and it is **592**. A phase that says "expect: 270 passed" is not broken.

If `npm test` does not say 592, stop and tell me before going further. Nothing
below is worth checking against a broken build.

---

## How to use this page

Work down it. After each phase, tick it off here or just tell me "4 to 7 are
good" — what I need is the phases you have actually exercised, so the build
plan stops saying *waiting on owner to confirm*.

**If something is wrong, stop at that phase and tell me what you saw.** Do not
work around it. A phase that half works is worth more to me as a precise
complaint than as a tick.

- [ ] Phase 4 — Counter and customers
- [ ] Phase 5 — Expenses, stocks, supplier payables
- [ ] Phase 6 — Dabz Apparel job orders
- [ ] Phase 7 — DabzTech repair tickets
- [ ] Phase 8 — Reports
- [ ] Phase 9 — The public page and customer messages
- [ ] Phase 10 — One counter, all three divisions

---

## Phase 4 — Counter and customers

1. Open **Counter**. Tap *Print, black & white*, enter 12, add it. Tap
   *Print, colored - full page*, enter 3. Use the tarpaulin calculator for
   3 × 5 ft and add that. The subtotal should read **₱531.00**.
2. Give 10% discount → **₱477.90**. Enter ₱500 given → change **₱22.10**.
3. Complete the sale, print the receipt, and **check the arithmetic by hand**.
   That is the whole point of it adding up its own rows.
4. Open **Money in/out**: the takings are already there, split by division.
5. Sign in as a staff member without the void permission, ring up a sale, and
   try to undo it — you should only be able to *ask*. Approve it as yourself
   and check the takings disappear from the day.
6. Open **End of day**, count the drawer, and see the difference.
7. Set a price for **Lamination** on Products and watch it become a fixed
   button.

> **Your Products list starts empty, and that is correct** — you asked for the
> seeded catalogue to be cleared on 19 September. So step 1 needs two buttons
> before the ₱531.00 will appear. Add them on **Products**:
>
> | Product | Price |
> |---|---|
> | Print, black & white | ₱3.00 |
> | Print, colored - full page | ₱15.00 |
>
> That gives 12 × ₱3.00 = ₱36.00, plus 3 × ₱15.00 = ₱45.00, plus the tarpaulin
> at 15 sq ft × ₱30.00 = ₱450.00 — **₱531.00**. The tarpaulin rate is in the
> code, not a product, so the calculator works whatever your list looks like.
>
> If you would rather use your own real prices, do — just work the total out
> yourself and check the screen agrees. What is being tested is the arithmetic
> and the discount, not these particular numbers.

---

## Phase 5 — Expenses, stocks, supplier payables

1. Press **+ Expense** in the top bar. Tap **Meals & snacks**, type an amount,
   press Record expense. It should take about five seconds.
2. Open **Money in/out** and confirm the entry is there.
3. Open **Stocks** and add a material — Bond paper A4, counted in reams. Leave
   the reorder level and price empty for now.
4. Press **Received**, enter 20 and a price, leave it on "Paid now". Check
   **Money in/out**: the purchase is there. Check **Stocks**: 20 reams.
5. Press **Received** again, choose **On account**, and look at **Owed to
   suppliers**.
6. Press **Counted the shelf** and type a **smaller** number than it shows. The
   difference is recorded as its own movement rather than quietly overwriting
   the level — so the loss stays visible.
7. Set a reorder level above what is on the shelf and confirm the warning
   appears on the Overview.
8. Sign in as a staff member with **Record expenses** ticked, record something
   above the limit in Settings, then sign back in as yourself: it is waiting on
   the Expenses screen, and **not** yet in Money in/out.

---

## Phase 6 — Dabz Apparel job orders

1. Open **Apparel** → **New job order**. Give it a team name.
2. **Add an item**, choose Sublimation jersey set, and type a price — it will
   ask, because nothing is priced yet.
3. **Add names and sizes** and paste a few lines:
   `Dela Cruz, 7, M` / `Santos, 23, 2XL`. The total follows the names.
4. Open **Apparel → Set the apparel prices**, give 2XL an add-on, then go back:
   the order you already wrote is **unchanged**. Add one more name and it picks
   the new add-on up. *(This is the rule that stops a price rise rewriting a
   quote the customer already agreed to.)*
5. **Take a payment** for part of the total, and check **Money in/out**: the
   takings are there, tagged to Dabz Apparel.
6. **Print the job order** and check the name list and the arithmetic.
7. Move it to **Released** while a balance is still owed — it says so, and
   stays on the list rather than disappearing.

> **Your apparel item list starts empty too** (cleared by `0013`, as you
> asked). Before step 2, open **Apparel → Set the apparel prices** and add one
> item — call it *Sublimation jersey set* and leave the price blank. Leaving it
> blank is the point of step 2: the order form asks you for the price instead
> of guessing one. The nine sizes XS–5XL are already there; only their add-ons
> are empty.

---

## Phase 7 — DabzTech repair tickets

1. Open **Repairs** → **Take a unit in**. Note there is **nowhere to type a
   password** — the question is *how do we get into it*, and the answers are
   fixed.
2. Add the checking fee and a service. It will ask for the price.
3. **Fit a part**, choose something from stock, and check **Stocks**: the shelf
   went down by what you fitted.
4. Take a payment, then look at **Money in/out**: split across the fee, the
   work and the part, all tagged to DabzTech.
5. Move it to **Ready**, then **Release** it. The warranty is written onto the
   ticket.
6. Change the warranty in **Settings** to 7 days and go back: the released
   ticket **still says 30**. Release another and it gets 7.
7. **Print the claim stub** and read the last box on it.

> **Your repair service list starts empty too.** Before step 2, open **Repairs
> → Set the repair prices** and add two: a *Checking fee* with the
> **"this is the checking fee" box ticked**, and any service. Leave both prices
> blank — the ticket will ask. The ticking matters: without it nothing is
> charged when a customer decides not to go ahead, and **To fill in** will say
> so.
>
> Step 6 assumes the warranty is still on its default of **30 days**. If you
> have already changed it in Settings, use your number and the one you change
> it to — what is being tested is that the released ticket keeps the promise it
> was given, not the number 30.

---

## Phase 8 — Reports

No migration of its own — reports read what the phases above already wrote.

1. Open **Reports**. It starts on this month.
2. Try **Last month** and **This year** — the comparison line under each figure
   changes with the period.
3. Check that borrowed money is in its own box and **not** in the profit.
4. **Download as a spreadsheet** and open the file. The amounts should be
   numbers your spreadsheet can add up, not text.
5. **Print** and check the sheet against the screen — same sums, same figures.

---

## Phase 9 — The public page and customer messages

1. Open **Settings → Your public page** and fill in your address, phone,
   opening hours, Facebook page and Messenger name. Save.
2. Open **/** signed out (a private window). Your details are there, the prices
   are the ones on your Products screen, and **Message us on Facebook** opens
   Messenger.
3. Clear one of those fields and load the page again — it **disappears** rather
   than being replaced by a placeholder. Check **To fill in**: it is listed
   there.
4. Send yourself a message from the form.
5. Sign in and open **Messages**. It is waiting, and the Overview says so.
   **Answer this**, write what you told them, **Mark replied**.
6. Sign in as a staff member. **Messages** is not in their menu, and opening
   `/enquiries` by hand sends them back to the Overview.
7. Untick **Show the public page** in Settings and load **/** again: a short
   honest page, and staff sign-in still works.

---

## Phase 10 — One counter, all three divisions

1. Ring up a **₱30 print sale in cash**.
2. Create an **Apparel job order**. Then, from the **Counter**, press *Take
   payment for an order*, find it, and take a **₱500 GCash down payment**.
   **Print payment receipt** — the slip should say ₱0.00 paid before, ₱500.00
   this payment, and the balance left.
3. Create a **DabzTech ticket**, and again from the **Counter** take a **₱200
   cash down payment**.
4. Open **Sales**. All three rows are there, the filters work, and the total is
   **₱730.00** — Counter ₱30, Apparel ₱500, DabzTech ₱200.
5. Open **End of day**. **Cash collected ₱230.00** (₱30 counter + ₱200
   DabzTech), and ₱500 under Apparel in the GCash column, marked a down
   payment.
6. As the owner, open the job order and **void the ₱500 down payment**. Sales,
   End of day, Home and Reports all drop by ₱500 **together**. The voided row
   is still on the Sales list, struck through; open its receipt and it now says
   VOIDED and adds nothing.
7. Sign in as a staff member with **only Add sales**. The *Take payment for an
   order* button is **not there**, and Sales shows counter rows only — with a
   ⚠ line saying part of the day is not shown to them.

---

## The one check nobody has done yet

**Phase 10 at four screen widths: 390, 768, 1024 and 1440.** It could not be
done here, because the signed-in screens need a real Supabase project. Two
things need your eyes, because no test can see either:

- The **Take payment for an order** dialog on the Counter. Open it on a phone.
  It should cover the screen properly and not hang off the top.
- The **breakdown table** on End of day. At 390px it should be a stack of cards,
  one per division; from tablet width up, a real table.

Everything else in Phase 10 is covered by the 592 unit tests and the 301
security checks.

---

## When you are done

Tell me which phases passed. I will mark them in the build plan, and then the
next phase can start — the plan's own first line is *"a phase does not start
until the owner has confirmed the previous one works."*

If any of them failed, tell me what you saw and I will fix that before anything
new is built.
