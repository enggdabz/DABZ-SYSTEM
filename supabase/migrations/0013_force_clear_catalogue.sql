-- Finish the job 0011 and 0012 started: clear the lists completely.
--
-- Those two cleared every row that nothing had happened to, and deliberately
-- KEPT any bill that had been marked paid, any loan with a payment recorded
-- against it, and any product, apparel item or repair service already used on
-- a real job. That is the right default - deleting one takes its payment rows
-- with it - and it is why the owner still sees bills and loan amounts after
-- running them.
--
-- The owner has asked for those gone too (19 Sep 2026): the figures were
-- entered while trying the system out, not while running the shop, so there is
-- no history worth keeping. This removes them and everything they created.
--
-- WHAT THIS DESTROYS, said plainly, because it cannot be undone:
--
--   * every bill and every loan, including their payment history;
--   * every ledger entry those payments wrote - the money-out rows on the
--     Money in/out screen that said a bill was paid or a loan paid down;
--   * every product, apparel item and repair service.
--
-- The ledger entries have to go WITH the payments, not be left behind. A
-- money-out row saying "Electricity for September" pointing at a bill that no
-- longer exists is worse than either keeping both or removing both: the books
-- would show money leaving for something the system cannot explain, and the
-- monthly expense totals would still count it.
--
-- WHAT THIS DOES NOT TOUCH, on purpose:
--
--   * sales, job orders and repair tickets. A customer may be holding the
--     receipt or the job order sheet, and the owner asked about the bills and
--     the loan amounts, not about the shop's takings. A sale line whose
--     product is deleted keeps its own copy of the name, so an old receipt
--     still reads correctly (`on delete set null`).
--   * the audit log, which is append-only by design and is now the only record
--     that any of this existed.
--   * the apparel size ladder, for the reason given in 0012.
--
-- If a starter list is ever wanted again, add a new migration that inserts it.
-- Never edit 0002, 0005, 0007 or 0008.

do $$
declare
  v_ledger integer;
  v_bill_payments integer;
  v_loan_payments integer;
  v_bills integer;
  v_loans integer;
  v_products integer;
  v_apparel integer;
  v_services integer;
begin
  /*
    The ledger first, while the payments that point at it still exist.

    Two passes, because there are two ways an entry can relate to a payment.
    The first follows `ledger_entry_id` from the payment rows - the exact link
    written by mark_bill_paid and by recording a loan payment. The second
    sweeps up entries whose payment row is already gone: undoing a bill payment
    VOIDS its ledger entry and deletes the payment, so a voided entry can
    outlive the thing it describes.
  */
  delete from public.ledger_entries e
   where e.id in (
     select bp.ledger_entry_id from public.bill_payments bp
      where bp.ledger_entry_id is not null
     union
     select lp.ledger_entry_id from public.loan_payments lp
      where lp.ledger_entry_id is not null
   )
      or e.source_table in ('bill_payments', 'loan_payments');
  get diagnostics v_ledger = row_count;

  select count(*) into v_bill_payments from public.bill_payments;
  select count(*) into v_loan_payments from public.loan_payments;

  -- Both payment tables cascade from their parents, so deleting the bills and
  -- the loans takes them. Counted above so the notice can say how many went.
  delete from public.bills;
  get diagnostics v_bills = row_count;

  delete from public.loans;
  get diagnostics v_loans = row_count;

  -- The three catalogue lists, this time with no history check at all.
  -- `product_price_tiers` cascades with its product; a sale line keeps its own
  -- copy of the name and simply loses the link.
  delete from public.products;
  get diagnostics v_products = row_count;

  delete from public.apparel_products;
  get diagnostics v_apparel = row_count;

  delete from public.repair_services;
  get diagnostics v_services = row_count;

  raise notice 'Cleared % bill(s) and % loan(s), with % bill payment(s), % loan payment(s) and % ledger entr(ies) they had written.',
    v_bills, v_loans, v_bill_payments, v_loan_payments, v_ledger;
  raise notice 'Cleared % product(s), % apparel item(s) and % repair service(s).',
    v_products, v_apparel, v_services;
  raise notice 'Sales, job orders, repair tickets and the audit log were not touched.';
end;
$$;

-- Nothing here adds a function, so PostgREST has nothing new to learn. The
-- reload is harmless and keeps the habit: every migration that could change
-- what the API serves ends with one.
notify pgrst, 'reload schema';
