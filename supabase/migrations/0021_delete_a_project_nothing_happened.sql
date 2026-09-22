-- Delete a project that nothing has happened to (owner's request,
-- 22 September 2026).
--
--   "Add also a delete button for an encoded project, but pop up a
--    verification if it is going to really delete."
--
-- THIS CHANGES A RULE, SO IT IS WORTH SAYING WHY
--
-- `0007` gave `apparel_orders` no delete policy at all, and the reason was
-- good: an order is cancelled with a reason, never erased, because the
-- customer may be holding the job order sheet. That reason has not gone away.
-- What it did not cover is the project written by mistake - a wrong team name,
-- a duplicate, a test entry - which under that rule sat on the list as
-- "cancelled" forever. "Stop counting it" is the right answer for a real job
-- that fell through and an odd one for a typo five seconds old.
--
-- So this does NOT open the door; it opens a gap in it exactly the width of
-- the mistake, using the rule the rest of the catalogue already follows
-- (`0011`, and `src/lib/deletable.ts`): **delete only where nothing has
-- happened; otherwise stop.**
--
-- NOTHING HAS HAPPENED means all of:
--
--   * no payment against it, voided or not. A payment wrote ledger entries
--     that point at it, and the foreign key cascades - deleting the project
--     would take the payment rows with it and leave the ledger describing
--     money that moved against a project that no longer exists. That is the
--     silent hole the void rules exist to prevent.
--   * no production mark on any of its items. Those are somebody's statement
--     about work they did at a bench.
--   * not released. A released project has left the shop; the customer has
--     the jerseys and quite possibly the sheet.
--
-- A project CANCELLED and otherwise untouched may go: cancelling is a decision
-- about the work, not a record that money moved, and a project cancelled by
-- mistake is one of the cases this exists for.
--
-- The people and the items DO cascade away with it, and that is why the app
-- writes the whole project - every person, every item - to the audit log
-- BEFORE deleting, exactly as a deleted product writes its bulk price rules.
-- Afterwards there is nothing left to reconstruct them from.
--
-- WHO: Owner and Admin only. Deleting a whole project is not counter work.
-- A staff member with the apparel permission cancels it and the owner clears
-- it up - the same shape as "staff add sales; only Owner/Admin void them".

-- ---------------------------------------------------------------------------
-- Has anything happened to this project?
-- ---------------------------------------------------------------------------
-- `SECURITY DEFINER` for two reasons. The policy below has to ask about three
-- other tables, and a policy sub-query is subject to RLS too - the Phase 3
-- lesson (`is_active_staff`), where a check silently fails for the very people
-- it is meant to allow. And the app asks the same question to decide whether
-- to offer the button at all, so both read one answer rather than two.
--
-- It answers NULL to anyone who is not Owner/Admin, like every other
-- `*_has_history` helper: PostgREST publishes it as a URL, and one that
-- answered everybody would be a way to learn, one project at a time, which
-- jobs have money against them - which staff are not allowed to see at all.

create or replace function public.apparel_order_has_history(p_order_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select case
    when not public.is_owner_or_admin() then null
    else
      exists (
        select 1 from public.apparel_payments
        where order_id = p_order_id
      )
      or exists (
        select 1
        from public.apparel_production_steps s
        join public.apparel_order_lines l on l.id = s.line_id
        where l.order_id = p_order_id
      )
      or exists (
        select 1 from public.apparel_orders o
        where o.id = p_order_id and o.status = 'released'
      )
  end;
$$;

comment on function public.apparel_order_has_history is
  'True when a project has a payment, a production mark, or has been released - the three things that make it a record rather than a mistake. Null to anyone who is not Owner/Admin.';

-- ---------------------------------------------------------------------------
-- The delete policy
-- ---------------------------------------------------------------------------
-- `= false` rather than `is not true`, and the difference matters: null means
-- "could not tell", and a delete on a project this cannot vouch for must not
-- go through. The APP is allowed to be permissive the other way - it offers
-- the button unless the answer is exactly `true` - because this policy is the
-- boundary and refuses anything it is not sure about.

drop policy if exists apparel_orders_delete on public.apparel_orders;
create policy apparel_orders_delete on public.apparel_orders
  for delete using (
    public.is_owner_or_admin()
    and public.apparel_order_has_history(id) = false
  );
