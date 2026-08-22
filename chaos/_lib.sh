#!/usr/bin/env bash
# Shared helpers for the Week-4 chaos scripts. Each scenario script sources this,
# sets a cleanup trap, invokes the Go invariant asserter (backend/cmd/chaos),
# and exits with the asserter's status. The heavy lifting — spawning real SDK
# clients, injecting the fault via `docker compose`, and ASSERTING the invariant
# — lives in Go so the clients genuinely stay connected across the fault; these
# scripts own orchestration, pre-flight, and self-cleaning cleanup.
set -euo pipefail

# Repo root = parent of this chaos/ dir (works regardless of caller's cwd).
CHAOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${CHAOS_DIR}/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"

LB_URL="${LB_URL:-http://localhost:8080}"
NODE_URLS="${NODE_URLS:-http://localhost:8081,http://localhost:8082,http://localhost:8083}"
ADMIN_KEY="${ADMIN_KEY:-admin-secret-key}"
SDK_KEY="${SDK_KEY:-sdk-secret-key}"

compose() { (cd "${ROOT_DIR}" && docker compose "$@"); }

log() { printf '\033[1;36m[chaos]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[chaos]\033[0m %s\n' "$*" >&2; }

# preflight: cluster must be up and the LB ready before we inject anything.
preflight() {
  log "preflight: waiting for ${LB_URL}/readyz ..."
  local i code
  for i in $(seq 1 20); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "${LB_URL}/readyz" || true)"
    if [ "${code}" = "200" ]; then
      log "cluster ready."
      return 0
    fi
    sleep 2
  done
  err "cluster not ready at ${LB_URL}/readyz (bring it up: docker compose up -d)"
  exit 1
}

# restore_all: idempotent safety net — start any stopped service and unpause any
# paused one, so a failed scenario never leaves the cluster degraded. Invoked
# from every scenario's EXIT trap.
restore_all() {
  log "cleanup: restoring cluster (start stopped, unpause paused) ..."
  compose start postgres redis backend1 backend2 backend3 lb >/dev/null 2>&1 || true
  # `unpause` errors if not paused — swallow it.
  for svc in backend1 backend2 backend3; do
    compose unpause "${svc}" >/dev/null 2>&1 || true
  done
  # Best-effort wait for readiness so the next scenario starts clean.
  local i code
  for i in $(seq 1 20); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "${LB_URL}/readyz" || true)"
    [ "${code}" = "200" ] && break
    sleep 2
  done
}

# run_asserter <scenario> [extra go-flag args...]
run_asserter() {
  local scenario="$1"; shift
  ( cd "${BACKEND_DIR}" && go run ./cmd/chaos \
      -scenario "${scenario}" \
      -base-url "${LB_URL}" \
      -node-urls "${NODE_URLS}" \
      -admin-key "${ADMIN_KEY}" \
      -sdk-key "${SDK_KEY}" \
      -compose-dir "${ROOT_DIR}" \
      "$@" )
}
