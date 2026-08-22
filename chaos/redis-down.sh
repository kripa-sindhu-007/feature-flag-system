#!/usr/bin/env bash
# Scenario: redis-down (Inv4 durability, Inv5 no corruption).
# Stop Redis; assert the write still COMMITS (Postgres is the source of truth),
# clients hold last-known-good (no rollback), redis_publish_errors_total rises,
# then restart Redis and assert the gap closes via reconcile (Inv3).
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
trap restore_all EXIT
preflight
log "redis-down: stopping Redis, asserting durable commit + no corruption + gap-close (Inv4/5/3)"
run_asserter redis-down -clients "${CLIENTS:-15}"
