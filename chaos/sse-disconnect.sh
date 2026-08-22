#!/usr/bin/env bash
# Scenario: sse-disconnect (Inv3 convergence via reconcile).
# With a client streaming, cut its SSE stream for a blackout window while issuing
# updates it cannot see, then reconnect and assert the gap is detected and the
# client reconciles (/events?since=) to the latest committed version.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
trap restore_all EXIT
preflight
log "sse-disconnect: cutting a client's stream across updates, asserting reconnect+reconcile (Inv3)"
run_asserter sse-disconnect -disconnect "${DISCONNECT:-15s}"
