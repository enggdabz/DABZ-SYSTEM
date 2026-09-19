-- Test fixtures: a catalogue for the security tests to work on.
--
-- Migrations 0002 and 0005 used to ship a catalogue of their own - eleven
-- bills, six loans and eleven counter buttons taken from the specification -
-- and the tests in 04 and 06 were written against it. Migration 0011 clears
-- that catalogue, because the owner enters their own (see the note at the top
-- of that file), which leaves those tests with nothing to read.
--
-- So the rows move here. That is where they belonged in the first place: what
-- 04 and 06 actually prove is that a staff account sees NONE of these rows and
-- an Owner/Admin sees ALL of them, and a test that needs rows to exist should
-- create them rather than hoping a migration left some behind.
--
-- Nothing in the app reads this file. It runs after the migrations and before
-- the tests, as the migration role, so Row Level Security does not apply to
-- the inserts themselves.
--
-- Keep it in step with the counts the tests assert: 11 bills, 6 loans, 11
-- products, of which 6 have a price. Every due day and every interest rate is
-- deliberately null - the tests check that too, because a null there is a real
-- state the screens have to handle, not an oversight.

-- ---- Loans ---------------------------------------------------------------

insert into public.loans (lender, statement_balance_centavos, statement_date, monthly_payment_centavos, note)
values
  ('Lupa',           45000000::bigint, current_date, 2000000::bigint, 'Fixture.'),
  ('BPI',            30000000::bigint, current_date, 3325000::bigint, 'Fixture.'),
  ('Credit card 3',  50000000::bigint, current_date, 1200000::bigint, 'Fixture.'),
  ('Cenpelco',        5000000::bigint, current_date, null::bigint,    'Fixture with no monthly payment.'),
  ('Credit card 2',   1913700::bigint, current_date, null::bigint,    'Fixture.'),
  ('Credit card 1',   1712700::bigint, current_date, null::bigint,    'Fixture.');

-- ---- Bills ---------------------------------------------------------------
-- Three of them are installments pointing at a loan, which is what the
-- "paying this bill also pays the loan down" test needs.

insert into public.bills (name, amount_centavos, type, loan_id, note)
select
  seed.name,
  seed.amount_centavos,
  seed.type,
  (select l.id from public.loans l where l.lender = seed.lender_name),
  seed.note
from (values
  ('Electricity',     3500000::bigint, 'operating',         null,             null),
  ('Water',            150000::bigint, 'operating',         null,             null),
  ('Internet',         210000::bigint, 'operating',         null,             null),
  ('Magic Payment',    167700::bigint, 'operating',         null,             null),
  ('BIR',              150000::bigint, 'operating',         null,             null),
  ('Rent',            2000000::bigint, 'operating',         null,             null),
  ('CP Plan',          450000::bigint, 'operating',         null,             null),
  ('Lupa Lilimasan',  2000000::bigint, 'loan_installment',  'Lupa',           null),
  ('BPI',             3325000::bigint, 'loan_installment',  'BPI',            null),
  ('Credit card',     1200000::bigint, 'loan_installment',  'Credit card 3',  null),
  ('Forests Lake',     960000::bigint, 'loan_installment',  null,             null)
) as seed(name, amount_centavos, type, lender_name, note);

-- ---- Products ------------------------------------------------------------
-- Six priced, five that ask at the counter. 06 checks both numbers, and uses
-- 'Photocopy' at 300 centavos for the "staff cannot reprice" test.

insert into public.products (name, division, price_centavos, manual_price, unit, section, sort_order, income_category)
values
  ('Print, black & white',        'printshoppe',  300::bigint, false, 'page',  'printing',  10::smallint, 'document_printing'),
  ('Print, colored - light',      'printshoppe',  500::bigint, false, 'page',  'printing',  20::smallint, 'document_printing'),
  ('Print, colored - medium',     'printshoppe',  800::bigint, false, 'page',  'printing',  30::smallint, 'document_printing'),
  ('Print, colored - heavy',      'printshoppe', 1000::bigint, false, 'page',  'printing',  40::smallint, 'document_printing'),
  ('Print, colored - full page',  'printshoppe', 1500::bigint, false, 'page',  'printing',  50::smallint, 'document_printing'),
  ('Photocopy',                   'printshoppe',  300::bigint, false, 'page',  'photocopy', 60::smallint, 'photocopy'),
  ('Mug',                         'printshoppe', null::bigint, true,  'piece', 'souvenirs', 70::smallint, 'mugs_souvenirs'),
  ('Souvenir',                    'printshoppe', null::bigint, true,  'piece', 'souvenirs', 80::smallint, 'mugs_souvenirs'),
  ('Lamination',                  'printshoppe', null::bigint, true,  'piece', 'other',     90::smallint, 'lamination'),
  ('Sticker',                     'printshoppe', null::bigint, true,  'piece', 'other',    100::smallint, 'stickers'),
  ('DTF print',                   'apparel',     null::bigint, true,  'piece', 'other',    110::smallint, 'dtf_prints');
