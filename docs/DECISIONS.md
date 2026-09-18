# Decisions

Section 17 of the specification lists what still needs the owner's answer. I ask
for each one **before the phase that needs it**, rather than all at once.

## Answered

| # | Question | Answer | Date |
|---|---|---|---|
| 17.1 | Technology and hosting | **Approved:** Next.js + TypeScript + Supabase + Vercel, as in spec section 2 | 18 Sep 2026 |
| 17.4 | Default theme | **Dark mode**, with a light/dark switch available | 18 Sep 2026 |

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

## Needed for Phase 2 — Bills, loans, ledger

| # | Question |
|---|---|
| 17.13 | **Due day of the month for each of the 11 bills.** Interest rates from the statements, especially Credit card 3. The remaining ~₱660,000 of debt. And what "Magic Payment" and "Forests Lake" are, so they land in the right category |
| — | The prototype "Dabz Shop Manager" — are any bills already marked paid for this month, and do the amounts in spec 12.1 still match? |
| 12.3 | Estimated monthly payroll for the daily target: sum of each staff's daily rate × typical working days, or recent actual payroll? |

## Needed for Phase 3 — Staff and payroll

| # | Question |
|---|---|
| 17.6 | **Half days:** half the daily rate, or a manual amount each time? |

## Needed for Phase 4 — POS and receipts

| # | Question |
|---|---|
| 17.3 | **Receipt printer:** thermal (58mm or 80mm) or a regular printer on short bond paper? And are one-colour black logo files available for printing? |
| 17.9 | **Printshoppe prices:** what each colour tier (₱5 / ₱8 / ₱10 / ₱15) is for; lamination, sticker and other product prices; and the bulk discount rules |
| 17.12 | **Payment methods:** Cash, GCash and Bank are in. Also Maya, or anything else? |

## Needed for Phase 5 — Expenses and stocks

| # | Question |
|---|---|
| 17.14 | **Quick-pick expenses:** your most frequent purchases, and the usual suppliers |
| 17.15 | **Starting stock items:** the main materials, their units, reorder levels and costs |

## Needed for Phase 6 — Dabz Apparel

| # | Question |
|---|---|
| 17.10 | **Apparel pricing:** price per jersey set / shirt / jacket / long sleeves; size add-ons (2XL and up); fabric and collar options; down payment policy (e.g. 50%); DTF print prices |

## Needed for Phase 7 — DabzTech

| # | Question |
|---|---|
| 17.11 | **DabzTech prices:** checking fee; common repair prices; do laptop and desktop cost the same for the same service? Warranty period (default 30 days); and what to do with units left unclaimed |

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
- Money is never hard-deleted by staff; corrections go through voids and
  adjustments with a reason (spec 2.1).
