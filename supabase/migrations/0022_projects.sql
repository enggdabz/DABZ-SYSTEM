-- Phase 15: project sales (owner's request, 30 September 2026).
--
-- WHAT THE OWNER ASKED FOR
--
--   At the Counter, a sale can be a PROJECT: a job for one of the three
--   divisions with a customer, a description, a total price, a due date and
--   a down payment (or full payment) taken today. Only the money actually
--   paid today is a sale; the unpaid balance stays on the project. The
--   balance is paid later, from the project, and that is a new sale for that
--   day. Each project shows on a calendar on its due date and carries a
--   production status for its division.
--
-- DECISIONS MADE HERE, recorded in docs/DECISIONS.md:
--
--   * Money reaches the ledger through `complete_sale` and NOTHING ELSE. The
--     shop has exactly three sanctioned ways money reaches the ledger; a
--     project payment is a real row in `sales` with a link to the project, so
--     End of day, Sales, the collections feed and the ledger all count it
--     without a change, and there is no fourth way to disagree with them.
--
--   * The balance, "fully paid" and the production status are NEVER STORED.
--     The balance is the project's total minus its live (unvoided) linked
--     sales, so voiding one of those sales puts the balance back by itself.
--     The same rule as an order total, a payslip and a stock level.
--
--   * A project is separate from an apparel job order and a repair ticket.
--     Those carry rosters, parts and their own payment paths; a counter
--     project is the light record made at the till. Linking them is a later
--     decision, not a detail.
--
--   * Payments go through `sales`, which only add-sales holders can read, so
--     reading a project needs `add_sales` too. Otherwise a person who could
--     see the project but not its payments would see the whole price as
--     owing - a confident wrong balance.

-- ---------------------------------------------------------------------------
-- The steps each division works through
-- ---------------------------------------------------------------------------
-- In the owner's words, in the order the work happens. One function rather
-- than a table: it is the owner's own process, not a figure only they can
-- know, and src/lib/projects.ts has the same lists (a test reads this file and
-- fails if the two ever disagree).

create or replace function public.project_steps_for(p_division text)
returns text[]
language sql
immutable
as $$
  select case p_division
    when 'apparel' then array[
      'design', 'pattern', 'print', 'heat_press', 'tabas', 'sewing',
      'quality_check', 'packaging', 'ready_to_ship'
    ]
    when 'dabztech' then array[
      'received', 'diagnosing', 'repairing', 'testing', 'ready_for_pickup'
    ]
    when 'printshoppe' then array[
      'design', 'print', 'finishing', 'ready_for_pickup'
    ]
  end;
$$;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),

  -- J-260930-001. Unique, so a project number always means one project.
  project_number text not null unique,
  project_date date not null,

  division text not null
    check (division in ('printshoppe', 'apparel', 'dabztech')),

  customer_id uuid references public.customers (id) on delete set null,
  -- Kept even when a customer record is linked: the person at the counter is
  -- often not the person on the customer list.
  customer_name text not null check (btrim(customer_name) <> ''),
  -- Messenger name or phone number, as the customer gave it.
  contact text,

  description text not null check (btrim(description) <> ''),

  -- The agreed price for the whole job. Typed at the counter: a project is
  -- priced fresh each time, so this is never a default.
  total_centavos bigint not null check (total_centavos > 0),

  -- Null is a real state for a FULL payment. A down payment always has one,
  -- because a job with money taken and no date is the one that gets lost.
  due_on date,

  -- What the money is filed as in the ledger ("tarpaulin", "jackets"...).
  income_category text not null,

  -- Whether the job is still the shop's to do. NOT whether it is paid.
  status text not null default 'open'
    check (status in ('open', 'released', 'cancelled')),
  released_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,

  created_at timestamptz not null default now(),
  created_by uuid,

  constraint projects_category_fits_division check (
    (division = 'printshoppe' and income_category in (
      'document_printing', 'photocopy', 'lamination', 'tarpaulin',
      'stickers', 'mugs_souvenirs', 'other_print_jobs'))
    or (division = 'apparel' and income_category in (
      'sublimation_jerseys', 'shirts', 'jackets', 'long_sleeves',
      'dtf_prints', 'other_apparel'))
    or (division = 'dabztech' and income_category in (
      'epson_printer_repair', 'laptop_repair', 'desktop_repair',
      'parts_sold'))
  ),
  constraint projects_cancel_has_reason check (
    status <> 'cancelled' or coalesce(btrim(cancel_reason), '') <> ''
  )
);

