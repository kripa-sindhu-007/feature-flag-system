# Chaos & Soak (measured)

Every result here was **observed on the live cluster**, not modeled. The
experiments are driven by a Go invariant asserter
([`backend/cmd/chaos`](../backend/cmd/chaos)) and a soak runner
([`backend/cmd/soak`](../backend/cmd/soak)), both built on the real Go SDK
([`backend/pkg/ffclient`](../backend/pkg/ffclient)) plus a shared toolkit
([`backend/pkg/chaoskit`](../backend/pkg/chaoskit)) — the same client an
application embeds. Each scenario **sets up → injects a fault → asserts an
invariant** and exits non-zero on any violation, so the shell scripts under
[`chaos/`](../chaos) can gate on them. Where a scenario exposed a real weakness
it is stated plainly, not papered over.

## What we claim (and what we do NOT)

The guarantee is **eventual convergence with bounded, measured propagation
latency and a durable source of truth** — *not* "highly available" and *not*
"strong consistency."

- **Postgres is the source of truth.** A write is committed there (with a
  monotonic global `config_version` and an append-only `flag_events` row) **before**
  it is published to Redis. Redis pub/sub is best-effort, fire-and-forget fan-out.
- **The durable event log is the backstop.** Any missed live event is backfilled
  by replaying `GET /api/client/events?since=V` in version order.
- Therefore an infra failure can *delay* propagation, but a healthy client always
  **converges** to the latest committed version and **never regresses or
  corrupts** its last-known-good state in the meantime.

When a dependency is down the system is deliberately **not** available for the
operation that needs it: with Postgres down, writes return a clean `5xx` and
nodes report `/readyz 503`. That is honest unavailability, not silent data loss.

## Invariants asserted (roadmap §15)

| # | Invariant | How it is checked |
|---|-----------|-------------------|
| **Inv1** | Version monotonicity — a client's `config_version` never decreases; stale/replayed events dropped | Each client's applied `ConfigVersion()` is sampled every 200 ms throughout the run; any decrease fails |
| **Inv2** | Evaluation determinism — `(flag,user,version)` → same boolean on backend & SDK | Shared FNV-1a; covered by existing parity tests (golden vector) — untouched this week |
| **Inv3** | Convergence — after reconnect/reconcile a healthy client reaches the exact latest committed version | Poll every client's `ConfigVersion()` against the server's latest until all match, or fail with the laggards named |
| **Inv4** | Durability over cache — a committed flag survives Redis/SSE failure | Write during the Redis outage; assert it is visible in `/api/admin/flags` and the version advanced |
| **Inv5** | No corruption on failure — infra failure never corrupts a client's last-known-good | Assert no client's version regresses below the pre-fault converged version |

## Topology

Single-host `docker compose`: PostgreSQL 16, Redis 7, **3× backend** replicas
(`backend1/2/3`), an **nginx** load balancer (`:8080`), plus frontend, Prometheus,
Grafana and the OTel collector. Admin writes and client reads go through the LB
except where a scenario deliberately targets a single node's host port
(`:8081/2/3`). Same laptop caveat as [`BENCHMARKS.md`](./BENCHMARKS.md): every
process, including the driver, shares the host.

## Results

Scenario → fault injected → invariant → **observed result**. All six PASS. Version
numbers are from one representative run (the cluster's global `config_version`
was ~1480–1530 at the time); absolute numbers vary run to run, the assertions do
not.

| Scenario | Fault injected | Invariant | Observed result |
|----------|----------------|-----------|-----------------|
| **backend-crash** | `docker compose kill backend2` while 15 SDK clients stream through the LB | Inv3 | Survivors served all 6 writes through the LB (`v1487 → v1493`); all 15 clients whose stream was on the dead node **reconnected via the LB and reconciled to v1493**. 600 monotonicity samples, **0 violations**. Node restarted, `/readyz 200`. **PASS** |
| **redis-down** | `docker compose stop redis`, then a write | Inv4, Inv5, Inv3 | Write **committed as v1495 during the outage** (`v1494 → v1495`, visible in `/api/admin/flags`) — durability over cache. Live push paused: **15/15 clients held last-known-good v1494, none regressed**. `redis_publish_errors_total` **0 → 1** (best-effort publish failed, as designed). After `start redis` + a post-recovery write, the non-contiguous version triggered reconcile and **all clients converged to v1496** — the gap closed. **PASS** |
| **postgres-down** | `docker compose stop postgres`, then a write | Inv5 (clean failure) | Write **failed cleanly with HTTP 500** within the bounded timeout — no hang, no crash. Each node's `/readyz` **flipped to 503** (`postgres` probe failing) so the LB would drain them. Existing SDK state **uncorrupted** (all held last-good). After `start postgres`, `/readyz` returned **200** on every node and a write **succeeded again**. **PASS** |
| **sse-disconnect** | Cut one client's SSE stream for a 15 s blackout while issuing updates | Inv3 | During the blackout **22 updates committed** (server `v1499 → v1521`); the disconnected client **held stale v1499** (not streaming, not reconciling). On reconnect the next live frame was non-contiguous → **gap detected → `/events?since=` reconcile → converged v1499 → v1522**. **PASS** |
| **missed-events** | `docker compose pause backend3` (subscriber frozen) while writing via `backend1` | Inv1, Inv3 | 12 clients pinned to `backend3`. During the pause the server advanced to `v1529` via `backend1`; Redis pub/sub is fire-and-forget so **those messages were lost to the paused node** — its clients held `v1523`. After `unpause`, a fresh write's frame was non-contiguous → clients **detected the gap and reconciled to v1530 via the durable event log** (not replayed pub/sub). 252 samples, **0 violations**. **PASS** |
| **concurrent-writers** | 8 writers × 15 iterations hammering ONE flag (atomic toggles, then read-then-`If-Match` updates) | Inv1 | **Phase 1 (atomic toggle):** 120/120 committed, 120 **distinct strictly-increasing** versions, 120 durable events — **no lost updates**. **Phase 2 (`If-Match`, max contention):** 16 committed (unique increasing versions), **104 rejected as HTTP 409** — conflicts are surfaced, **never silently lost** — 16 durable events. Deterministic final state, SDK client converged. **PASS** |

