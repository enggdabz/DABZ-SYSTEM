-- Refund the down payment when a project is deleted (owner's request,
-- 30 September 2026).
--
--   "When deleting a project, pop up a refund option for the down payment if
--    there is one; if there is none, just proceed to delete the project."
--
-- WHAT THIS DECIDES
--
--   * A refund is a VOID. That is how money is handed back everywhere else in
--     the system (`void_sale`): the sale stays, marked, its ledger entries are
--     voided with it, and the day stops counting money that left the drawer.
--     Nothing here writes a new kind of money row, so there are still exactly
--     three ways money reaches the ledger and this is not a fourth.
--
--   * It is a CHOICE, made by whoever deletes, and only offered when the
--     project has a live payment. Refund: every live payment on the project is
--     voided, in the same transaction as the delete. Keep: the payments stay
--     in Sales exactly as 0023 left them. A project with nothing paid has
--     nothing to ask about.
--
--   * An admin's request carries the choice (`refund_requested`); the owner's
--     approval carries it out. Nothing is voided until the owner approves - a
--     request moves no money, the same rule as a pending expense. The amount
--     is worked out when the owner decides, not when the admin asked, because a
--     balance may have been paid in between and refunding what the customer
--     actually paid is the point.
--
--   * The refund is done by an internal function nobody signed in can call. It
--     voids sales and takes only a project id, so an open one would be a way to
--     void a customer's payment without the checks around it.

-- ---------------------------------------------------------------------------
-- The request remembers the choice
-- ---------------------------------------------------------------------------

alter table public.project_deletion_requests
  add column if not exists refund_requested boolean not null default false;

comment on column public.project_deletion_requests.refund_requested is
  'The admin asked for the project''s live payments to be refunded (voided) if the owner approves. Nothing is voided until then.';

-- ---------------------------------------------------------------------------
-- Refund: void every live payment on a project
-- ---------------------------------------------------------------------------
-- Returns the total handed back. Called only by the two functions below, each
-- of which has already checked who is asking; `void_sale` checks again.

