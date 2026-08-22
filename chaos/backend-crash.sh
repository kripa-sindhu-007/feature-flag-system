#!/usr/bin/env bash
# Scenario: backend-crash (Inv3 convergence).
# Connect SDK clients through the LB, KILL backend2, issue writes via the LB, and
# assert survivors serve and every client reconnects + reconciles to the latest
# committed version. The node is restarted on the way out (and by the trap).
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
trap restore_all EXIT
preflight
log "backend-crash: killing backend2, asserting survivors serve + clients converge (Inv3)"
run_asserter backend-crash -clients "${CLIENTS:-15}"
