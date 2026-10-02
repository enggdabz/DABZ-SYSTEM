-- The owner's categories in an order the owner chooses (the owner's request,
-- 2 Oct 2026: "the category should also be movable").
--
-- 0027 listed categories by name. This gives each one a position, so the red
-- headers on the Counter can be dragged into the order the shop sells in -
-- the busiest category at the top - the same way products already are.
--
-- Nothing here touches money.

alter table public.product_categories
  add column if not exists sort_order integer not null default 0;

comment on column public.product_categories.sort_order is
  'Position of the category on the Counter (0028), 1 at the top. Ties fall back to the name.';

-- The categories that already exist keep the order they were shown in until
-- now - by name - so nothing jumps about on the day this arrives.
update public.product_categories c
   set sort_order = ordered.position
  from (
    select id, row_number() over (order by lower(btrim(name)), id) as position
      from public.product_categories
  ) as ordered
 where c.id = ordered.id
   and c.sort_order = 0;

/*
  Saves a whole new order in ONE statement, for the reason 0026 gives for
  products: moving one category moves the positions of every category between
  where it was and where it landed, and a request per row could leave the list
  half reordered.

  SECURITY INVOKER (the default), like reorder_products: the update runs under
  the ordinary `product_categories_update` policy, so Row Level Security still
  decides who may move one. The role check at the top only turns the refusal
  into a sentence instead of a silent "nothing changed".
*/
create or replace function public.reorder_product_categories(p_ids uuid[])
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if not public.is_owner_or_admin() then
    raise exception 'Only the owner or an admin can change the order of the categories.'
      using errcode = '42501';
  end if;

  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;

  if (select count(distinct id) from unnest(p_ids) as t(id)) <> cardinality(p_ids) then
    raise exception 'The same category appears twice in the new order.' using errcode = 'P0001';
  end if;

  update public.product_categories c
     set sort_order = o.position
    from unnest(p_ids) with ordinality as o(id, position)
   where c.id = o.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.reorder_product_categories(uuid[]) is
  'Puts the given categories in that order (1, 2, 3...) in one statement. Owner/Admin only, through the ordinary update policy.';

revoke all on function public.reorder_product_categories(uuid[]) from public;
grant execute on function public.reorder_product_categories(uuid[]) to authenticated;