comment on table public.projects is
  'Counter projects. The balance, "fully paid" and the production status are NOT stored - they are worked out from the linked sales and the step rows.';

create index if not exists projects_due_idx on public.projects (due_on);
create index if not exists projects_status_idx on public.projects (status, due_on);

-- ---------------------------------------------------------------------------
-- Payments: a project's link to the sales that paid it
-- ---------------------------------------------------------------------------

create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  -- One sale pays one project, once. The sale is the money; this row only says
  -- what it was for.
  sale_id uuid not null unique references public.sales (id),
  kind text not null check (kind in ('down', 'full', 'balance')),

  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.project_payments is
  'Which sales paid which project. The amount is the sale''s own total - it is deliberately not copied here.';

create index if not exists project_payments_project_idx
  on public.project_payments (project_id);

-- ---------------------------------------------------------------------------
-- Production steps
-- ---------------------------------------------------------------------------

create table if not exists public.project_steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  step text not null,

  created_at timestamptz not null default now(),
  created_by uuid,

  constraint project_steps_one_per_step unique (project_id, step)
);

comment on table public.project_steps is
  'One row per step a project has passed. The status is the first step of its division with no row - it is not stored.';

create index if not exists project_steps_project_idx
  on public.project_steps (project_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Read: whoever works the counter (Owner and Admin always pass has_permission).
-- Write: nobody, directly. Every write is a function below, which checks the
-- caller itself. Same shape as expenses and the online orders.

alter table public.projects enable row level security;
alter table public.project_payments enable row level security;
alter table public.project_steps enable row level security;

drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects
  for select using (public.has_permission('add_sales'));

drop policy if exists project_payments_read on public.project_payments;
create policy project_payments_read on public.project_payments
  for select using (public.has_permission('add_sales'));

drop policy if exists project_steps_read on public.project_steps;
create policy project_steps_read on public.project_steps
  for select using (public.has_permission('add_sales'));

-- ---------------------------------------------------------------------------
-- What a project has been paid
-- ---------------------------------------------------------------------------
-- Live sales only: a voided sale is money handed back.

create or replace function public.project_paid_centavos(p_project_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(s.total_centavos), 0)::bigint
  from public.project_payments pp
  join public.sales s on s.id = pp.sale_id
  where pp.project_id = p_project_id and s.voided_at is null
    -- SECURITY DEFINER so the arithmetic is right for whoever calls it, but it
    -- still answers only people who could read the project.
    and public.has_permission('add_sales');
$$;

-- ---------------------------------------------------------------------------
-- Starting a project: the project and today's payment, one transaction
-- ---------------------------------------------------------------------------

create or replace function public.create_project(
  p_project_date date,
  p_division text,
  p_customer_id uuid,
  p_customer_name text,
  p_contact text,
  p_description text,
  p_total_centavos bigint,
  p_due_on date,
  p_income_category text,
  p_kind text,
  p_amount_centavos bigint,
  p_payment_method text,
  p_reference_number text,
  p_money_given_centavos bigint,
  p_change_centavos bigint
)
returns table (project_id uuid, project_number text, sale_id uuid, sale_number text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_number text;
  v_sequence int;
  v_attempt int := 0;
  v_sale_id uuid;
  v_sale_number text;
  v_kind_label text;
begin
  /*
    SECURITY DEFINER for the same reason as complete_sale: the project and its
    payment have to be written together, and a staff member may not write the
    ledger directly. It checks the permission itself, first, and every figure
    is checked here rather than trusted from the caller.
  */
  if not public.has_permission('add_sales') then
    raise exception 'You do not have permission to add sales.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_division not in ('printshoppe', 'apparel', 'dabztech') then
    raise exception 'Choose a division for the project.';
  end if;
  if coalesce(btrim(p_customer_name), '') = '' then
    raise exception 'A project needs a customer name.';
  end if;
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'Describe the job.';
  end if;
  if p_total_centavos is null or p_total_centavos <= 0 then
    raise exception 'A project needs a total price.';
  end if;
  if p_kind not in ('down', 'full') then
    raise exception 'Choose a down payment or a full payment.';
  end if;
  if p_amount_centavos is null or p_amount_centavos <= 0 then
    raise exception 'Enter the amount paid now.';
  end if;
  if p_amount_centavos > p_total_centavos then
    raise exception 'The amount paid cannot be more than the project total.';
  end if;

  if p_kind = 'full' and p_amount_centavos <> p_total_centavos then
    raise exception 'A full payment has to be the whole price. Use a down payment for less.';
  end if;
  if p_kind = 'down' and p_amount_centavos = p_total_centavos then
    raise exception 'That is the whole price - choose full payment.';
  end if;
  -- A down payment leaves a balance, and a balance needs a day to be chased.
  if p_kind = 'down' and p_due_on is null then
    raise exception 'A project with a down payment needs a due date.';
  end if;

  select count(*) into v_sequence from public.projects where project_date = p_project_date;

  loop
    v_attempt := v_attempt + 1;
    v_sequence := v_sequence + 1;
    v_number := 'J-' || to_char(p_project_date, 'YYMMDD') || '-' ||
                lpad(v_sequence::text, 3, '0');

    begin
      insert into public.projects (
        project_number, project_date, division, customer_id, customer_name,
        contact, description, total_centavos, due_on, income_category,
        created_by
      )
      values (
        v_number, p_project_date, p_division, p_customer_id,
        btrim(p_customer_name), nullif(btrim(p_contact), ''),
        btrim(p_description), p_total_centavos, p_due_on, p_income_category,
        auth.uid()
      )
      returning id into v_project_id;

      exit;
    exception when unique_violation then
      if v_attempt >= 20 then
        raise exception 'Could not find a free project number for today.';
      end if;
    end;
  end loop;

  v_kind_label := case p_kind when 'down' then 'Down payment' else 'Full payment' end;

  -- The payment IS a sale, written by the one function that writes sales.
  select cs.sale_id, cs.sale_number
    into v_sale_id, v_sale_number
  from public.complete_sale(
    p_project_date, p_customer_id,
    p_amount_centavos, 0, 'none', null, p_amount_centavos,
    p_payment_method, p_reference_number,
    p_money_given_centavos, p_change_centavos,
    jsonb_build_array(jsonb_build_object(
      'name', 'Project ' || v_number || ' - ' || v_kind_label,
      'division', p_division,
      'quantity', 1,
      'unit_price_centavos', p_amount_centavos,
      'line_total_centavos', p_amount_centavos,
      'income_category', p_income_category
    )),
    jsonb_build_array(jsonb_build_object(
      'division', p_division,
      'category', p_income_category,
      'amount_centavos', p_amount_centavos
    ))
  ) cs;

  insert into public.project_payments (project_id, sale_id, kind, created_by)
  values (v_project_id, v_sale_id, p_kind, auth.uid());

  return query select v_project_id, v_number, v_sale_id, v_sale_number;
end;
$$;

comment on function public.create_project is
  'Writes a project and the sale for what was paid today in one transaction. The balance is not stored anywhere.';

-- ---------------------------------------------------------------------------
-- Paying the balance: a new sale for that day
-- ---------------------------------------------------------------------------

create or replace function public.record_project_balance(
  p_project_id uuid,
  p_sale_date date,
  p_amount_centavos bigint,
  p_payment_method text,
  p_reference_number text,
  p_money_given_centavos bigint,
  p_change_centavos bigint
)
returns table (sale_id uuid, sale_number text, balance_centavos bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project public.projects;
  v_paid bigint;
  v_balance bigint;
  v_sale_id uuid;
  v_sale_number text;
begin
  if not public.has_permission('add_sales') then
    raise exception 'You do not have permission to add sales.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Locked, so two tills taking the last of a balance cannot both succeed.
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'That project no longer exists.';
  end if;
  if v_project.status = 'cancelled' then
    raise exception 'That project was cancelled.';
  end if;

  if p_amount_centavos is null or p_amount_centavos <= 0 then
    raise exception 'Enter the amount being paid.';
  end if;

  v_paid := public.project_paid_centavos(p_project_id);
  v_balance := v_project.total_centavos - v_paid;

  if v_balance <= 0 then
    raise exception 'That project is already fully paid.';
  end if;
  if p_amount_centavos > v_balance then
    raise exception 'That is more than the balance owing.';
  end if;

  select cs.sale_id, cs.sale_number
    into v_sale_id, v_sale_number
  from public.complete_sale(
    p_sale_date, v_project.customer_id,
    p_amount_centavos, 0, 'none', null, p_amount_centavos,
    p_payment_method, p_reference_number,
    p_money_given_centavos, p_change_centavos,
    jsonb_build_array(jsonb_build_object(
      'name', 'Project ' || v_project.project_number || ' - Balance',
      'division', v_project.division,
      'quantity', 1,
      'unit_price_centavos', p_amount_centavos,
      'line_total_centavos', p_amount_centavos,
      'income_category', v_project.income_category
    )),
    jsonb_build_array(jsonb_build_object(
      'division', v_project.division,
      'category', v_project.income_category,
      'amount_centavos', p_amount_centavos
    ))
  ) cs;

  insert into public.project_payments (project_id, sale_id, kind, created_by)
  values (p_project_id, v_sale_id, 'balance', auth.uid());

  return query select v_sale_id, v_sale_number, v_balance - p_amount_centavos;
end;
$$;

comment on function public.record_project_balance is
  'Takes a payment against a project as a new sale for the given day. Refuses more than the balance.';

-- ---------------------------------------------------------------------------
-- Production: mark the current step, undo the last one
-- ---------------------------------------------------------------------------

create or replace function public.project_step_permission(p_division text)
returns text
language sql
immutable
as $$
  select case p_division
    when 'apparel' then 'apparel_job_orders'
    when 'dabztech' then 'dabztech_tickets'
    else 'add_sales'
  end;
$$;

create or replace function public.mark_project_step(
  p_project_id uuid,
  p_step text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project public.projects;
  v_steps text[];
  v_next text;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'That project no longer exists.';
  end if;

  if not (public.has_permission('add_sales')
          and public.has_permission(public.project_step_permission(v_project.division))) then
    raise exception 'You do not have permission to update this project''s production.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_project.status <> 'open' then
    raise exception 'That project is no longer open.';
  end if;

  v_steps := public.project_steps_for(v_project.division);

  -- Only the CURRENT step can be ticked: the first with no row against it.
  select s into v_next
  from unnest(v_steps) with ordinality as t(s, n)
  where not exists (
    select 1 from public.project_steps ps
    where ps.project_id = p_project_id and ps.step = t.s
  )
  order by n
  limit 1;

  if v_next is null then
    raise exception 'Every step of that project is already done.';
  end if;
  if v_next <> p_step then
    raise exception 'The current step is not that one.';
  end if;

  insert into public.project_steps (project_id, step, created_by)
  values (p_project_id, p_step, auth.uid());
end;
$$;

create or replace function public.undo_project_step(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project public.projects;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'That project no longer exists.';
  end if;

  if not (public.has_permission('add_sales')
          and public.has_permission(public.project_step_permission(v_project.division))) then
    raise exception 'You do not have permission to update this project''s production.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_project.status <> 'open' then
    raise exception 'That project is no longer open.';
  end if;

  -- A tick made by mistake is a claim that has to stop being made (the same
  -- reasoning as Phase 12). Only the LATEST one, so the steps stay in a run.
  delete from public.project_steps
  where id = (
    select ps.id from public.project_steps ps
    join unnest(public.project_steps_for(v_project.division)) with ordinality t(s, n)
      on t.s = ps.step
    where ps.project_id = p_project_id
    order by t.n desc
    limit 1
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Releasing and cancelling
-- ---------------------------------------------------------------------------

create or replace function public.release_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project public.projects;
  v_done int;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'That project no longer exists.';
  end if;
  if not public.has_permission('add_sales') then
    raise exception 'You do not have permission to release projects.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_project.status <> 'open' then
    raise exception 'That project is no longer open.';
  end if;

  select count(*) into v_done from public.project_steps where project_id = p_project_id;
  if v_done < array_length(public.project_steps_for(v_project.division), 1) then
    raise exception 'The work is not finished yet - every step has to be done first.';
  end if;

  -- A balance still owing does NOT stop the release: a regular is allowed to
  -- take the work. The project stays on the list until it is paid.
  update public.projects set status = 'released', released_at = now()
  where id = p_project_id;
end;
$$;

create or replace function public.cancel_project(p_project_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project public.projects;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'That project no longer exists.';
  end if;
  if not public.has_permission('add_sales') then
    raise exception 'You do not have permission to cancel projects.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_project.status <> 'open' then
    raise exception 'Only an open project can be cancelled.';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why the project is being cancelled.';
  end if;

  update public.projects
     set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason)
   where id = p_project_id;
end;
$$;

grant execute on function public.project_steps_for(text) to authenticated;
grant execute on function public.project_step_permission(text) to authenticated;
grant execute on function public.project_paid_centavos(uuid) to authenticated;
grant execute on function public.create_project(
  date, text, uuid, text, text, text, bigint, date, text, text, bigint, text, text, bigint, bigint
) to authenticated;
grant execute on function public.record_project_balance(
  uuid, date, bigint, text, text, bigint, bigint
) to authenticated;
grant execute on function public.mark_project_step(uuid, text) to authenticated;
grant execute on function public.undo_project_step(uuid) to authenticated;
grant execute on function public.release_project(uuid) to authenticated;
grant execute on function public.cancel_project(uuid, text) to authenticated;
