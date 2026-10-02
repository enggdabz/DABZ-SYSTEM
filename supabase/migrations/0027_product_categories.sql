-- Categories for the Counter's products (the owner's request, 2 Oct 2026).
--
-- The owner names them - "ID photo", "Printing", "Xerox" - and each product
-- can sit in one, or in none. On the Counter they become buttons above the
-- product list that show only that category's rows.
--
-- Why a table of their own rather than the old `products.section` text:
-- `section` is a fixed list of four the code invented (printing, photocopy,
-- souvenirs, other), and the owner's categories are theirs to name. A row per
-- category also means renaming one renames it on every product at once, and
-- two spellings of the same name cannot drift apart.
--
-- Nothing here touches money. A sale line keeps its own copy of the product's
-- name and price, and does not record a category at all.

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null
    check (length(btrim(name)) > 0 and length(name) <= 60),
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.product_categories is
  'Owner-named categories for the Counter''s products. A product points at one, or at none.';

-- "Xerox" and "xerox " are the same category: one button, not two.
create unique index if not exists product_categories_name_unique
  on public.product_categories (lower(btrim(name)));

alter table public.products
  add column if not exists category_id uuid
    references public.product_categories (id) on delete set null;

comment on column public.products.category_id is
  'The owner''s category for this product (0027). Null: no category. Deleting the category leaves the product in none.';

create index if not exists products_category_idx on public.products (category_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Everybody signed in reads them, because the Counter shows them to staff.
-- Only Owner/Admin create, rename or delete one - the same people who edit
-- products (spec 7.2). Every write policy has both `using` and `with check`.
--
-- Deleting a category is allowed outright: it is a label, not a record of
-- money, and its products simply go back to having none (`on delete set null`).

alter table public.product_categories enable row level security;

drop policy if exists product_categories_read on public.product_categories;
create policy product_categories_read on public.product_categories
  for select using (public.current_role_name() is not null);

drop policy if exists product_categories_insert on public.product_categories;
create policy product_categories_insert on public.product_categories
  for insert with check (public.is_owner_or_admin());

drop policy if exists product_categories_update on public.product_categories;
create policy product_categories_update on public.product_categories
  for update
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

drop policy if exists product_categories_delete on public.product_categories;
create policy product_categories_delete on public.product_categories
  for delete using (public.is_owner_or_admin());
