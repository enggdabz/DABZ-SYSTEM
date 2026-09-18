-- Phase 9: the public page and customer enquiries (spec 16, phase 9).
--
-- WHAT THIS PHASE IS, AND IS NOT
--
-- It is the page a customer lands on from Facebook, and a form they can send
-- from it. Both work with nothing but this migration.
--
-- It is NOT the Messenger API, Meta Ads tracking or a chatbot. Those need a
-- Meta app, a page access token and Meta's own app review - credentials that
-- belong to the owner and that no system should create on their behalf. What
-- is built instead is the credential-free half that does the same job: a
-- Message-us link that opens Messenger directly, and a "where did you hear
-- about us" on the enquiry form, so an advert can be judged by the enquiries
-- it actually produced.
--
-- DECISIONS MADE HERE, recorded in docs/DECISIONS.md:
--   * The shop's address, phone, opening hours and Facebook page are SETTINGS,
--     all starting empty. They are facts only the owner knows, so the public
--     page shows what is filled in and silently leaves out what is not - it
--     never prints a placeholder address to a real customer.
--   * `enquiries` has NO insert policy for the public. The one public write in
--     this system goes through a Server Action using the service-role client,
--     which validates and rate-limits it first. An open insert policy on a
--     public table is a spam target with no way to close it afterwards.

-- ---------------------------------------------------------------------------
-- The shop's own details (all empty until the owner fills them in)
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists shop_address text,
  add column if not exists shop_phone text,
  add column if not exists shop_email text,
  add column if not exists facebook_page_url text,
  add column if not exists messenger_username text,
  add column if not exists map_url text,
  add column if not exists public_page_enabled boolean not null default true,
  add column if not exists public_opening_hours text;

comment on column public.app_settings.shop_address is
  'Printed on the public page and nowhere else. Null means the page leaves it out rather than printing a guess.';

comment on column public.app_settings.messenger_username is
  'The m.me name, so the public page can link straight into Messenger. No Meta app or token is involved.';

comment on column public.app_settings.public_page_enabled is
  'False takes the public page down without removing anything. Staff sign-in is unaffected either way.';

-- ---------------------------------------------------------------------------
-- Enquiries (the one thing a stranger may send into this system)
-- ---------------------------------------------------------------------------

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  contact text not null,
  -- Which division they are asking about, or null for a general question.
  division text
    check (division is null or division in ('printshoppe', 'apparel', 'dabztech')),
  message text not null,

  /*
    Where they came from - "Facebook", "walked past", "a friend". Typed by the
    customer, not detected. It is the credential-free way to judge an advert:
    Meta Ads tracking needs a Meta app and a token, but a customer saying
    "I saw your Facebook ad" needs neither and is better evidence anyway.
  */
  heard_from text,

  status text not null default 'new'
    check (status in ('new', 'replied', 'closed')),
  reply_note text,
  handled_by uuid,
  handled_at timestamptz,

  -- Kept for rate limiting only, the same as login_events does.
  ip_address text,

  created_at timestamptz not null default now()
);

comment on table public.enquiries is
  'Messages sent from the public page. Written only by the server, after validation and rate limiting - there is no public insert policy.';

create index if not exists enquiries_status_idx
  on public.enquiries (status, created_at desc);
create index if not exists enquiries_rate_idx
  on public.enquiries (ip_address, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.enquiries enable row level security;

-- Owner/Admin read and answer them. Enquiries carry a stranger's name and
-- phone number, so they are not staff-wide reading.
drop policy if exists enquiries_read on public.enquiries;
create policy enquiries_read on public.enquiries
  for select using (public.is_owner_or_admin());

drop policy if exists enquiries_update on public.enquiries;
create policy enquiries_update on public.enquiries
  for update
  using (public.is_owner_or_admin())
  with check (public.is_owner_or_admin());

/*
  NO INSERT POLICY, ON PURPOSE - not for anon, not for authenticated.

  This is the only table in the system a stranger can cause a row in, and an
  insert policy open enough to allow that is open enough to be filled with
  rubbish by anyone who finds the endpoint. So the write goes through a Server
  Action using the service-role client, which checks the length of every field,
  drops anything that fills the honeypot, and refuses more than a handful of
  enquiries an hour from the same address. The table itself stays shut.
*/

-- No delete policy either: an enquiry is closed, not erased, so a customer who
-- says "I called last week" can be checked.
