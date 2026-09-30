-- Delete an apparel project that has had money on it, with a refund choice
-- (owner's request, 30 September 2026).
--
--   "Apply the same refund option to the apparel projects."
--
-- WHERE THIS SITS NEXT TO 0021
--
-- `0021` lets Owner/Admin delete an apparel project that NOTHING has happened
-- to, and refuses one with a payment (voided or not), a bench mark or a
-- release - because a hard delete cascades, and a payment's ledger entries
-- would go with it. That stays exactly as it is. What was missing is the
-- project with a DOWN PAYMENT on it, which could only be cancelled, so a job
-- entered by mistake and paid for sat on the list for ever.
--
-- So this adds a SECOND way out, not a loosening of the first:
--
--   * A SOFT delete (`deleted_at`, `deleted_by`), the same as a Counter
--     project. Nothing is removed, so the reason `0021` refuses a hard delete
--     does not apply: the payments and their ledger entries stay where they
--     were, and Sales keeps counting whatever is not refunded.
--
--   * With a REFUND CHOICE, asked only when a payment is live. Refund: every
--     live payment is voided with `void_apparel_payment` - the void this
--     system already uses, whose ledger entries go with it - in the same
--     transaction as the delete. Keep: the payments stay live.
--
--   * OWNER ONLY. An admin can already void a payment, but deleting a project
--     that has had money taken is the kind of change the owner asked to
--     approve (0023). Apparel projects have no request flow yet, so for now an
--     admin is told to ask the owner; a request flow for them is a later step.
--
--   * Still refused, and still "cancel it instead": a project that has been
--     RELEASED, and one with a production mark. Those are the shop floor's and
--     the customer's records, not money, and this migration is about money.

-- ---------------------------------------------------------------------------
-- Soft delete on apparel orders
-- ---------------------------------------------------------------------------

alter table public.apparel_orders
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table public.apparel_orders
  drop constraint if exists apparel_orders_deleted_has_deleter;
alter table public.apparel_orders
  add constraint apparel_orders_deleted_has_deleter
  check ((deleted_at is null) = (deleted_by is null));

-- The read policy is NOT narrowed. The collections feed joins apparel_orders
-- for the reference number, and it is `security_invoker`: hiding a deleted
-- order from a person would drop that person's payments from the day. The app
-- leaves deleted projects out of its lists; the money stays in the feed.

-- ---------------------------------------------------------------------------
-- A deleted project takes no more edits and no more money
-- ---------------------------------------------------------------------------

create or replace function public.guard_apparel_order_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.deleted_at is not null then
    raise exception 'That project was deleted.';
  end if;
  return new;
end;
$$;

drop trigger if exists apparel_orders_guard_update on public.apparel_orders;
create trigger apparel_orders_guard_update
  before update on public.apparel_orders
  for each row execute function public.guard_apparel_order_update();

create or replace function public.guard_apparel_payment_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.apparel_orders o
    where o.id = new.order_id and o.deleted_at is not null
  ) then
    raise exception 'That project was deleted.';
  end if;
  return new;
end;
$$;

drop trigger if exists apparel_payments_guard_insert on public.apparel_payments;
create trigger apparel_payments_guard_insert
  before insert on public.apparel_payments
  for each row execute function public.guard_apparel_payment_insert();

-- ---------------------------------------------------------------------------
-- Delete, with the refund choice
-- ---------------------------------------------------------------------------

create or replace function public.delete_apparel_project(
  p_order_id uuid,
  p_reason text,
  p_refund boolean default false
)
returns table (refunded_centavos bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.apparel_orders;
  v_payment record;
  v_live bigint;
  v_refunded bigint := 0;
  v_refund boolean := coalesce(p_refund, false);
begin
  -- The owner only. Checked here, so no screen or action decides it.
  if not public.is_owner() then
    raise exception 'Only the owner can delete a project that has had money taken.'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why the project is being deleted.';
  end if;

  select * into v_order from public.apparel_orders where id = p_order_id for update;
  if not found or v_order.deleted_at is not null then
    raise exception 'That project no longer exists.';
  end if;

  -- The two things that stay "cancel it instead": they are records of the work
  -- and of the customer having the jerseys, and deleting is not what the
  -- refund choice is for.
  if v_order.status = 'released' then
    raise exception 'That project has been released to the customer, so it cannot be deleted.';
  end if;
  if exists (
    select 1
    from public.apparel_production_steps s
    join public.apparel_order_lines l on l.id = s.line_id
    where l.order_id = p_order_id
  ) then
    raise exception 'A bench has been marked on that project, so it is cancelled with a reason instead of deleted.';
  end if;

  select coalesce(sum(amount_centavos), 0)::bigint into v_live
  from public.apparel_payments
  where order_id = p_order_id and voided_at is null;

  if v_refund and v_live <= 0 then
    raise exception 'There is no payment on this project to refund.';
  end if;

  -- The money first, in the same transaction: if a void fails, nothing is
  -- deleted. Each is the ordinary void, so its ledger entries go with it.
  if v_refund then
    for v_payment in
      select id, amount_centavos
      from public.apparel_payments
      where order_id = p_order_id and voided_at is null
      order by created_at
    loop
      perform public.void_apparel_payment(
        v_payment.id,
        'Refunded: project ' || v_order.order_number || ' deleted - ' || btrim(p_reason)
      );
      v_refunded := v_refunded + v_payment.amount_centavos;
    end loop;
  end if;

  update public.apparel_orders
     set deleted_at = now(), deleted_by = auth.uid()
   where id = p_order_id;

  return query select v_refunded;
end;
$$;

comment on function public.delete_apparel_project is
  'Owner only. Soft-deletes an apparel project that has had money on it, voiding its live payments first if asked. Refuses a released project and one with a bench marked.';

-- ---------------------------------------------------------------------------
-- Which of these payments belong to a deleted project?
-- ---------------------------------------------------------------------------
-- Sales and End of day tag them "Project deleted". SECURITY DEFINER for the
-- same reason as `deleted_project_sale_ids` (0023); answers only people who
-- may read apparel payments, and only yes or no for the ids it was asked about.

create or replace function public.deleted_apparel_payment_ids(p_payment_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ap.id
  from public.apparel_payments ap
  join public.apparel_orders o on o.id = ap.order_id
  where o.deleted_at is not null
    and ap.id = any (p_payment_ids)
    and public.has_permission('apparel_job_orders');
$$;

grant execute on function public.delete_apparel_project(uuid, text, boolean) to authenticated;
grant execute on function public.deleted_apparel_payment_ids(uuid[]) to authenticated;
