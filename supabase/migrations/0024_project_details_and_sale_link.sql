-- Project sales, second pass (owner's request, 30 September 2026).
--
-- The Counter's Project tab now asks for what the job actually IS - a type
-- (tarpaulin, apparel, printing, repair) and that type's fields - and a project
-- payment is marked as one on the sale itself.
--
--   1. projects.details   the job as structured data, so a receipt can print it
--                         as lines ("Sublimation jersey, 15 pcs, S:5 M:7 L:3").
--                         Null on a project started before this migration; the
--                         plain description still reads correctly for those.
--   2. sales.project_id, sales.payment_kind
--                         written together with every project payment, so a
--                         query over `sales` alone can tell a project's money
--                         from a regular sale's. project_payments STAYS what
--                         the balance is worked out from; the RLS suite asserts
--                         the two never disagree.
--   3. project_details_problem()
--                         the two rules that must hold even for a caller that
--                         skips the app: the type fits the division, and an
--                         apparel size breakdown adds up to the pieces.
--   4. create_project / record_project_balance write the link.
--
-- Nothing here touches complete_sale, so a regular sale is exactly what it was.

-- ---------------------------------------------------------------------------
-- 1 and 2: the columns
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists details jsonb;

comment on column public.projects.details is
  'The job as {type, values, sizes, notes}. Written by create_project after project_details_problem() has passed it; null on projects started before 0024.';

alter table public.sales
  add column if not exists project_id uuid references public.projects (id),
  add column if not exists payment_kind text
    check (payment_kind in ('downpayment', 'full', 'balance'));

comment on column public.sales.project_id is
  'The project this sale paid, or null for a regular sale. Set only by create_project and record_project_balance.';
comment on column public.sales.payment_kind is
  'downpayment, full or balance for a project payment; null for a regular sale.';

-- A project payment is both or neither. Half a link would read as a regular
-- sale on one screen and a project payment on another.
alter table public.sales drop constraint if exists sales_project_link_pairs;
alter table public.sales add constraint sales_project_link_pairs
  check ((project_id is null) = (payment_kind is null));

create index if not exists sales_project_idx
  on public.sales (project_id) where project_id is not null;

-- Payments taken before this migration.
update public.sales s
   set project_id = pp.project_id,
       payment_kind = case pp.kind when 'down' then 'downpayment' else pp.kind end
  from public.project_payments pp
 where pp.sale_id = s.id
   and s.project_id is null;

-- ---------------------------------------------------------------------------
-- 3: what a project's details must satisfy
-- ---------------------------------------------------------------------------
-- Returns a sentence for a person, or null when the details are acceptable.
-- The app checks the same things first (src/lib/project-types.ts) so the person
-- is told which BOX is wrong; this is the copy that cannot be skipped.

create or replace function public.project_details_problem(
  p_details jsonb,
  p_division text,
  p_category text
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_type text;
  v_pieces numeric;
  v_sum numeric;
  v_bad int;
begin
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    return 'Fill in the job details.';
  end if;

  v_type := p_details ->> 'type';
  if v_type is null or v_type not in ('tarpaulin', 'apparel', 'printing', 'repair') then
    return 'Choose the type of project.';
  end if;

  -- The type decides the division. A tarpaulin filed under Apparel would put
  -- its money in the wrong division's takings.
  if (v_type = 'tarpaulin'
        and (p_division <> 'printshoppe' or p_category <> 'tarpaulin'))
     or (v_type = 'apparel' and p_division <> 'apparel')
     or (v_type = 'printing'
        and (p_division <> 'printshoppe' or p_category = 'tarpaulin'))
     or (v_type = 'repair' and p_division <> 'dabztech') then
    return 'The job details do not fit the division.';
  end if;

  if v_type = 'apparel' then
    if jsonb_typeof(p_details -> 'values' -> 'pieces') is distinct from 'number' then
      return 'Enter the number of pieces.';
    end if;
    v_pieces := (p_details -> 'values' ->> 'pieces')::numeric;
    if v_pieces < 1 or v_pieces <> trunc(v_pieces) then
      return 'The number of pieces must be a whole number of 1 or more.';
    end if;

    if jsonb_typeof(p_details -> 'sizes') is distinct from 'object' then
      return 'Enter how many of each size.';
    end if;

    -- CASE keeps the cast behind the type test: SQL does not promise the
    -- order an AND is evaluated in.
    select count(*) into v_bad
    from jsonb_each(p_details -> 'sizes') e
    where case
            when jsonb_typeof(e.value) <> 'number' then true
            else (e.value #>> '{}')::numeric < 0
                 or (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric)
          end;
    if v_bad > 0 then
      return 'Sizes are whole numbers of 0 or more.';
    end if;

    select coalesce(sum((e.value #>> '{}')::numeric), 0) into v_sum
    from jsonb_each(p_details -> 'sizes') e;

    if v_sum <> v_pieces then
      return format('The sizes add up to %s, but %s pieces were ordered.',
                    v_sum::bigint, v_pieces::bigint);
    end if;
  end if;

  return null;
end;
$$;

comment on function public.project_details_problem is
  'A sentence describing what is wrong with a project''s details, or null. Used by create_project.';

-- ---------------------------------------------------------------------------
-- 4a: starting a project
-- ---------------------------------------------------------------------------
-- The argument list changes (p_details is new), which makes this a different
-- function to PostgreSQL. The old one is dropped, so the app can never reach a
-- version that does not check the details.

drop function if exists public.create_project(
  date, text, uuid, text, text, text, bigint, date, text, text, bigint, text, text, bigint, bigint
);

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
  p_change_centavos bigint,
  p_details jsonb
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
  v_problem text;
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

  v_problem := public.project_details_problem(p_details, p_division, p_income_category);
  if v_problem is not null then
    raise exception '%', v_problem;
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
        details, created_by
      )
      values (
        v_number, p_project_date, p_division, p_customer_id,
        btrim(p_customer_name), nullif(btrim(p_contact), ''),
        btrim(p_description), p_total_centavos, p_due_on, p_income_category,
        p_details, auth.uid()
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

  -- complete_sale is left alone, so a regular sale is untouched; the sale is
  -- marked as a project payment here, in the same transaction.
  update public.sales
     set project_id = v_project_id,
         payment_kind = case p_kind when 'down' then 'downpayment' else 'full' end
   where id = v_sale_id;

  insert into public.project_payments (project_id, sale_id, kind, created_by)
  values (v_project_id, v_sale_id, p_kind, auth.uid());

  return query select v_project_id, v_number, v_sale_id, v_sale_number;
end;
$$;

comment on function public.create_project is
  'Writes a project and the sale for what was paid today in one transaction. The balance is not stored anywhere.';

grant execute on function public.project_details_problem(jsonb, text, text) to authenticated;
grant execute on function public.create_project(
  date, text, uuid, text, text, text, bigint, date, text, text, bigint, text, text, bigint, bigint, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4b: paying the balance
-- ---------------------------------------------------------------------------
-- Same arguments as before, so CREATE OR REPLACE keeps its grant.

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

  update public.sales
     set project_id = p_project_id,
         payment_kind = 'balance'
   where id = v_sale_id;

  insert into public.project_payments (project_id, sale_id, kind, created_by)
  values (p_project_id, v_sale_id, 'balance', auth.uid());

  return query select v_sale_id, v_sale_number, v_balance - p_amount_centavos;
end;
$$;

comment on function public.record_project_balance is
  'Takes a payment against a project as a new sale for the given day. Refuses more than the balance.';
