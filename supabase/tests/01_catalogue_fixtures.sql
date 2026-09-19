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
-- Migration 0012 does the same for the apparel items and the repair services,
-- so those move here too (08 and 09 read them).
--
-- Keep it in step with the counts the tests assert: 11 bills, 6 loans, 11
-- products of which 6 have a price, 5 apparel items and 12 repair services.
-- Every due day, every interest rate and every apparel and repair price is
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

-- ---- Apparel items -------------------------------------------------------
-- Migration 0012 clears these too. 08 counts five of them, all unpriced.
-- The SIZE LADDER is not here: 0012 deliberately leaves `apparel_size_prices`
-- alone, because those nine rows are where a per-size surcharge is typed in
-- rather than a list the owner invents.

insert into public.apparel_products (name, base_price_centavos, income_category, sort_order)
values
  ('Sublimation jersey set', null::bigint, 'sublimation_jerseys', 10::smallint),
  ('Shirt',                  null::bigint, 'shirts',              20::smallint),
  ('Jacket',                 null::bigint, 'jackets',             30::smallint),
  ('Long sleeves',           null::bigint, 'long_sleeves',        40::smallint),
  ('DTF process print',      null::bigint, 'dtf_prints',          50::smallint);

-- ---- Repair services -----------------------------------------------------
-- Twelve, all unpriced, with exactly one carrying `is_checking_fee` - 09
-- checks all three of those facts, and a partial unique index added in 0012
-- enforces the "exactly one" from here on.
--
-- "Cleaning & repaste" appears twice, once for a laptop and once for a
-- desktop, because 09 checks that the same service CAN be priced per machine.

insert into public.repair_services
  (name, unit_kind, price_centavos, income_category, is_checking_fee, sort_order)
values
  ('Checking / diagnostic fee', 'any',           null::bigint, 'checking_fee',         true,   10::smallint),
  ('Head cleaning',             'epson_printer', null::bigint, 'epson_printer_repair', false,  20::smallint),
  ('Ink system repair',         'epson_printer', null::bigint, 'epson_printer_repair', false,  30::smallint),
  ('Printer general service',   'epson_printer', null::bigint, 'epson_printer_repair', false,  40::smallint),
  ('Cleaning & repaste',        'laptop',        null::bigint, 'laptop_repair',        false,  50::smallint),
  ('Operating system install',  'laptop',        null::bigint, 'laptop_repair',        false,  60::smallint),
  ('Screen replacement',        'laptop',        null::bigint, 'laptop_repair',        false,  70::smallint),
  ('Keyboard replacement',      'laptop',        null::bigint, 'laptop_repair',        false,  80::smallint),
  ('Cleaning & repaste',        'desktop',       null::bigint, 'desktop_repair',       false,  90::smallint),
  ('Operating system install',  'desktop',       null::bigint, 'desktop_repair',       false, 100::smallint),
  ('Upgrade / parts fitting',   'desktop',       null::bigint, 'desktop_repair',       false, 110::smallint),
  ('Virus removal',             'any',           null::bigint, 'laptop_repair',        false, 120::smallint);
