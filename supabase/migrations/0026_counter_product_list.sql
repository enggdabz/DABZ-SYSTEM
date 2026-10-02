-- The Counter's product list: a photo per product, and an order the owner
-- chooses by dragging (the owner's request, 2 Oct 2026).
--
-- Two things, and neither touches money:
--
--   1. `products.image_path` - where the product's photo sits in the
--      `product-images` bucket (0020), under `counter/`. Optional; null shows
--      a placeholder. The same bucket and the same write policy as the online
--      shop's product photos, so no storage rule is widened here: Owner/Admin
--      put pictures up and take them down.
--
--   2. `reorder_products(ids)` - saves a whole new order in ONE statement.
--      Dragging one row moves the positions of every row between where it was
--      and where it landed, and doing that as a request per row would leave
--      the list half reordered for whoever loads the counter in between - or
--      for ever, if one of those requests failed.
--
-- `sort_order` already exists (0005). Nothing about a sale reads it.

alter table public.products
  add column if not exists image_path text;

comment on column public.products.image_path is
  'Path of the product photo in the product-images bucket (counter/...). Null shows a placeholder on the Counter.';

/*
  SECURITY INVOKER (the default) on purpose: the update below goes through the
  ordinary `products_update` policy, so Row Level Security still decides who
  may move a product. The role check at the top only turns the refusal into a
  sentence - without it a staff member's reorder would update NO rows and say
  nothing, which is the "delete that matches nothing" trap 0011 warns about.

  Positions are written as 1, 2, 3... for the ids given. Products not in the
  list (hidden ones) keep whatever they had: the Counter only shows the active
  products, so those are the ones a drag is about.
*/
create or replace function public.reorder_products(p_ids uuid[])
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if not public.is_owner_or_admin() then
    raise exception 'Only the owner or an admin can change the order of the products.'
      using errcode = '42501';
  end if;

  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;

  -- `sort_order` is a smallint. A shop with 32,000 counter products has a
  -- different problem; refusing is better than wrapping round.
  if cardinality(p_ids) > 32000 then
    raise exception 'Too many products to put in order at once.' using errcode = 'P0001';
  end if;

  if (select count(distinct id) from unnest(p_ids) as t(id)) <> cardinality(p_ids) then
    raise exception 'The same product appears twice in the new order.' using errcode = 'P0001';
  end if;

  update public.products p
     set sort_order = o.position::smallint
    from unnest(p_ids) with ordinality as o(id, position)
   where p.id = o.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.reorder_products(uuid[]) is
  'Puts the given products in that order (1, 2, 3...) in one statement. Owner/Admin only, through the ordinary update policy.';

revoke all on function public.reorder_products(uuid[]) from public;
grant execute on function public.reorder_products(uuid[]) to authenticated;
