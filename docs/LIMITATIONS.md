# Decisions & Limitations (honest)

This project makes a deliberately **bounded, provable** claim and documents where
that claim ends. Nothing here is hidden in a footnote: the guarantees are
measured ([`BENCHMARKS.md`](./BENCHMARKS.md)), the failure behavior is asserted
([`CHAOS.md`](./CHAOS.md)), and the limitations below are the honest edges.

## The guarantee

> **Eventual convergence with bounded, measured propagation latency and a durable
> source of truth.**

Not "highly available", not "strongly consistent." PostgreSQL is the source of
truth; a write commits there (with a monotonic `config_version` and an
append-only `flag_events` row) **before** it is published to Redis. Redis pub/sub
is best-effort fan-out; the durable event log + `GET /api/client/events?since=V`
is the backstop that guarantees convergence. An infra failure can *delay*
propagation, but a healthy client always converges to the latest committed
version and never regresses or corrupts its last-known-good state.

## Key decisions

| # | Decision | Why |
|---|----------|-----|
| D1 | 3 backend replicas behind an nginx LB (real multi-instance, not simulated) | Cross-instance propagation is only *proven* if a change on one node reaches clients on another. |
| D2 | Depth over breadth — every capability ships with a test / benchmark / invariant | The engineering story is correctness under failure, not a feature count. |
| — | Redis as a pub/sub **bus**, Postgres as source of truth | Decouples the durable write path from the best-effort notification path; the event log makes lossy fan-out safe. |
| — | Version-tagged SSE + reconcile-from-log (not lossless transport) | Correctness can't depend on SSE/Redis never dropping a message; the client detects a version gap and replays the ordered backlog. |
| — | Optimistic concurrency (`If-Match` → 409) + atomic toggle | Concurrent writers never silently lose updates; conflicts are surfaced, not swallowed. |
| — | Two SDKs (browser TS + server-side Go) sharing one FNV-1a | The Go SDK doubles as the load / chaos / soak driver; evaluation is identical across runtimes. |
| — | Admin key behind a Next.js **BFF proxy** (W4) | The admin key must never ship in the browser bundle; server-side route handlers hold it and forward. |
| — | Observe-only chaos/resilience UI (W4) | Faults are injected out-of-band by `chaos/` scripts; the UI never triggers faults, so there is no privileged fault-injection endpoint to secure. |

## Known limitations

1. **Benchmarks are single-host.** All backends, Postgres, Redis, nginx and the
   load driver share one laptop (Apple M5). The ~5,000-client ceiling is host
   CPU/scheduler saturation with the driver co-resident, **not** a backend or LB
   limit. On dedicated hosts with the generator off-box the numbers would be
   higher. Stated, not hidden.

2. **Propagation metric uses the publisher's clock.** `config_propagation_seconds`
   is measured as `receiver_now − publisher_ts`. Accurate on one host; on a
   multi-host deploy it needs clock sync (NTP/PTP) or the number carries the skew.
   Negative deltas are clamped to zero.

3. **Version-sequence gaps under write contention (benign).** A rejected `If-Match`
   write still consumes a `config_version_seq` value (Postgres sequences don't roll
   back), so committed versions can have gaps under heavy conflict load. Versions
   remain strictly increasing and unique — no lost updates — but because clients
   treat any non-contiguous version as a gap, they favor the reconcile path over
   live-apply during conflict storms. Correctness is unaffected.

4. **Live push pauses when Redis is down — by design.** No live frames are
   delivered during a Redis outage; clients hold last-known-good rather than guess,
   and converge on the next event/reconnect once Redis returns. This is "eventual
   convergence," not "high availability of push."

5. **The read-only SDK key is still in the SSE URL.** The browser `EventSource`
   API cannot set request headers, so the client SSE stream passes the SDK key as
   `?key=`. This is the read-only client key (not the admin key, which is now fully
   server-side). Non-SSE client calls use the `X-SDK-Key` header.

6. **Default dev credentials.** `admin-secret-key` / `sdk-secret-key` and Grafana's
   `admin`/`admin` + anonymous viewer are local-dev defaults — override every one
   via environment variables before any real deployment.

7. **No user auth / RBAC on the dashboard.** The BFF proxy holds a single shared
   admin key; there is no per-user login, roles, or audit-of-who. Acceptable for a
   self-hosted single-operator tool; multi-user auth + an audit log are future work.

8. **Targeting is exact user-ID match.** `targeted_users` is a `TEXT[]` scanned
   O(n); fine at this scale, not a segmentation engine.

## Not built (and why)

Kafka / Kubernetes / service mesh, A/B testing as a product, webhooks, and a
UI-as-product redesign are all deliberately out of scope — none of them would
strengthen the core claim (correct, convergent, durable flag propagation under
failure), which is the actual engineering story. See the roadmap §16.
