-- Put a product's photos in the order the owner wants them
-- (docs/progress.md, "If you are picking this up next", item 3).
--
-- WHY THIS NEEDS A FUNCTION AT ALL
--
-- The first photo is the picture on the product card, on the shop and in the
-- admin list - `product.images[0]`. Until now the only way to change which one
-- that was, was to REMOVE the photos in front of it and upload them again,
-- which also throws away the files and the alt text. That is a bad answer to
-- "use the other picture".
--
-- Reordering is a renumber of `sort_order` across several rows at once, and
-- several rows at once through PostgREST is several REQUESTS: if the third one
-- fails, the photos are left in an order nobody chose. The scramble is only
-- cosmetic - no money, no history - but it is still a screen telling the owner
-- something they did not ask for, so it goes in one statement inside one
-- transaction, the same shape as `save_apparel_encoding` in `0019`.
--
-- SECURITY INVOKER, WHICH IS THE DEFAULT AND IS THE POINT
--
-- This function is deliberately NOT `security definer`. There is nothing here
-- that RLS gets in the way of: `online_product_images_write` in `0020` already
-- says Owner/Admin may write, with both `using` and `with check`, and running
-- as the caller means that policy is still the thing that decides. A
-- `security definer` here would be a second answer to a question `0020` has
-- already answered - and PostgREST publishes every function as a URL, so it
-- would be a way for a staff member to rearrange the shop front.
--
-- Because the policy refuses rather than errors, an UPDATE by somebody without
-- permission touches no rows and raises nothing. So the row count is checked
-- against what was asked for, and anything short raises - otherwise the screen
-- would report a new order that the database never accepted.

create or replace function public.reorder_online_product_images(
  p_product_id uuid,
  -- Every one of that product's photo ids, in the order they should appear.
  p_image_ids uuid[]
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_asked integer;
  v_distinct integer;
  v_has integer;
  v_matched integer;
  v_updated integer;
begin
  if p_product_id is null or p_image_ids is null then
    raise exception 'A product and its photos are both needed to set an order.'
      using errcode = 'P0001';
  end if;

  v_asked := cardinality(p_image_ids);
  if v_asked = 0 then
    raise exception 'No photos were given to put in order.'
      using errcode = 'P0001';
  end if;

  select count(distinct id) into v_distinct from unnest(p_image_ids) as id;
  if v_distinct <> v_asked then
    raise exception 'The same photo was listed more than once.'
      using errcode = 'P0001';
  end if;

  /*
    The WHOLE list, not a subset. A partial list would leave the photos it
    left out sitting at whatever number they had, interleaved with the new
    ones - an order that is neither the old one nor the one that was asked
    for. Counting both ways also catches a photo from a DIFFERENT product
    being smuggled in: it would not be in `v_matched`.
  */
  select count(*) into v_has
    from public.online_product_images
   where product_id = p_product_id;

  select count(*) into v_matched
    from public.online_product_images
   where product_id = p_product_id and id = any (p_image_ids);

  if v_has <> v_asked or v_matched <> v_asked then
    raise exception 'That is not this product''s list of photos. Reload the page and try again.'
      using errcode = 'P0001';
  end if;

  update public.online_product_images as i
     set sort_order = listed.ord - 1
    from unnest(p_image_ids) with ordinality as listed (image_id, ord)
   where i.id = listed.image_id
     and i.product_id = p_product_id;

  get diagnostics v_updated = row_count;

  /*
    A policy that refuses removes the row from the update quietly. Without
    this the screen would redraw in the new order and the shop would still be
    showing the old one.
  */
  if v_updated <> v_asked then
    raise exception 'You do not have permission to change this product''s photos.'
      using errcode = 'P0001';
  end if;

  return v_updated;
end;
$$;

comment on function public.reorder_online_product_images(uuid, uuid[]) is
  'Renumbers a product''s photos to the given order, in one transaction. Runs as the caller, so online_product_images_write decides.';