### Reproduce

```bash
# from repo root — cluster up first
docker compose up -d --build          # wait for :8080/readyz -> 200

# one scenario at a time (each self-cleans via a trap):
chaos/backend-crash.sh
chaos/redis-down.sh
chaos/postgres-down.sh
chaos/sse-disconnect.sh
chaos/missed-events.sh
chaos/concurrent-writers.sh

# or the whole matrix with a PASS/FAIL summary (exits non-zero if any fail):
chaos/run-all.sh
# a subset:
chaos/run-all.sh backend-crash redis-down
```

Each script sources `chaos/_lib.sh`, waits for `/readyz`, invokes the Go asserter
(`backend/cmd/chaos -scenario <name>`), and on EXIT restores the cluster (starts
any stopped service, unpauses any paused one) — so a failed run never leaves a
node down. The Go asserter also restarts/unpauses whatever it injected, even on
failure, giving two layers of self-cleaning.

## Soak

A continuous mixed workload with an **online** invariant checker running
throughout ([`backend/cmd/soak`](../backend/cmd/soak)):

- **40 steady** ffclients, each a live SSE stream + a local-eval loop.
- **6 reconnect-churn** clients continuously dropping and reopening their stream
  (the reconnect → reconcile → converge path, on a loop).
- A **writer** mutating a flag every 2 s (mix of atomic toggle and `If-Match`
  update).
- **Inv1** monotonicity sampled every 250 ms per client; **Inv3** convergence
  checked every 20 s (every client must reach the server's latest within a 20 s
  grace window — churning clients get the grace to reconcile).

It supports `-duration 1h` and beyond; this run used **22 minutes** (a demo
length — the runner is the same for a longer soak).

**Result of the 22-minute run** — zero invariant violations end to end:

| Metric | Value |
|--------|-------|
| Duration | 22m |
| Steady clients / churn clients | 40 / 6 |
| Local evaluations | 302,640 |
| Writer mutations | 378 |
| Stream reconnects (churn) | 829 |
| Live SSE frames observed | 15,120 |
| Version samples (Inv1) | 122,560 |
| Convergence checks (Inv3) | 37 — **0 failed** |
| Monotonicity violations (Inv1) | **0** |
| **Verdict** | **PASS — zero invariant violations over the full soak** |

Every 20 s convergence check found all 40 steady clients at the same version
(spread 0) despite the writer advancing it and the churn clients continuously
reconnecting — eventual convergence holding under continuous mixed load.

Run it yourself:

```bash
cd backend
# demo length used here:
go run ./cmd/soak -duration 22m -clients 40 -churn 6 -write-interval 2s
# a long soak:
go run ./cmd/soak -duration 1h
```

## Honest findings

1. **LB failover on node death was too slow — fixed (W4 hardening).** The first
   `backend-crash` run *failed*: a write through the LB **hung** after the node
   was killed. Cause: a killed backend's IP goes unrouteable, so nginx's connect
   to it waited out the **60 s default `proxy_connect_timeout`** before trying a
   survivor. Fix in [`infra/nginx.conf`](../infra/nginx.conf): bound the connect
   probe to `proxy_connect_timeout 2s`, retry survivors via
   `proxy_next_upstream error timeout ...` (`proxy_next_upstream_tries 3`), and
   mark a node down after `max_fails=2` for `fail_timeout=5s`. `proxy_read_timeout`
   stays long — that governs the live SSE stream, not failover. After the fix a
   single dead node adds at most ~2 s to a request instead of stalling it, and
   `backend-crash` passes. This is a genuine resilience gap that only a chaos test
   surfaced.

2. **Optimistic-concurrency conflicts leave gaps in the committed version
   sequence — expected, not a loss.** In `concurrent-writers` phase 2, 16
   committed events spanned **116 version numbers** (≈100 gaps). A rejected
   `If-Match` write still calls `nextval('config_version_seq')` inside its
   transaction, and Postgres sequences **do not roll back**, so each conflict
   burns a version number that never becomes an event. Consequences, all benign:
   committed versions are still **strictly increasing and unique** (no lost
   updates); but because SDK clients treat *any* non-contiguous version as a
   gap, under heavy write-conflict load they favor the **reconcile** path over
   live-apply. Correctness is unaffected (they converge); it is a small
   efficiency note, not a bug.

3. **`redis-down` live push pauses, and that is the point.** While Redis is down
   no live frames are delivered; clients correctly hold last-known-good rather
   than guess. Convergence resumes the moment a later event (or a reconnect)
   makes a client notice the gap and reconcile from the durable log. This is the
   "eventual convergence, not high availability of push" guarantee, demonstrated.
