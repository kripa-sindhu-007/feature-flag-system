#!/usr/bin/env bash
# Runs the full Week-4 chaos matrix in sequence, restoring the cluster between
# scenarios. Prints a PASS/FAIL summary and exits non-zero if ANY scenario
# failed, so it can gate CI or a release check.
#
# Usage:
#   chaos/run-all.sh                 # all scenarios
#   chaos/run-all.sh backend-crash redis-down   # a subset
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
trap restore_all EXIT

ALL=(concurrent-writers backend-crash redis-down postgres-down sse-disconnect missed-events)
SCENARIOS=("$@")
[ ${#SCENARIOS[@]} -eq 0 ] && SCENARIOS=("${ALL[@]}")

preflight

declare -a RESULTS
overall=0
for s in "${SCENARIOS[@]}"; do
  echo
  echo "==================================================================="
  log "running scenario: ${s}"
  echo "==================================================================="
  if bash "${CHAOS_DIR}/${s}.sh"; then
    RESULTS+=("PASS  ${s}")
  else
    RESULTS+=("FAIL  ${s}")
    overall=1
  fi
  restore_all
done

echo
echo "==================== chaos run-all summary ===================="
for r in "${RESULTS[@]}"; do
  if [[ "${r}" == PASS* ]]; then
    printf '\033[1;32m  %s\033[0m\n' "${r}"
  else
    printf '\033[1;31m  %s\033[0m\n' "${r}"
  fi
done
echo "=============================================================="
[ "${overall}" -eq 0 ] && log "ALL SCENARIOS PASSED" || err "SOME SCENARIOS FAILED"
exit "${overall}"
