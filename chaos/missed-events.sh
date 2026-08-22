#!/usr/bin/env bash
# Scenario: missed-events (Inv1 + Inv3 via the durable-log backstop).
# Pause backend3 so its Redis subscriber stops consuming; issue updates via
# backend1. Redis pub/sub is fire-and-forget, so those messages are LOST to the
# paused node. Unpause it and assert its clients detect the version gap and
# reconcile to latest via the durable event log (not replayed pub/sub).
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
trap restore_all EXIT
preflight
log "missed-events: pausing backend3's subscriber, asserting gap-detect + reconcile (Inv1/Inv3)"
run_asserter missed-events -clients "${CLIENTS:-12}"
