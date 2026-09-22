-- Phase 13: encoding a Dabz Apparel team project, person by person
-- (owner's request, 21 September 2026).
--
-- WHAT THE OWNER ASKED FOR
--
--   "When we receive a project we enter its basic information: Team name,
--    Address, Contact person, Contact number, Facebook account link, Due date,
--    and the Payment record (Down payment, Balance). After that, inside that
--    project, our staff manually encode the individual specification of every
--    person... Type of uniform (Jersey, T-Shirt, Polo Shirt, Longsleeve,
--    Jacket, Custom), Name, Jersey number, Size, Short size, Short name, Price
--    for this row, Notes. After everything is encoded, show a summary: how
--    many of each per size, and the quantity of shorts per size."
--
-- A "project" is an apparel_orders row. This extends that module; it does not
-- build a second order system beside it.
--
-- DECISIONS MADE HERE, all recorded in docs/DECISIONS.md:
--
--   * ROWS OF THE SAME UNIFORM TYPE FORM ONE ITEM. The owner's own suggestion,
--     and it is what keeps everything built on apparel_order_lines working:
--     the production report marks an item, the payment split books an item's
--     money, the printed sheet groups by item, and the calendar counts the
--     pieces. So the encoding table writes one apparel_order_lines row per
--     (uniform type, custom name) and hangs the people off it. Nobody chooses
--     an item any more; it follows from what the rows say.
--
--   * A ROW CARRIES ITS OWN PRICE. `price_centavos` on the person, typed by
--     staff and pre-filled from the price list plus the size add-on. What is
--     SAVED is the figure itself, so next month's price rise cannot rewrite a
--     project the customer already agreed to - the same rule as the size
--     surcharge and the daily rate on a payroll week.
--
--   * A ROW WITH NO PRICE OF ITS OWN FALLS BACK TO WHAT ITS ITEM CHARGES EACH,
--     plus that row's copied size add-on. This is not a nicety: it is exactly
--     the arithmetic every order written before today was totalled with, so
--     those orders still come to the same figure, to the centavo, with no data
--     migration and nothing rewritten. See `rowPrice` in src/lib/uniforms.ts.
--
--   * THE SIX TYPES ARE OUR OWN LIST, so they are fixed here in a check
--     constraint as well as in the code, and a test holds the two together.
--     A typo that invented a seventh type would put people in a column no
--     summary knows how to add up.
--
--   * WHICH BOOK A TYPE'S MONEY LANDS IN IS FIXED IN THE DATABASE TOO
--     (`uniform_income_category` below), not passed in by the caller and not
--     read off the price list. A Server Action is a public endpoint, and the
--     books are not its to choose. Custom books to `other_apparel`, which is a
--     new income category: a custom cap is not a jersey, and filing it as one
--     would quietly overstate the jersey book every time.
--
--   * A SIZE MAY BE LEFT EMPTY while encoding, and so may a name. Twenty-five
--     people are encoded in one sitting and three of them have not said their
--     size yet; refusing to save the other twenty-two is how a list goes back
--     on to paper. `size` therefore loses its NOT NULL. The summary counts
--     those rows in a "Not set" column with a warning rather than guessing.
--
--   * A ROW MAY BE SHORTS ONLY, said explicitly (`upper_included`) rather than
--     inferred from an empty size. Inferring would make "this person's jersey
--     size is not decided yet" and "this person is only getting shorts" the
--     same row, and the summary would be wrong in one of the two directions
--     with nothing to say which.
--
--   * FIFTY PLAIN SHIRTS ARE ONE ROW, not fifty. `quantity` on the person row:
--     one for a person, fifty for a nameless block of one type and size. The
--     summary counts the pieces, so the block is counted honestly without
--     anybody typing fifty empty rows.

-- ---------------------------------------------------------------------------
-- The six uniform types
-- ---------------------------------------------------------------------------

create or replace function public.uniform_income_category(p_type text)
returns text
language sql
immutable
as $$
  select case p_type
    when 'jersey'     then 'sublimation_jerseys'
    when 'tshirt'     then 'shirts'
    when 'polo'       then 'shirts'
    when 'longsleeve' then 'long_sleeves'
    when 'jacket'     then 'jackets'
    when 'custom'     then 'other_apparel'
  end;
$$;

comment on function public.uniform_income_category is
  'Which set of books a uniform type''s money lands in (spec 10.1). Fixed here as well as in src/lib/uniforms.ts, and a unit test fails if the two ever disagree.';

create or replace function public.uniform_type_label(p_type text)
returns text
language sql
immutable
as $$
  select case p_type
    when 'jersey'     then 'Jersey'
    when 'tshirt'     then 'T-shirt'
    when 'polo'       then 'Polo shirt'
    when 'longsleeve' then 'Longsleeve'
    when 'jacket'     then 'Jacket'
    when 'custom'     then 'Custom'
  end;
$$;

comment on function public.uniform_type_label is
  'What a uniform type is called on screen and on the printed sheet.';

-- ---------------------------------------------------------------------------
-- The project's own contact details
-- ---------------------------------------------------------------------------
-- ON THE ORDER, not on the customer record, and never copied between the two.
--
-- A team's contact person is a fact about THIS project: next season it is a
-- different manager, and a project sheet has to say who was actually spoken to
-- when the work was taken in. `customers` still holds the person who pays, and
-- where a project leaves one of these empty the screen shows the linked
-- customer's value clearly labelled as coming from there - shown, never
-- silently copied in, and never written back.
--
-- All four are optional. Only the team name is required to open a project.

alter table public.apparel_orders
  add column if not exists contact_person text,
  add column if not exists contact_number text,
  add column if not exists address text,
  add column if not exists facebook_link text;

comment on column public.apparel_orders.contact_person is
  'Who the shop deals with for THIS project - often the team manager, not the payer.';
comment on column public.apparel_orders.facebook_link is
  'A link to the team or customer page. customers.facebook_name is a NAME; this is the address of a page.';

-- ---------------------------------------------------------------------------
-- Tying the price list to the six types
-- ---------------------------------------------------------------------------
-- Nullable on purpose. The price list is the owner's own words ("Sublimation
-- jersey set"), and guessing which of the six a row means from its name is the
-- sort of confident wrong answer this system does not make. Tagging one is a
-- one-off choice on the price screen; until it is made, the encoding table
-- pre-fills nothing and says so rather than inventing a price.

alter table public.apparel_products
  add column if not exists uniform_type text
    check (uniform_type in ('jersey', 'tshirt', 'polo', 'longsleeve', 'jacket', 'custom'));

comment on column public.apparel_products.uniform_type is
  'Which of the six uniform types this priced item is, so the encoding table can pre-fill a row price. Null means the owner has not tagged it.';

-- ---------------------------------------------------------------------------
-- An item is now a uniform type
-- ---------------------------------------------------------------------------
-- Nullable because every line written before today has no type and none can be
-- invented for it. A null type reads as "not recorded" on screen, with a
-- warning and a way to set it, exactly like every other missing figure.
--
-- `retired_at` is for one narrow case, described on the function below: an item
-- the encoding emptied which cannot simply be deleted because the shop floor
-- has marked its benches. A retired item counts as NOTHING towards the order's
-- total - its pieces are being counted on another item now - and keeping it is
-- what stops those marks being thrown away.

alter table public.apparel_order_lines
  add column if not exists uniform_type text
    check (uniform_type in ('jersey', 'tshirt', 'polo', 'longsleeve', 'jacket', 'custom')),
  add column if not exists custom_type_name text,
  add column if not exists retired_at timestamptz;

comment on column public.apparel_order_lines.uniform_type is
  'One item per uniform type per project. Null on items written before Phase 13 - "not recorded", never guessed.';
comment on column public.apparel_order_lines.retired_at is
  'Set when the encoding emptied this item but its bench marks had to be kept. A retired item adds nothing to the order total.';

-- One item per type per project, so encoding the same type twice cannot
-- produce two items that each hold half the team. Partial, because the items
-- written before today all have a null type and there may be several of them.
create unique index if not exists apparel_order_lines_one_per_type_idx
  on public.apparel_order_lines (
    order_id,
    uniform_type,
    coalesce(lower(btrim(custom_type_name)), '')
  )
  where uniform_type is not null;

-- ---------------------------------------------------------------------------
-- The person: one row per person, which is what the owner asked for
-- ---------------------------------------------------------------------------

alter table public.apparel_order_names
  add column if not exists uniform_type text
    check (uniform_type in ('jersey', 'tshirt', 'polo', 'longsleeve', 'jacket', 'custom')),
  add column if not exists custom_type_name text,
  add column if not exists short_size text
    check (short_size in ('XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL')),
  add column if not exists short_name text,
  add column if not exists price_centavos bigint check (price_centavos >= 0),
  add column if not exists note text,
  add column if not exists quantity integer not null default 1 check (quantity > 0),
  add column if not exists upper_included boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.apparel_order_names.price_centavos is
  'What THIS row costs, one piece. Null falls back to the item''s price each plus this row''s copied size add-on, which is exactly how every order written before Phase 13 was totalled.';
comment on column public.apparel_order_names.quantity is
  'One for a person. More for a nameless block - fifty plain shirts is one row saying fifty, not fifty empty rows.';
comment on column public.apparel_order_names.upper_included is
  'False on a shorts-only row. Said out loud rather than inferred from an empty size, which would make "shorts only" and "size not decided yet" the same row.';

-- A size may now be left empty while encoding (see the header). The check
-- constraint that lists the sizes stays: an empty size is a real state, a
-- misspelled one is a typo nothing could add up.
alter table public.apparel_order_names alter column size drop not null;

do $$
begin
  -- Custom means "type it in", so a custom row without the typed name is a
  -- row nobody can cut or sew from.
  if not exists (
    select 1 from pg_constraint where conname = 'apparel_order_names_custom_needs_name'
  ) then
    alter table public.apparel_order_names
      add constraint apparel_order_names_custom_needs_name
      check (
        uniform_type is distinct from 'custom'
        or nullif(btrim(custom_type_name), '') is not null
      );
  end if;

  -- A row that is neither an upper nor a pair of shorts is nothing at all.
  if not exists (
    select 1 from pg_constraint where conname = 'apparel_order_names_is_something'
  ) then
    alter table public.apparel_order_names
      add constraint apparel_order_names_is_something
      check (upper_included or short_size is not null);
  end if;
end $$;

drop trigger if exists apparel_order_names_touch_updated_at on public.apparel_order_names;
create trigger apparel_order_names_touch_updated_at
  before update on public.apparel_order_names
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- No new table, so no new policy: `apparel_orders`, `apparel_order_lines` and
-- `apparel_order_names` already carry read/insert/update policies with BOTH
-- `using` and `with check`, and a column added to a table is governed by the
-- policies on that table. The same door as the job orders themselves - the
-- `apparel_job_orders` permission, plus Owner and Admin.
--
-- That is an argument, not a proof, so `16_phase13_rls.test.sql` proves it:
-- it reads and writes every new column as five different people and checks
-- that a staff member without the permission sees and writes none of it.

-- ---------------------------------------------------------------------------
-- Saving the encoding, as one transaction
-- ---------------------------------------------------------------------------
-- Thirty people arrive as one Save. Sent as thirty requests, a failure halfway
-- leaves half a team encoded and an item holding nobody - so the whole table
-- goes in and out together, the same instinct as `mark_bill_paid` writing its
-- three rows at once.
--
-- SECURITY INVOKER - the default, and deliberately so. Unlike `complete_sale`
-- or `record_apparel_payment` there is nothing here that the caller may not do
-- for themselves: no ledger, no money, no table with a narrower door. Running
-- as the caller means Row Level Security still decides every row, and this
-- function cannot become a way round it.

create or replace function public.save_apparel_encoding(
  p_order_id uuid,
  -- [{id, uniform_type, custom_type_name, player_name, player_number, size,
  --   short_size, short_name, price_centavos, note, quantity, upper_included}]
  -- in the order they appear on screen.
  p_rows jsonb
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_order public.apparel_orders;
  v_row jsonb;
  v_type text;
  v_custom text;
  v_line_id uuid;
  v_id uuid;
  v_price bigint;
  v_sort integer := 0;
  v_keep uuid[] := '{}';
  v_had_rows uuid[] := '{}';
  -- Which item each person sat on BEFORE this call, as two matching lists.
  -- Needed at the bottom: once the rows have moved, nothing else remembers
  -- where they came from.
  v_was_row uuid[] := '{}';
  v_was_line uuid[] := '{}';
  v_inserted integer := 0;
  v_updated integer := 0;
  v_deleted integer := 0;
  v_lines_added integer := 0;
  v_lines_removed integer := 0;
  v_lines_retired integer := 0;
  v_empty uuid;
  v_moved_to uuid;
begin
  select * into v_order from public.apparel_orders where id = p_order_id for update;
  if not found then
    raise exception 'That project could not be found.';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'That project was cancelled, so its people cannot be changed.';
  end if;

  -- Which items hold people right now. Anything in here that ends the call
  -- holding nobody was emptied BY this call and is dealt with at the bottom;
  -- an item that held nobody to begin with is a plain block of pieces with no
  -- names, and is none of this function's business.
  select
    coalesce(array_agg(distinct n.line_id), '{}'),
    coalesce(array_agg(n.id), '{}'),
    coalesce(array_agg(n.line_id), '{}')
  into v_had_rows, v_was_row, v_was_line
  from public.apparel_order_names n
  join public.apparel_order_lines l on l.id = n.line_id
  where l.order_id = p_order_id;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_sort := v_sort + 1;

    v_type := nullif(btrim(v_row ->> 'uniform_type'), '');
    v_custom := nullif(btrim(v_row ->> 'custom_type_name'), '');

    if v_type is null then
      raise exception 'Row % has no type of uniform.', v_sort;
    end if;
    if public.uniform_type_label(v_type) is null then
      raise exception 'Row % has a type of uniform this system does not know.', v_sort;
    end if;
    if v_type = 'custom' and v_custom is null then
      raise exception 'Row % is Custom, so the uniform type has to be typed in.', v_sort;
    end if;
    if v_type <> 'custom' then
      v_custom := null;
    end if;

    -- The item this person belongs to: one per (type, custom name).
    select id into v_line_id
    from public.apparel_order_lines
    where order_id = p_order_id
      and uniform_type = v_type
      and coalesce(lower(btrim(custom_type_name)), '') = coalesce(lower(v_custom), '')
    limit 1;

    if v_line_id is null then
      insert into public.apparel_order_lines (
        order_id, name, uniform_type, custom_type_name,
        unit_price_centavos, quantity, income_category, created_by
      )
      values (
        p_order_id,
        coalesce(v_custom, public.uniform_type_label(v_type)),
        v_type,
        v_custom,
        -- Zero, because the money is on the rows now. A row with no price of
        -- its own then falls back to zero and is warned about rather than
        -- quietly picking up somebody else's figure.
        0,
        1,
        public.uniform_income_category(v_type),
        auth.uid()
      )
      returning id into v_line_id;
      v_lines_added := v_lines_added + 1;
    end if;

    v_price := nullif(v_row ->> 'price_centavos', '')::bigint;
    v_id := nullif(v_row ->> 'id', '')::uuid;

    if v_id is null then
      insert into public.apparel_order_names (
        line_id, player_name, player_number, size, size_extra_centavos,
        uniform_type, custom_type_name, short_size, short_name,
        price_centavos, note, quantity, upper_included, sort_order, created_by
      )
      values (
        v_line_id,
        nullif(btrim(v_row ->> 'player_name'), ''),
        nullif(btrim(v_row ->> 'player_number'), ''),
        nullif(btrim(v_row ->> 'size'), ''),
        -- Zero, not the size ladder's figure: the price typed on the row is
        -- the whole of what this person costs, add-on included. The column
        -- stays for the rows written before Phase 13, which are totalled with
        -- it.
        0,
        v_type,
        v_custom,
        nullif(btrim(v_row ->> 'short_size'), ''),
        nullif(btrim(v_row ->> 'short_name'), ''),
        v_price,
        nullif(btrim(v_row ->> 'note'), ''),
        coalesce(nullif(v_row ->> 'quantity', '')::integer, 1),
        coalesce((v_row ->> 'upper_included')::boolean, true),
        v_sort,
        auth.uid()
      )
      returning id into v_id;
      v_inserted := v_inserted + 1;
    else
      update public.apparel_order_names set
        line_id = v_line_id,
        player_name = nullif(btrim(v_row ->> 'player_name'), ''),
        player_number = nullif(btrim(v_row ->> 'player_number'), ''),
        size = nullif(btrim(v_row ->> 'size'), ''),
        uniform_type = v_type,
        custom_type_name = v_custom,
        short_size = nullif(btrim(v_row ->> 'short_size'), ''),
        short_name = nullif(btrim(v_row ->> 'short_name'), ''),
        price_centavos = v_price,
        note = nullif(btrim(v_row ->> 'note'), ''),
        quantity = coalesce(nullif(v_row ->> 'quantity', '')::integer, 1),
        upper_included = coalesce((v_row ->> 'upper_included')::boolean, true),
        sort_order = v_sort
        -- size_extra_centavos is deliberately NOT touched. On a row written
        -- before Phase 13 it is half of what that row costs, and rewriting it
        -- would change a total the customer already agreed to.
      where id = v_id
        and line_id in (select id from public.apparel_order_lines where order_id = p_order_id);

      if not found then
        raise exception 'One of the rows being edited is no longer on this project. Reload and try again.';
      end if;
      v_updated := v_updated + 1;
    end if;

    v_keep := v_keep || v_id;
  end loop;

  -- Rows taken off the table. A person removed from a team sheet is removed:
  -- this is not money, and nobody is holding a receipt for it. What is kept is
  -- the audit log, which the app writes with the before and after values.
  with gone as (
    delete from public.apparel_order_names n
    using public.apparel_order_lines l
    where n.line_id = l.id
      and l.order_id = p_order_id
      and not (n.id = any(v_keep))
    returning n.id
  )
  select count(*) into v_deleted from gone;

  -- Items this call emptied.
  for v_empty in
    select l.id
    from public.apparel_order_lines l
    where l.order_id = p_order_id
      and l.retired_at is null
      and (l.uniform_type is not null or l.id = any(v_had_rows))
      and not exists (select 1 from public.apparel_order_names n where n.line_id = l.id)
  loop
    if not exists (
      select 1 from public.apparel_production_steps s where s.line_id = v_empty
    ) then
      delete from public.apparel_order_lines where id = v_empty;
      v_lines_removed := v_lines_removed + 1;
    else
      /*
        The item has bench marks on it, so it cannot simply be deleted - the
        marks would go with it (`on delete cascade`) and the shop floor would
        lose its place.

        If every one of its people moved to ONE item, the marks follow them:
        it is the same batch under a new heading. If they scattered across
        several, there is no single item the marks belong to any more, so the
        item is RETIRED instead - it counts as nothing towards the total,
        because its pieces are counted elsewhere now, and its marks are kept.
      */
      -- `(array_agg(distinct ...))[1]` rather than `min()`, which PostgreSQL
      -- does not define for a uuid.
      select case
               when count(distinct n.line_id) = 1
               then (array_agg(distinct n.line_id))[1]
             end
      into v_moved_to
      from public.apparel_order_names n
      where n.id in (
        select v_was_row[i]
        from generate_subscripts(v_was_row, 1) as i
        where v_was_line[i] = v_empty
      );

      if v_moved_to is not null then
        insert into public.apparel_production_steps (line_id, stage, created_at, created_by)
        select v_moved_to, s.stage, s.created_at, s.created_by
        from public.apparel_production_steps s
        where s.line_id = v_empty
        on conflict (line_id, stage) do nothing;

        delete from public.apparel_order_lines where id = v_empty;
        v_lines_removed := v_lines_removed + 1;
      else
        update public.apparel_order_lines
        set retired_at = now()
        where id = v_empty and retired_at is null;
        v_lines_retired := v_lines_retired + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'rows_added', v_inserted,
    'rows_updated', v_updated,
    'rows_removed', v_deleted,
    'items_added', v_lines_added,
    'items_removed', v_lines_removed,
    'items_retired', v_lines_retired
  );
end;
$$;

comment on function public.save_apparel_encoding is
  'Saves a project''s whole encoding table in one transaction: the people, the items their uniform types imply, and the tidying up of an item nobody is left on. SECURITY INVOKER, so Row Level Security still decides every row.';
