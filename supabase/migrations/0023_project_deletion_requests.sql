-- Delete a project with the owner's approval (owner's request, 30 September 2026).
--
--   "An admin can click Delete project directly on a project, but the project is
--    NOT removed yet. It creates a deletion request that the owner must
--    approve. The owner can delete a project immediately."
--
-- WHAT THIS DECIDES
--
--   * A delete is a SOFT delete: `projects.deleted_at` / `deleted_by`. The row,
--     its payments and its steps all stay. The screens filter it out; the
--     money does not move. A project's down payment is a real `sales` row
--     (Phase 15), so End of day, Sales, the collections feed and the ledger
--     keep counting it - the drawer still adds up - and Sales marks it
--     "project deleted". Nothing here writes to the ledger.
--
--   * Who may do what is decided IN THE DATABASE. `delete_project` looks at the
--     caller's role: the owner deletes at once, an admin can only create a
--     request, anybody else is refused. `decide_project_deletion` checks
--     `is_owner()` itself. A Server Action is a public endpoint, so neither
--     rule may live only in a button or in an action.
--
--   * "Cannot be edited while a request is pending" is a TRIGGER, not a check
--     inside each function. Every existing and future writer - a step, a
--     release, a cancel, an edit form somebody adds later - passes through it,
--     so a new function cannot forget the rule. A deleted project takes no more
--     payments either; a project waiting for its answer still does, because
--     turning a customer's money away is worse than a balance that moves.
--
--   * One pending request per project: a partial unique index, so two admins
--     tapping at once cannot both win.
--
--   * A request row is never deleted or edited by hand. Its `requested_by` is
--     its `created_by`.
--
--   * In-app notifications are a small table only these functions write.
--     There is no insert or update policy: nobody can post a message to
--     somebody else's bell, or mark another person's as read.

-- ---------------------------------------------------------------------------
-- Soft delete on projects
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table public.projects
  drop constraint if exists projects_deleted_has_deleter;
alter table public.projects
  add constraint projects_deleted_has_deleter
  check ((deleted_at is null) = (deleted_by is null));

create index if not exists projects_live_idx
  on public.projects (due_on) where deleted_at is null;

-- A deleted project is Owner/Admin material: staff see the list, the calendar
-- and every figure WITHOUT it, and cannot open it by its address either. The
-- app filters too, but this is the boundary.
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects
  for select using (
    public.has_permission('add_sales')
    and (deleted_at is null or public.is_owner_or_admin())
  );

-- ---------------------------------------------------------------------------
-- The requests
-- ---------------------------------------------------------------------------

create table if not exists public.project_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  -- Restrict: a project is soft-deleted, never removed, and a request must not
  -- be able to vanish with the project it is about.
  project_id uuid not null references public.projects (id) on delete restrict,

  -- The admin who asked. This is the record's created_by.
  requested_by uuid not null,
  reason text not null check (btrim(reason) <> ''),

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),

  -- The owner who decided. Null for a request the admin withdrew.
  reviewed_by uuid,
  review_note text,

  created_at timestamptz not null default now(),
  reviewed_at timestamptz,

  constraint project_deletion_pending_is_open check (
    status <> 'pending' or (reviewed_by is null and reviewed_at is null)
  ),
  constraint project_deletion_decided_has_owner check (
    status not in ('approved', 'rejected')
    or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint project_deletion_cancelled_has_time check (
    status <> 'cancelled' or reviewed_at is not null
  )
);

comment on table public.project_deletion_requests is
  'An admin''s request to delete a project. Only the owner can approve; approving soft-deletes the project. Written only by the functions in 0023.';

create unique index if not exists project_deletion_one_pending
  on public.project_deletion_requests (project_id)
  where status = 'pending';

create index if not exists project_deletion_status_idx
  on public.project_deletion_requests (status, created_at desc);

alter table public.project_deletion_requests enable row level security;

drop policy if exists project_deletion_requests_read on public.project_deletion_requests;
create policy project_deletion_requests_read on public.project_deletion_requests
  for select using (public.is_owner_or_admin());

-- ---------------------------------------------------------------------------
-- In-app notifications
-- ---------------------------------------------------------------------------

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  message text not null check (btrim(message) <> ''),
  -- Where tapping it goes, inside the app.
  href text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