create or replace function public.refund_project_payments(
  p_project_id uuid,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale record;
  v_total bigint := 0;
begin
  for v_sale in
    select s.id, s.total_centavos
    from public.project_payments pp
    join public.sales s on s.id = pp.sale_id
    where pp.project_id = p_project_id and s.voided_at is null
    order by s.created_at
    for update of s
  loop
    perform public.void_sale(v_sale.id, p_reason);
    v_total := v_total + v_sale.total_centavos;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.refund_project_payments(uuid, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Delete: the owner deletes (optionally refunding), an admin asks
-- ---------------------------------------------------------------------------
-- Same rule as 0023, one more argument. The old two-argument version is
-- dropped so PostgREST never has two `delete_project`s to choose between.

drop function if exists public.delete_project(uuid, text);

create or replace function public.delete_project(
  p_project_id uuid,
  p_reason text,
  p_refund boolean default false
)
returns table (outcome text, request_id uuid, refunded_centavos bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.current_role_name();
  v_project public.projects;
  v_pending public.project_deletion_requests;
  v_request_id uuid;
  v_owner uuid;
  v_paid bigint;
  v_refunded bigint := 0;
  v_refund boolean := coalesce(p_refund, false);
begin
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can delete a project.'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why the project is being deleted.';
  end if;

  select * into v_project from public.projects where id = p_project_id for update;
  if not found or v_project.deleted_at is not null then
    raise exception 'That project no longer exists.';
  end if;

  -- What has been paid, live. A refund of nothing is not a choice.
  v_paid := public.project_paid_centavos(p_project_id);
  if v_refund and v_paid <= 0 then
    raise exception 'There is no payment on this project to refund.';
  end if;

  select * into v_pending
  from public.project_deletion_requests r
  where r.project_id = p_project_id and r.status = 'pending';

  if v_role = 'owner' then
    if found then
      update public.project_deletion_requests
         set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
             review_note = 'The owner deleted the project directly.'
       where id = v_pending.id;

      perform public.notify_user(
        v_pending.requested_by,
        'Your request to delete project ' || v_project.project_number
          || ' (' || v_project.customer_name || ') was approved.',
        '/projects'
      );
    end if;

    -- The money first, in the same transaction: if the void fails, nothing
    -- is deleted.
    if v_refund then
      v_refunded := public.refund_project_payments(
        p_project_id,
        'Refunded: project ' || v_project.project_number || ' deleted - ' || btrim(p_reason)
      );
    end if;

    update public.projects
       set deleted_at = now(), deleted_by = auth.uid()
     where id = p_project_id;

    return query select 'deleted'::text, v_pending.id, v_refunded;
    return;
  end if;

  -- An admin: a request, never a deletion and never a refund.
  if found then
    raise exception 'A deletion request for this project is already waiting for the owner.';
  end if;

  begin
    insert into public.project_deletion_requests
      (project_id, requested_by, reason, refund_requested)
    values (p_project_id, auth.uid(), btrim(p_reason), v_refund)
    returning id into v_request_id;
  exception when unique_violation then
    raise exception 'A deletion request for this project is already waiting for the owner.';
  end;

  for v_owner in
    select p.id from public.profiles p where p.role = 'owner' and p.status = 'active'
  loop
    perform public.notify_user(
      v_owner,
      'A deletion request is waiting: project ' || v_project.project_number
        || ' (' || v_project.customer_name || ')'
        || case when v_refund
             then ', with a refund of PHP ' || to_char(v_paid / 100.0, 'FM999,999,999,990.00') || ' asked for'
             else '' end
        || '.',
      '/projects/deletion-requests'
    );
  end loop;

  return query select 'requested'::text, v_request_id, 0::bigint;
end;
$$;

comment on function public.delete_project is
  'Owner: soft-deletes now, refunding (voiding) the live payments if asked. Admin: creates a pending request only, remembering the refund choice. Anyone else: refused.';

-- ---------------------------------------------------------------------------
-- The owner's answer: approving carries out the refund that was asked for
-- ---------------------------------------------------------------------------

create or replace function public.decide_project_deletion(
  p_request_id uuid,
  p_approve boolean,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.project_deletion_requests;
  v_project public.projects;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_refunded bigint := 0;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can approve or reject a deletion.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_approve is null then
    raise exception 'Choose approve or reject.';
  end if;

  select * into v_request
  from public.project_deletion_requests where id = p_request_id for update;
  if not found then
    raise exception 'That request no longer exists.';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'That request has already been dealt with.';
  end if;

  select * into v_project
  from public.projects where id = v_request.project_id for update;

  update public.project_deletion_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
   where id = p_request_id;

  if p_approve then
    -- Whatever is live NOW: a balance paid since the request is refunded too,
    -- and a payment voided since is not refunded twice.
    if v_request.refund_requested then
      v_refunded := public.refund_project_payments(
        v_project.id,
        'Refunded: project ' || v_project.project_number || ' deleted - ' || v_request.reason
      );
    end if;

    update public.projects
       set deleted_at = now(), deleted_by = auth.uid()
     where id = v_project.id and deleted_at is null;
  end if;

  perform public.notify_user(
    v_request.requested_by,
    'Your request to delete project ' || v_project.project_number
      || ' (' || v_project.customer_name || ') was '
      || case when p_approve then 'approved' else 'rejected' end
      || case when v_refunded > 0
           then ' and PHP ' || to_char(v_refunded / 100.0, 'FM999,999,999,990.00') || ' was refunded'
           else '' end
      || case when v_note is null then '.' else ': ' || v_note end,
    case when p_approve then '/projects' else '/projects/' || v_project.id end
  );
end;
$$;

grant execute on function public.delete_project(uuid, text, boolean) to authenticated;
grant execute on function public.decide_project_deletion(uuid, boolean, text) to authenticated;
