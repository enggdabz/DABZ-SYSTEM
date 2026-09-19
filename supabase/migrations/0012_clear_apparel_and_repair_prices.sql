-- The apparel and repair price lists are the owner's to enter too.
--
-- The companion to 0011, which cleared the bills, the loans and the counter
-- buttons. Phase 6 seeded five apparel items and Phase 7 seeded twelve repair
-- services, taken from the specification's own description of what the shop
-- does. No PRICE was ever invented for any of them - that was already the
-- rule - but the owner asked for the lists themselves to start empty as well,
-- so they are removed here and the same delete rule as 0011 is applied.
--
-- WHAT IS NOT CLEARED, and why
--
-- `apparel_size_prices` stays. Those nine rows are not a price list: they are
-- the size ladder XS to 5XL, which matches `APPAREL_SIZES` in
-- `src/lib/apparel.ts` and is where a per-size surcharge is TYPED IN. Every
-- surcharge on them is already null, so there is nothing there the owner did
-- not enter, and deleting the rows would take away the only place to enter
-- one - the screen edits those rows and has no "add a size" form, because the
-- ladder comes from the code.
--
-- `apparel_options` (fabrics and collars) was never seeded at all.

-- ---------------------------------------------------------------------------
-- First: close a gap 0011 left open
-- ---------------------------------------------------------------------------
-- 0011's three helpers are SECURITY DEFINER, which is right - a policy's own
-- sub-query is subject to Row Level Security, and an empty answer there would
-- ALLOW a delete rather than refuse it. But they were also granted to every
-- signed-in account with no check of their own, and PostgREST publishes each
-- one as a URL. Spec 4.3 gives staff no policy on bills and loans at all, "not
-- even read", so a staff account being able to ask "has this bill ever been
-- paid?" - one bit, but about a table they cannot see - contradicts the rule.
--
-- Exploiting it needs a bill or loan id, which staff have no way to obtain in
-- the app, so this is hardening rather than a leak being closed. The fix is
-- the pattern `complete_sale` already uses: the function checks the caller
-- itself. `create or replace` because 0011 may already have been applied.
--
-- Returning null rather than raising: the answer to "may I delete this" for
-- someone who may not is simply not knowable, and the delete policy refuses
-- them anyway. The app treats anything but `true` as "no history", which is
-- the safe direction - it offers a Delete that the policy then turns down.