comment on table public.app_notifications is
  'Messages for one person, shown in the top bar. Written only by SECURITY DEFINER functions.';

create index if not exists app_notifications_user_idx
  on public.app_notifications (user_id, created_at desc);

alter table public.app_notifications enable row level security;

-- Your own only, and only while your account is active - the same rule as
-- every other own-row read since 0017.
drop policy if exists app_notifications_read_own on public.app_notifications;
create policy app_notifications_read_own on public.app_notifications
  for select using (
    user_id = auth.uid() and public.current_role_name() is not null
  );

-- The one way to write a message. Not callable by anybody signed in: it takes
-- a user id, so an open one would be a way to post to another person's bell.
create or replace function public.notify_user(
  p_user_id uuid,
  p_message text,
  p_href text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.app_notifications (user_id, message, href)
  values (p_user_id, p_message, p_href);
$$;

revoke all on function public.notify_user(uuid, text, text) from public, anon, authenticated;

create or replace function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.app_notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and public.current_role_name() is not null;
$$;

grant execute on function public.mark_notifications_read() to authenticated;

-- ---------------------------------------------------------------------------
-- The audit log learns the four words this feature uses
-- ---------------------------------------------------------------------------

alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'create', 'update', 'delete', 'void',
    'login', 'login_failed', 'logout',
    'password_change', 'password_reset',
    'permission_grant', 'permission_revoke',
    'activate', 'deactivate',
    'request', 'approve', 'reject', 'cancel'
  ));

-- ---------------------------------------------------------------------------
-- Is a deletion waiting on this project?
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because `project_deletion_requests` is Owner/Admin only and
-- the Project page is opened by counter staff too. Null to anyone who could not
-- read the project anyway; the app treats anything but `true` as "no".

