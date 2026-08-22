#!/usr/bin/env bash
# Scenario: postgres-down (Inv5 no corruption; clean failure).
# Stop Postgres; assert writes fail cleanly (5xx, not a hang/crash), each node's
# /readyz flips to 503, existing SDK state is uncorrupted, then restart Postgres
# and assert recovery (/readyz 200, writes succeed).
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
trap restore_all EXIT
preflight
log "postgres-down: stopping Postgres, asserting clean 5xx + readyz 503 + no corruption + recovery"
run_asserter postgres-down -clients "${CLIENTS:-15}"
