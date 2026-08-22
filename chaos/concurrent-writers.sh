#!/usr/bin/env bash
# Scenario: concurrent-writers (Inv1 no lost updates).
# N concurrent writers hammer ONE flag: first with atomic toggles, then with
# read-then-If-Match optimistic updates (max contention). Assert no lost updates
# (one durable event per success), strictly increasing unique versions,
# conflicts rejected as 409 (never silently lost), and a deterministic final
# state the SDK converges to. No infra fault — this is a concurrency-correctness
# experiment, so no docker teardown is needed.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
preflight
log "concurrent-writers: hammering one flag, asserting no lost updates + 409-on-conflict (Inv1)"
run_asserter concurrent-writers -writers "${WRITERS:-8}" -iters "${ITERS:-15}"
