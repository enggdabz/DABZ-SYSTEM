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
quiet "$HERE/02_grants.sql"
run "$HERE/03_rls.test.sql"
run "$HERE/04_phase2_rls.test.sql"
run "$HERE/05_phase3_rls.test.sql"
run "$HERE/06_phase4_rls.test.sql"
run "$HERE/07_phase5_rls.test.sql"
