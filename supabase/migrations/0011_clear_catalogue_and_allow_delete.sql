-- Phase 2/4 follow-up: the owner enters the catalogue themselves.
--
-- Two things happen here, and they belong together.
--
-- 1. The owner asked to start the products, the bills and the loans from
--    empty and type in their own. So the rows seeded by 0002 and 0005 are
--    deleted at the bottom of this file. Those migrations are already applied
--    and must never be edited, so this is the way to undo them: a later
--    migration that removes what an earlier one put there. On a database built
--    from scratch the seeds go in and come straight back out again, which
--    costs nothing and means a fresh install and the shop's real database end
--    up in the same state - empty, waiting for the owner.
--
-- 2. Starting from empty is only bearable if a row typed wrongly can be taken
--    back out. Until now bills and loans could only be STOPPED: the row stayed
--    on the screen under "no longer counted", which is right for a bill the
--    shop really paid for two years and wrong for one that was a typo five
--    seconds ago. So this adds a delete - with a hard limit.
--
-- The limit is the point. A bill that has been marked paid, a loan that has
-- been paid down, a product that has been sold: those have money behind them,
-- and the foreign keys are `on delete cascade`, so deleting one would take its
-- payment rows with it and leave the ledger pointing at a payment that no
-- longer exists. That is exactly the silent hole the void rules exist to stop.
--
-- So: a row with NO history may be deleted, and a row with history may only be
-- stopped. The screens say which is which, and the policies below refuse the
-- rest - not the Server Action, which is only a button, but the database.

-- ---------------------------------------------------------------------------
-- "Has this row got history?"
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER on purpose. A policy sub-query is subject to Row Level
-- Security too, and the failure here runs the DANGEROUS way: if the sub-query
-- silently came back empty, `not exists` would be TRUE and the delete would be
-- allowed on the very row the rule is meant to protect. Reading the payment
-- tables as the definer removes that possibility. Each one takes an id and
-- answers a boolean; none of them can leak a row.

create or replace function public.bill_has_history(p_bill_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.bill_payments where bill_id = p_bill_id
  );
$$;

comment on function public.bill_has_history is
  'True once a bill has been marked paid in any month. Such a bill is stopped, never deleted.';

create or replace function public.loan_has_history(p_loan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.loan_payments where loan_id = p_loan_id
  );
$$;

comment on function public.loan_has_history is
  'True once a payment has been recorded against a loan. Such a loan is stopped, never deleted.';

create or replace function public.product_has_history(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sale_lines where product_id = p_product_id
  );
$$;

comment on function public.product_has_history is
  'True once a product has been sold. Such a product is hidden from the counter, never deleted.';

-- The app asks these three the same questions before it offers a Delete
-- button, so the screen and the database agree about what may go.
grant execute on function public.bill_has_history(uuid) to authenticated;
grant execute on function public.loan_has_history(uuid) to authenticated;
grant execute on function public.product_has_history(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The same question for a whole screen at once
-- ---------------------------------------------------------------------------
-- A screen shows every bill, every loan or every product, and needs to know
-- for each one whether to offer Delete or explain that it can only be stopped.
-- Asking row by row would be one round trip per card - the shop's database is
-- in Singapore and every one of those is real time at the counter - so each of
-- these answers for the whole list in a single call.
--
-- SECURITY INVOKER (the default), unlike the three above: this returns a LIST
-- rather than a yes/no about a row the caller already named, so Row Level
-- Security has to stay in force. A caller who cannot see the payments gets a
-- short list, offers a Delete the policy then refuses, and is told so - which
-- is the safe direction to be wrong in.

create or replace function public.bills_with_payments()
returns table (bill_id uuid)
language sql
stable
set search_path = public, pg_temp
as $$
  select distinct bp.bill_id from public.bill_payments bp;
$$;

comment on function public.bills_with_payments is
  'Every bill that has been marked paid at least once. Those are stopped, never deleted.';

create or replace function public.loans_with_payments()
returns table (loan_id uuid)
language sql
stable
set search_path = public, pg_temp
as $$
  select distinct lp.loan_id from public.loan_payments lp;
$$;

comment on function public.loans_with_payments is
  'Every loan with a payment recorded against it. Those are stopped, never deleted.';

create or replace function public.products_with_sales()
returns table (product_id uuid)
language sql
stable
set search_path = public, pg_temp
as $$
  select distinct sl.product_id
    from public.sale_lines sl
   where sl.product_id is not null;
$$;

comment on function public.products_with_sales is
  'Every product that has been sold. Those are hidden from the counter, never deleted.';

grant execute on function public.bills_with_payments() to authenticated;
grant execute on function public.loans_with_payments() to authenticated;
grant execute on function public.products_with_sales() to authenticated;

-- ---------------------------------------------------------------------------
-- Delete policies
-- ---------------------------------------------------------------------------
-- Owner/Admin only, exactly as with everything else on these three tables, and
-- only while there is nothing behind the row.
--
-- Worth knowing before changing these: a DELETE whose `using` clause does not
-- match deletes NOTHING and raises NO error. The Server Actions therefore ask
-- for the deleted row back and treat an empty answer as a refusal, rather than
-- telling the owner something was removed when it was not.

drop policy if exists bills_owner_admin_delete on public.bills;
create policy bills_owner_admin_delete on public.bills
  for delete using (
    public.is_owner_or_admin()
    and not public.bill_has_history(id)
  );

drop policy if exists loans_owner_admin_delete on public.loans;
create policy loans_owner_admin_delete on public.loans
  for delete using (
    public.is_owner_or_admin()
    and not public.loan_has_history(id)
  );

-- Products already had a delete policy (0005). It is narrowed the same way:
-- `sale_lines.product_id` is `on delete set null` and the line keeps its own
-- copy of the name, so an old receipt would survive - but the Sales screen
-- would lose the link back, and a product that has been sold is shop history
-- whether or not a receipt still reads correctly.
drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete using (
    public.is_owner_or_admin()
    and not public.product_has_history(id)
  );

-- ---------------------------------------------------------------------------
-- Clear the catalogue the owner did not type
-- ---------------------------------------------------------------------------
-- Runs as the migration role, which is not subject to the policies above, so
-- the same "no history" rule is written into the statements themselves. A
-- seeded row the shop has already used is real now: it is left alone, and the
-- notice says so, rather than quietly taking a payment history with it.
--
-- These are unqualified deletes on purpose - the owner asked for all three
-- lists emptied, not for eleven names matched one by one, and matching by name
-- would miss anything they had already renamed.

do $$
declare
  v_deleted integer;
  v_kept integer;
begin
  delete from public.products p where not public.product_has_history(p.id);
  get diagnostics v_deleted = row_count;
  select count(*) into v_kept from public.products;
  raise notice 'Cleared % product(s); % kept because they have already been sold.',
    v_deleted, v_kept;

  -- Bills before loans: an installment bill points at a loan, so clearing the
  -- bills first leaves the loans free of anything referring to them. (The key
  -- is `on delete set null`, so the order is tidiness rather than necessity.)
  delete from public.bills b where not public.bill_has_history(b.id);
  get diagnostics v_deleted = row_count;
  select count(*) into v_kept from public.bills;
  raise notice 'Cleared % bill(s); % kept because they have already been marked paid.',
    v_deleted, v_kept;

  delete from public.loans l where not public.loan_has_history(l.id);
  get diagnostics v_deleted = row_count;
  select count(*) into v_kept from public.loans;
  raise notice 'Cleared % loan(s); % kept because payments have been recorded against them.',
    v_deleted, v_kept;
end;
$$;
