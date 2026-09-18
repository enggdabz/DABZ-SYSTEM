-- Security tests for Phase 9: the public page and customer enquiries.
--
-- This phase is the only one where a stranger causes a row to exist. So the
-- thing being proved here is a NEGATIVE: that the `enquiries` table has no way
-- in from the browser at all - not for the public, not for staff, not for the
-- owner. The single way in is the Server Action, which validates and rate
-- limits first and then writes with the service-role key, exactly as sign-in
-- does before anyone is signed in.
--
-- The second thing proved is that nothing about the shop was invented: the new
-- public-page settings all start empty, because an address, a phone number and
-- opening hours are facts only the owner knows - and this page is read by real
-- people who might drive to it.

\set ON_ERROR_STOP on

set role authenticated;

-- ---- The shop's own details start empty ----------------------------------
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  v_settings public.app_settings%rowtype;
begin
  raise notice '--- phase 9: nothing about the shop was invented ---';

  select * into v_settings from public.app_settings limit 1;

  if v_settings.shop_address is not null
     or v_settings.shop_phone is not null
     or v_settings.shop_email is not null
     or v_settings.facebook_page_url is not null
     or v_settings.messenger_username is not null
     or v_settings.map_url is not null
     or v_settings.public_opening_hours is not null then
    raise exception 'FAIL: a detail only the owner can know was filled in for them';
  end if;
  raise notice 'PASS: address, phone, hours and Facebook page all start empty';

  -- The page itself is on by default; it simply shows less until it is filled
  -- in. Off by default would mean the shop had a public page nobody could see
  -- and no reason to look for the switch.
  if v_settings.public_page_enabled is not true then
    raise exception 'FAIL: the public page is off by default';
  end if;
  raise notice 'PASS: the public page is on, and shows only what is filled in';
end;
$$;

-- ---- No way in from the browser, for anyone ------------------------------
do $$
declare
  v_policy text;
begin
  raise notice '--- phase 9: enquiries cannot be written from the browser ---';

  select policyname into v_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'enquiries'
    and cmd in ('INSERT', 'DELETE')
  limit 1;

  if v_policy is not null then
    raise exception
      'FAIL: enquiries has a % policy - the public write must stay server-only', v_policy;
  end if;
  raise notice 'PASS: enquiries has no insert or delete policy at all';

  -- And the privilege layer agrees, for the owner as much as for anyone.
  begin
    insert into public.enquiries (name, contact, message)
    values ('Forged', '09170000000', 'Sent from a browser');
    raise exception 'FAIL: the owner could add an enquiry from the app';
  exception when insufficient_privilege then
    raise notice 'PASS: nobody can add an enquiry from the app, not even the owner';
  end;
end;
$$;

-- The server's own write, which is what the Server Action does with the
-- service-role key after checking every field and the rate limit.
reset role;
insert into public.enquiries (name, contact, division, message, heard_from, ip_address)
values
  ('Grace Tan', '09171234567', 'apparel',
   'Do you make 15 jerseys for a tournament on the 30th?', 'Facebook', '203.0.113.5'),
  ('Ramon Lim', 'ramon@example.com', null,
   'How much to laminate 50 IDs?', 'walked past', '203.0.113.9');
set role authenticated;

-- ---- Who may read one ----------------------------------------------------
-- An enquiry carries a stranger's name and phone number, so it is not
-- staff-wide reading. Juan is staff with several permissions from earlier
-- phases, and none of them reaches this.
set test.user_id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  raise notice '--- phase 9: who may read an enquiry ---';

  if (select count(*) from public.enquiries) <> 0 then
    raise exception 'FAIL: staff could read a customer''s name and phone number';
  end if;
  raise notice 'PASS: staff see no enquiries at all';

  -- Nor answer one: the update policy does not match them, so it quietly
  -- affects no rows rather than erroring.
  update public.enquiries set status = 'closed';
  if (select count(*) from public.enquiries where status = 'closed') <> 0 then
    raise exception 'FAIL: staff closed an enquiry';
  end if;
  raise notice 'PASS: staff cannot answer or close one either';
end;
$$;

-- A visitor to the public page is nobody at all: no session, no profile.
set role anon;
set test.user_id = '';
do $$
begin
  if (select count(*) from public.enquiries) <> 0 then
    raise exception 'FAIL: a stranger could read the enquiries other people sent';
  end if;
  raise notice 'PASS: a visitor cannot read back what anyone sent';
end;
$$;

set role authenticated;

-- ---- The owner and admins ------------------------------------------------
set test.user_id = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_id uuid;
begin
  raise notice '--- phase 9: answering an enquiry ---';

  if (select count(*) from public.enquiries) <> 2 then
    raise exception 'FAIL: an admin could not read the enquiries';
  end if;
  raise notice 'PASS: an admin reads them';

  select id into v_id from public.enquiries where name = 'Grace Tan';

  update public.enquiries
     set status = 'replied',
         reply_note = 'Quoted her on Messenger, confirming Friday',
         handled_by = auth.uid(),
         handled_at = now()
   where id = v_id;

  if (select status from public.enquiries where id = v_id) <> 'replied' then
    raise exception 'FAIL: an admin could not answer an enquiry';
  end if;
  raise notice 'PASS: an admin can answer one';

  -- Closed rather than erased, so "I messaged you last week" can be checked.
  delete from public.enquiries where id = v_id;
  if (select count(*) from public.enquiries where id = v_id) <> 1 then
    raise exception 'FAIL: an enquiry was deleted';
  end if;
  raise notice 'PASS: an enquiry is closed, never deleted';

  -- Only the three states exist. A free-text status would grow into six
  -- spellings of "done" inside a month.
  begin
    update public.enquiries set status = 'sort of handled' where id = v_id;
    raise exception 'FAIL: an enquiry was set to a status that does not exist';
  exception when check_violation then
    raise notice 'PASS: an enquiry is new, replied or closed, and nothing else';
  end;

  -- The division is one of the three, or nothing at all for a general
  -- question. It is never free text a report would have to guess at.
  begin
    update public.enquiries set division = 'catering' where id = v_id;
    raise exception 'FAIL: an enquiry was tagged to a division that does not exist';
  exception when check_violation then
    raise notice 'PASS: an enquiry belongs to one of the three divisions, or none';
  end;
end;
$$;

set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  if (select count(*) from public.enquiries) <> 2 then
    raise exception 'FAIL: the owner could not read the enquiries';
  end if;
  raise notice 'PASS: the owner reads them too';
  raise notice 'ALL PHASE 9 TESTS PASSED';
end;
$$;

reset role;
