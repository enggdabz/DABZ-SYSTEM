#!/usr/bin/env bash
# Runs the Row Level Security tests against a throwaway local PostgreSQL.
#
# OPTIONAL - the shop does not need this. It exists so that changes to the
# security rules can be proven before they reach the real database.
#
# Needs: a running PostgreSQL. Set PGHOST/PGPORT/PGUSER if yours differs.
set -euo pipefail

PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
DB="dabz_rls_test_$$"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export PGHOST PGPORT PGUSER

cleanup() { psql -q -d postgres -c "drop database if exists \"$DB\";" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql -q -d postgres -c "create database \"$DB\";"

# Migrations are noisy with "does not exist, skipping" notices from their
# idempotent drops; only the test file's PASS notices are worth printing.
quiet() { PGOPTIONS='-c client_min_messages=warning' psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }
run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }

quiet "$HERE/00_local_stub.sql"
quiet "$HERE/../migrations/0000_phase0_hello.sql"
quiet "$HERE/../migrations/0001_phase1_foundation.sql"
quiet "$HERE/../migrations/0002_phase2_money.sql"
quiet "$HERE/../migrations/0003_phase3_staff.sql"
quiet "$HERE/../migrations/0004_timeclock_own_login.sql"
quiet "$HERE/../migrations/0005_phase4_pos.sql"
quiet "$HERE/../migrations/0006_phase5_expenses_stocks.sql"
quiet "$HERE/../migrations/0007_phase6_apparel.sql"
quiet "$HERE/../migrations/0008_phase7_repairs.sql"
quiet "$HERE/../migrations/0009_phase9_public.sql"
quiet "$HERE/../migrations/0010_finish_password_change.sql"
quiet "$HERE/../migrations/0011_clear_catalogue_and_allow_delete.sql"
quiet "$HERE/../migrations/0012_clear_apparel_and_repair_prices.sql"

# 0013 is a one-off data clear with no schema in it, and it would empty the
# fixtures below. The suite proves the POLICIES; that migration is checked by
# applying it to a throwaway copy, not by running it here.

# 0014 IS schema - the staff sign-out switch - so it runs, skipping over 0013.
quiet "$HERE/../migrations/0014_staff_stay_signed_in.sql"
# 0015 adds the collections feed, so it has to be here too - 12 tests it.
quiet "$HERE/../migrations/0015_phase10_collections.sql"
# 0016 adds the push subscriptions table - 13 tests it.
quiet "$HERE/../migrations/0016_phase11_notifications.sql"
# 0017 closes the own-row reads a deactivated account still had - 14 tests it.
quiet "$HERE/../migrations/0017_deactivated_account_reads_nothing.sql"
# 0018 is the online shop and its orders - 15 tests it.
quiet "$HERE/../migrations/0018_phase12_online_orders.sql"

# 0011 and 0012 empty the bills, loans, products, apparel items and repair
# services the earlier migrations seeded, so the tests that need a catalogue to
# read now bring their own.
quiet "$HERE/01_catalogue_fixtures.sql"
quiet "$HERE/02_grants.sql"
run "$HERE/03_rls.test.sql"
run "$HERE/04_phase2_rls.test.sql"
run "$HERE/05_phase3_rls.test.sql"
run "$HERE/06_phase4_rls.test.sql"
run "$HERE/07_phase5_rls.test.sql"
run "$HERE/08_phase6_rls.test.sql"
run "$HERE/09_phase7_rls.test.sql"
run "$HERE/10_phase9_rls.test.sql"
run "$HERE/11_delete_rules.test.sql"
run "$HERE/12_phase10_rls.test.sql"
run "$HERE/13_phase11_rls.test.sql"
run "$HERE/14_deactivated_account.test.sql"
run "$HERE/15_online_orders_rls.test.sql"