create or replace function public.bill_has_history(p_bill_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when public.is_owner_or_admin() then exists (
    select 1 from public.bill_payments where bill_id = p_bill_id
  ) end;
$$;

create or replace function public.loan_has_history(p_loan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when public.is_owner_or_admin() then exists (
    select 1 from public.loan_payments where loan_id = p_loan_id
  ) end;
$$;

-- Products are different: every signed-in person may read them (the counter
-- needs to), so who has bought one is not hidden from staff the way the books
-- are. It is narrowed to Owner/Admin anyway, because only they can delete one,
-- and a function nobody else has a use for should not answer anybody else.
create or replace function public.product_has_history(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when public.is_owner_or_admin() then exists (
    select 1 from public.sale_lines where product_id = p_product_id
  ) end;
$$;

-- ---------------------------------------------------------------------------
-- "Has this row got history?"
-- ---------------------------------------------------------------------------
-- The same shape, and the same reasoning, as the three helpers in 0011:
-- SECURITY DEFINER because the policy's own sub-query would otherwise be
-- subject to Row Level Security, and an empty answer there would ALLOW the
-- delete rather than refuse it.
--
-- What counts as history is a line on a real job. Both foreign keys are
-- `on delete set null` and both lines copy the name, so an old job order or
-- ticket would survive the deletion intact - but it would lose the link back
-- to what it was charging for, and an item the shop has actually made is part
-- of its history. Those are stopped ("not offered"), not deleted.

create or replace function public.apparel_product_has_history(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when public.is_owner_or_admin() then exists (
    select 1 from public.apparel_order_lines where apparel_product_id = p_product_id
  ) end;
$$;

comment on function public.apparel_product_has_history is
  'True once an apparel item has been put on a job order. Those are stopped, never deleted.';

create or replace function public.repair_service_has_history(p_service_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when public.is_owner_or_admin() then exists (
    select 1 from public.repair_lines where repair_service_id = p_service_id
  ) end;
$$;

comment on function public.repair_service_has_history is
  'True once a repair service has been charged on a ticket. Those are stopped, never deleted.';

grant execute on function public.apparel_product_has_history(uuid) to authenticated;
grant execute on function public.repair_service_has_history(uuid) to authenticated;

-- The whole-list versions, so a screen asks once rather than once per row.
-- SECURITY INVOKER (the default), for the reason given in 0011: a list has to
-- stay inside Row Level Security, and a caller who sees less than everything
-- offers a Delete that the policy then refuses and explains.

create or replace function public.apparel_products_with_orders()
returns table (apparel_product_id uuid)
language sql
stable
set search_path = public, pg_temp
as $$
  select distinct l.apparel_product_id
    from public.apparel_order_lines l
   where l.apparel_product_id is not null;
$$;

comment on function public.apparel_products_with_orders is
  'Every apparel item that has been put on a job order.';

create or replace function public.repair_services_with_tickets()
returns table (repair_service_id uuid)
language sql
stable
set search_path = public, pg_temp
as $$
  select distinct l.repair_service_id
    from public.repair_lines l
   where l.repair_service_id is not null;
$$;

comment on function public.repair_services_with_tickets is
  'Every repair service that has been charged on a ticket.';

grant execute on function public.apparel_products_with_orders() to authenticated;
grant execute on function public.repair_services_with_tickets() to authenticated;

-- ---------------------------------------------------------------------------
-- Delete policies
-- ---------------------------------------------------------------------------
-- Both tables had a single `for all` policy, which covers DELETE with no
-- condition at all. Two permissive policies are OR'd together, so a guarded
-- delete policy added beside it would have changed nothing - the open one
-- would still have allowed everything. The `for all` is therefore REPLACED by
-- the three narrower ones it was standing in for.

drop policy if exists apparel_products_write on public.apparel_products;

drop policy if exists apparel_products_insert on public.apparel_products;
create policy apparel_products_insert on public.apparel_products
  for insert with check (public.is_owner_or_admin());

drop policy if exists apparel_products_update on public.apparel_products;
create policy apparel_products_update on public.apparel_products
  for update
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

drop policy if exists apparel_products_delete on public.apparel_products;
create policy apparel_products_delete on public.apparel_products
  for delete using (
    public.is_owner_or_admin()
    and not public.apparel_product_has_history(id)
  );

drop policy if exists repair_services_write on public.repair_services;

drop policy if exists repair_services_insert on public.repair_services;
create policy repair_services_insert on public.repair_services
  for insert with check (public.is_owner_or_admin());

drop policy if exists repair_services_update on public.repair_services;
create policy repair_services_update on public.repair_services
  for update
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

drop policy if exists repair_services_delete on public.repair_services;
create policy repair_services_delete on public.repair_services
  for delete using (
    public.is_owner_or_admin()
    and not public.repair_service_has_history(id)
  );

-- ---------------------------------------------------------------------------
-- The checking fee has to be nameable again
-- ---------------------------------------------------------------------------
-- `is_checking_fee` marks the one charge that applies even when the customer
-- says no (spec 9.2). It arrived on a seeded row and the price form never had
-- a control for it, so once that row is deleted below there would have been no
-- way to have a checking fee at all - the ticket totals would simply have
-- stopped separating it out. The form gains a checkbox; this makes sure the
-- flag can only ever be on ONE row, because the app asks for "the" checking
-- fee and two would make the answer arbitrary.

create unique index if not exists repair_services_one_checking_fee
  on public.repair_services ((true))
  where is_checking_fee;

comment on index public.repair_services_one_checking_fee is
  'At most one service may be THE checking fee - the app asks for it by that flag.';

-- ---------------------------------------------------------------------------
-- Clear the two lists
-- ---------------------------------------------------------------------------
-- Runs as the migration role, which the policies above do not apply to, so the
-- "no history" rule is written into the statements themselves. Anything the
-- shop has already used on a real job order or ticket is kept, and the notice
-- says how many.

do $$
declare
  v_deleted integer;
  v_kept integer;
begin
  /*
    The existence check is written out here rather than calling the helpers
    above, and that is not duplication for its own sake.

    Those helpers now begin with `is_owner_or_admin()`, which is FALSE for the
    role a migration runs as - nobody is signed in. The whole expression would
    come back NULL, `not null` is null, and `where null` deletes nothing at
    all, silently. The first version of this file did exactly that and cleared
    no rows while reporting success.
  */
  delete from public.apparel_products p
   where not exists (
     select 1 from public.apparel_order_lines l where l.apparel_product_id = p.id
   );
  get diagnostics v_deleted = row_count;
  select count(*) into v_kept from public.apparel_products;
  raise notice 'Cleared % apparel item(s); % kept because they are on a job order already.',
    v_deleted, v_kept;

  delete from public.repair_services s
   where not exists (
     select 1 from public.repair_lines l where l.repair_service_id = s.id
   );
  get diagnostics v_deleted = row_count;
  select count(*) into v_kept from public.repair_services;
  raise notice 'Cleared % repair service(s); % kept because they are on a ticket already.',
    v_deleted, v_kept;
end;
$$;

-- PostgREST caches its picture of the schema and would answer "function not
-- found" for the four new functions until it noticed them. Nothing listens on
-- a plain PostgreSQL, so the test harness ignores this.
notify pgrst, 'reload schema';