create or replace function public.project_deletion_pending(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when not public.has_permission('add_sales') then null
    else exists (
      select 1 from public.project_deletion_requests r
      where r.project_id = p_project_id and r.status = 'pending'
    )
  end;
$$;

-- Which of these sales belong to a deleted project? Sales, the feed and End of
-- day mark those "project deleted". SECURITY DEFINER because staff cannot read
-- a deleted project; it answers only the holders of add_sales and only says
-- yes or no for the sale ids it was asked about.
create or replace function public.deleted_project_sale_ids(p_sale_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pp.sale_id
  from public.project_payments pp
  join public.projects p on p.id = pp.project_id
  where p.deleted_at is not null
    and pp.sale_id = any (p_sale_ids)
    and public.has_permission('add_sales');
$$;

grant execute on function public.project_deletion_pending(uuid) to authenticated;
grant execute on function public.deleted_project_sale_ids(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- The guards: a pending or deleted project takes no edits
-- ---------------------------------------------------------------------------

create or replace function public.guard_project_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.deleted_at is not null then
    raise exception 'That project was deleted.';
  end if;

  -- Deleting itself is the one change allowed. Anything else changing while a
  -- request is waiting is an edit, and is refused.
  if new.deleted_at is null
     and exists (
       select 1 from public.project_deletion_requests r
       where r.project_id = old.id and r.status = 'pending'
     ) then
    raise exception 'Deletion of this project is waiting for the owner''s approval, so it cannot be changed. Cancel the request first.';
  end if;

  return new;
end;
$$;

drop trigger if exists projects_guard_update on public.projects;
create trigger projects_guard_update
  before update on public.projects
  for each row execute function public.guard_project_update();

create or replace function public.guard_project_steps()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := coalesce(new.project_id, old.project_id);
begin
  if exists (
    select 1 from public.projects p
    where p.id = v_project_id and p.deleted_at is not null
  ) then
    raise exception 'That project was deleted.';
  end if;
  if exists (
    select 1 from public.project_deletion_requests r
    where r.project_id = v_project_id and r.status = 'pending'
  ) then
    raise exception 'Deletion of this project is waiting for the owner''s approval, so its stage cannot be changed. Cancel the request first.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists project_steps_guard on public.project_steps;
create trigger project_steps_guard
  before insert or delete on public.project_steps
  for each row execute function public.guard_project_steps();

-- A deleted project takes no more money. `complete_sale` has already run by
-- the time this fires, but they share one transaction, so the sale goes too.
create or replace function public.guard_project_payments()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.projects p
    where p.id = new.project_id and p.deleted_at is not null
  ) then
    raise exception 'That project was deleted.';
  end if;
  return new;
end;
$$;

drop trigger if exists project_payments_guard on public.project_payments;
create trigger project_payments_guard
  before insert on public.project_payments
  for each row execute function public.guard_project_payments();

-- ---------------------------------------------------------------------------
-- Delete: the owner deletes, an admin asks
-- ---------------------------------------------------------------------------

create or replace function public.delete_project(
  p_project_id uuid,
  p_reason text
)
returns table (outcome text, request_id uuid)
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
begin
  /*
    The whole rule is here. Whatever a screen or an action believes, an admin
    who calls this ends up with a request and no deletion, and staff with
    nothing.
  */
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

  select * into v_pending
  from public.project_deletion_requests r
  where r.project_id = p_project_id and r.status = 'pending';

  if v_role = 'owner' then
    -- A request that was waiting is settled by the owner acting on it.
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

    update public.projects
       set deleted_at = now(), deleted_by = auth.uid()
     where id = p_project_id;

    return query select 'deleted'::text, v_pending.id;
    return;
  end if;

  -- An admin: a request, never a deletion.
  if found then
    raise exception 'A deletion request for this project is already waiting for the owner.';
  end if;

  begin
    insert into public.project_deletion_requests (project_id, requested_by, reason)
    values (p_project_id, auth.uid(), btrim(p_reason))
    returning id into v_request_id;
  exception when unique_violation then
    -- Two admins at once: the index picked one.
    raise exception 'A deletion request for this project is already waiting for the owner.';
  end;

  for v_owner in
    select p.id from public.profiles p where p.role = 'owner' and p.status = 'active'
  loop
    perform public.notify_user(
      v_owner,
      'A deletion request is waiting: project ' || v_project.project_number
        || ' (' || v_project.customer_name || ').',
      '/projects/deletion-requests'
    );
  end loop;

  return query select 'requested'::text, v_request_id;
end;
$$;

comment on function public.delete_project is
  'Owner: soft-deletes now. Admin: creates a pending request only. Anyone else: refused.';

-- ---------------------------------------------------------------------------
-- Withdraw a request
-- ---------------------------------------------------------------------------
-- The admin who asked, or the owner. Another admin cannot withdraw it.

create or replace function public.cancel_project_deletion(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.project_deletion_requests;
  v_project public.projects;
begin
  if not public.is_owner_or_admin() then
    raise exception 'You do not have permission to do that.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_request
  from public.project_deletion_requests where id = p_request_id for update;
  if not found then
    raise exception 'That request no longer exists.';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'That request is no longer pending.';
  end if;
  if v_request.requested_by <> auth.uid() and not public.is_owner() then
    raise exception 'Only the person who asked, or the owner, can cancel a request.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.project_deletion_requests
     set status = 'cancelled', reviewed_at = now()
   where id = p_request_id;

  -- The owner withdrawing somebody else's request is worth telling them.
  if v_request.requested_by <> auth.uid() then
    select * into v_project from public.projects where id = v_request.project_id;
    perform public.notify_user(
      v_request.requested_by,
      'Your request to delete project ' || v_project.project_number
        || ' (' || v_project.customer_name || ') was cancelled by the owner.',
      '/projects/' || v_project.id
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The owner's answer
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
begin
  -- The owner ONLY. Not an admin, and not the admin who asked.
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

  -- Status first: the guard on `projects` lets the delete itself through only
  -- while nothing else is changing, and the request is no longer pending.
  update public.project_deletion_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
   where id = p_request_id;

  if p_approve then
    update public.projects
       set deleted_at = now(), deleted_by = auth.uid()
     where id = v_project.id and deleted_at is null;
  end if;

  perform public.notify_user(
    v_request.requested_by,
    'Your request to delete project ' || v_project.project_number
      || ' (' || v_project.customer_name || ') was '
      || case when p_approve then 'approved' else 'rejected' end
      || case when v_note is null then '.' else ': ' || v_note end,
    case when p_approve then '/projects' else '/projects/' || v_project.id end
  );
end;
$$;

grant execute on function public.delete_project(uuid, text) to authenticated;
grant execute on function public.cancel_project_deletion(uuid) to authenticated;
grant execute on function public.decide_project_deletion(uuid, boolean, text) to authenticated;
