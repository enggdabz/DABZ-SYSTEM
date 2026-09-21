-- Phase 11: the shop's warnings, on the owner's phone.
--
-- Everything this sends already exists inside the app - a bill due in five
-- days, stock below its reorder level, a unit nobody has collected, a customer
-- message with no reply. The only thing wrong with them is that they are
-- invisible unless somebody opens a screen.
--
-- WHAT THIS ADDS
-- One table. A browser that has been granted permission hands the app a push
-- SUBSCRIPTION - a URL at Google's or Apple's push service, plus two keys that
-- encrypt the payload so only that browser can read it - and this is where
-- those are kept. Nothing else about a notification is stored: the digest is
-- assembled from the same rows the screens read, every time, so it can never
-- fall out of step with them (the same reasoning as Phase 8's reports and
-- Phase 10's collections feed).
--
-- WHO GETS THEM
-- Owner and Admin only. Every figure a digest can carry - money owed, stock,
-- an unclaimed unit, a stranger's message - is Owner/Admin material under
-- spec 4.3, and a notification is just another screen that happens to arrive
-- on its own. So the insert policy refuses anybody else, and nothing in the
-- app offers a staff account the button.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  /*
    The push service's URL for this browser. Unique, because re-subscribing
    the same browser must update the row rather than collect duplicates - and
    a person who has enabled notifications twice should not get everything
    twice.
  */
  endpoint text not null unique,

  -- The browser's own keys. The payload is encrypted with these before it
  -- leaves us, so Google and Apple carry the notification without being able
  -- to read a peso of it.
  p256dh text not null,
  auth text not null,

  -- Which phone this is, so a person with two can tell them apart when
  -- turning one off. Whatever the browser reports; never parsed.
  user_agent text,

  /*
    The Manila date of the last daily digest sent to this browser.

    This, not the cron's schedule, is what stops a second digest going out:
    the job may run more than once a day, or be re-run by hand, and a shop
    owner who gets the same summary three times learns to ignore all three.
    Null means one has never been sent.
  */
  last_digest_on date,

  /*
    A push service answers 404 or 410 when a browser has been uninstalled or
    the permission revoked. That is not an error worth retrying - it means the
    subscription is dead - so the sender switches it off rather than deleting
    it, and `last_error` says why it stopped. Deleting would lose the fact
    that this phone was once set up, which is the first question asked when
    somebody says "I stopped getting them".
  */
  active boolean not null default true,
  last_error text,
  failure_count integer not null default 0 check (failure_count >= 0),

  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.push_subscriptions is
  'One row per browser that has agreed to receive notifications. Owner/Admin only; the payload is encrypted with p256dh/auth before it leaves us.';

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id, active);

-- The digest job walks the active subscriptions that have not had one today.
create index if not exists push_subscriptions_due_idx
  on public.push_subscriptions (active, last_digest_on);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.push_subscriptions enable row level security;

/*
  A person sees, and manages, only their own.

  Not "Owner/Admin see everything": an endpoint is a device, and one admin
  reading another's device list is a privacy question with no upside. The
  digest job does not go through these policies at all - it runs as nobody,
  from a cron, with the service-role key, exactly as sign-in and the public
  page already do (AGENTS.md lists all three).

  `current_role_name()` rather than a bare `user_id = auth.uid()`: a
  deactivated account has to stop reading immediately, which is the hole
  `0015` closed on `sales_read_own`. Same rule, applied when the table is
  written rather than a phase later.
*/
drop policy if exists push_subscriptions_read_own on public.push_subscriptions;
create policy push_subscriptions_read_own on public.push_subscriptions
  for select using (
    user_id = auth.uid() and public.current_role_name() is not null
  );

/*
  Only an Owner or Admin may subscribe, and only for themselves.

  `with check` carries the `user_id = auth.uid()` as well as the `using`
  clause below it, so nobody can register a device against somebody else's
  account and receive their shop's figures - the same reason every write
  policy in this system has both.
*/
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert with check (
    user_id = auth.uid() and public.is_owner_or_admin()
  );

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions
  for update
  using (user_id = auth.uid() and public.is_owner_or_admin())
  with check (user_id = auth.uid() and public.is_owner_or_admin());

/*
  Turning notifications off on a phone DELETES the row, and that is the one
  place in this system where deleting is right: a push subscription is not a
  money record, it is a standing permission, and a permission that has been
  withdrawn should leave nothing behind that could still be sent to.
*/
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete using (
    user_id = auth.uid() and public.current_role_name() is not null
  );
