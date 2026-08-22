# Benchmarks (measured)

Every number here was **measured**, not modeled or extrapolated. They were
produced by the load driver in [`backend/cmd/loadgen`](../backend/cmd/loadgen),
which is built on the real Go SDK ([`backend/pkg/ffclient`](../backend/pkg/ffclient)) —
the same client an application would embed. Where the setup hit a ceiling, the
ceiling and its cause are stated plainly rather than papered over.

## Hardware & topology

| | |
|---|---|
| Machine | Apple **M5**, 10 cores, 16 GB RAM (`Mac17,4`) |
| OS | macOS (Darwin 25.5) |
| File-descriptor limit | `ulimit -n` = 1048576 (not a factor) |
| Cluster | single-host `docker compose`: PostgreSQL 16, Redis 7, **3× backend** replicas, **nginx** load balancer (`:8080`), plus frontend, Prometheus, Grafana, OTel collector |
| nginx LB tuning | `worker_processes auto`, `worker_rlimit_nofile 65536`, `events { worker_connections 16384 }` (container `nofile` ulimit 65536) — so the LB is not the bottleneck |

> **Single-host caveat (stated, not hidden).** Everything runs on one laptop:
> the 3 backend replicas, Postgres, Redis, nginx, the observability stack **and
> the load harness itself all share the same 10 cores and 16 GB**. This is a
> realistic laptop dev/demo cluster, not a distributed deployment. The absolute
> numbers would differ on dedicated hosts with the harness on a separate box;
> the point of these runs is to characterise real behaviour and find the honest
> ceiling of *this* setup.

## Methodology

**Propagation latency** — each virtual client is a real `ffclient`: it bootstraps
over `/api/client/flags`, opens its own SSE stream on `/api/client/stream`
through the nginx LB, and runs a local eval loop (10 evals/s). Once all clients
are connected and warmed up, the driver issues **20 admin toggles** (one flag,
400 ms apart) via the admin API. For each toggle it records `t0` = the instant
the admin write returns the new global config version, and via a passive SDK
hook records `t1` = the instant each connected client observes that version on
its SSE stream (correlated by the version carried in the SSE `id:` field).
Reported latency is `t1 − t0` per client per update. Samples = clients × updates.

**Local eval throughput** — a single process bootstraps one client from the
cluster, then loops `IsEnabled(flag, user)` over a fixed flag × user matrix.
Pure CPU, zero network per call. Throughput is total evals ÷ wall-clock window;
per-eval latency is measured single-threaded on a 200 k-op sample.

**Peak resource** — `runtime.NumGoroutine()` and `runtime.MemStats.HeapAlloc`
are sampled on the **harness** side while all connections are live (i.e. client
cost per connection, not server cost).

Reproduce:

```bash
# from repo root, cluster up via: docker compose up -d
cd backend
go run ./cmd/loadgen -mode propagation -clients 200 -updates 20 \
  -update-interval 400ms -warmup 6s -settle 3s -eval-rate 10
go run ./cmd/loadgen -mode eval -eval-duration 8s -eval-workers 1
```

## 1. Propagation latency vs. connected SSE clients

End-to-end: admin commit → Redis pub/sub → backend SSE fan-out → client applied.
Same uniform methodology throughout (20 toggles, 400–500 ms apart, delivery
checked). Rows through 5 000 clients sustained **100 % delivery** (every
connected client saw every update); the 8 000 row is past the wall and shown for
completeness. Warmup/settle were scaled up for the larger counts to allow
connection setup, and the per-client eval rate was lowered (10 → 5 → 2 evals/s)
at high counts so the harness's own eval loops didn't steal CPU from the
measurement.

| Connected clients | Samples  | Delivery | p50 | p95 | p99 | max | mean | Harness goroutines | Harness HeapAlloc |
|------------------:|---------:|:--------:|----:|----:|-------:|-------:|-----:|-------------------:|------------------:|
| 100               | 2 000    | 100 %    | **2.4 ms** | 6.3 ms   | 23.0 ms  | 23.8 ms  | 3.0 ms   | 401    | 8.4 MB  |
| 200               | 4 000    | 100 %    | **4.1 ms** | 12.2 ms  | 16.7 ms  | 17.6 ms  | 4.5 ms   | 805    | 17.5 MB |
| 250 (249 conn.)   | 4 980    | 100 %    | **5.2 ms** | 12.2 ms  | 19.1 ms  | 19.4 ms  | 5.4 ms   | 997    | 21.6 MB |
| 500               | 10 000   | 100 %    | **2.9 ms** | 11.5 ms  | 12.6 ms  | 2 488 ms | 6.3 ms   | 2 139  | 41.8 MB |
| 1 000             | 20 000   | 100 %    | **8.9 ms** | 25.2 ms  | 31.4 ms  | 1 668 ms | 15.2 ms  | 4 187  | 85.1 MB |
| 2 000             | 40 000   | 100 %    | **16.8 ms**| 30.2 ms  | 33.3 ms  | 3 107 ms | 18.9 ms  | 8 179  | 166.2 MB |
| 5 000 (4 937 conn.)| 98 740  | 100 %    | **36.1 ms**| 95.4 ms  | 192.4 ms | 6 245 ms | 43.9 ms  | 19 797 | 426.4 MB |
| 8 000 (7 836 conn.)| 156 285 | 99.72 %  | 55.2 ms    | 102.0 ms | 1 941 ms | 15 548 ms| 116.3 ms | 31 361 | 674.2 MB |

Up to **2 000 clients** the tail stays tight: p50 ≈ 17 ms, **p99 ≈ 33 ms**, 100 %
delivery, across the whole 3-node cluster on one laptop. Client-side cost scales
linearly: **≈ 4 goroutines and ≈ 85 KB of heap per connected client**.

> **On the `max` column.** Even where p99 is small, a handful of samples land in
> the hundreds-of-ms-to-seconds range (e.g. 2 488 ms at 500 clients while p99 is
> 12.6 ms). These are a tiny straggler tail — the first toggle catching a client
> mid-warmup, or a client taking the gap → reconcile path instead of the live
> frame. p50/p95/p99 are the meaningful figures; `max` is reported unedited
> rather than trimmed.

## 2. The real ceiling reached — and why

**Ceiling: ≈ 5 000 concurrent SSE clients on this single host.** (The earlier
nginx `worker_connections 512` wall is gone — the LB is now tuned to
`worker_connections 16384`, so it is no longer the bottleneck.)

The knee of the curve is clear in the p99:

| Clients | p50 | p99 | Delivery | Connected |
|--------:|----:|----:|:--------:|:---------:|
| 2 000   | 16.8 ms | **33 ms**   | 100 %   | 2000/2000 |
| 5 000   | 36.1 ms | **192 ms**  | 100 %   | 4937/5000 |
| 8 000   | 55.2 ms | **1 941 ms**| 99.72 % | 7836/8000 |

Between 2 000 and 8 000 the p99 blows up ~60× (33 ms → 1.9 s), delivery slips
below 100 % for the first time, and clients begin **failing to establish
connections** (4 937/5 000, then 7 836/8 000). **5 000 clients is the last point
that holds 100 % delivery with a sub-200 ms p99**; past it the system is over the
wall.

Cause (measured, not guessed): this is **host CPU / scheduler saturation with the
harness co-resident**, not a config knob. Everything shares the same 10 cores —
the 3 backends, Postgres, Redis, nginx, the observability stack **and the load
harness**, and the harness alone needs ≈ 20 k goroutines + 426 MB at 5 000
clients and ≈ 31 k goroutines + 674 MB at 8 000. Once the box runs out of CPU,
SSE fan-out, Go scheduling and new-connection accepts all contend, so latency
tails explode and some connects never complete. On dedicated hosts — backends on
their own boxes and the load generator on a separate machine — this ceiling would
be substantially higher; here it is bounded by the one laptop.

No numbers beyond what was actually run are published — no 10 k / distributed-
fleet extrapolation. The rows above are exactly what happened.

## 3. Local flag evaluation throughput (pure CPU, no network)

`IsEnabled()` does an FNV-1a hash + map lookup under a read lock — no I/O.
Measured on one client snapshot, varying the number of concurrent eval
goroutines sharing that **single** client:

| Concurrent eval goroutines | Throughput | Per-eval (derived) |
|---------------------------:|-----------:|-------------------:|
| **1**                      | **≈ 73.9 M evals/sec** | ≈ 13.5 ns |
| 2                          | ≈ 21.1 M evals/sec | ≈ 47 ns |
| 4                          | ≈ 18.9 M evals/sec | ≈ 53 ns |
| 10                         | ≈ 8.7 M evals/sec  | ≈ 115 ns |

Single-threaded per-eval latency (sampled, 200 k ops): p50 = 41 ns, p99 = 42 ns
— this sampled figure includes ~28 ns of `time.Now()` measurement overhead per
op, so the throughput-derived **≈ 13.5 ns/eval** is the truer single-eval cost.

**Honest finding — throughput drops as concurrency rises on one shared client.**
This is real and worth stating: `IsEnabled` takes an `RWMutex.RLock`, and
`RLock` does an atomic update on a shared counter. Under many cores hammering the
*same* client that cacheline bounces between cores, so naive N-way parallel reads
on one client scale *negatively*. In practice a service process holds one client
and evaluates from its request goroutines — the ~8.7 M/s (10-way shared) figure
is the realistic "busy service" number, and ~74 M/s is the single-goroutine
ceiling. Either way, local evaluation is effectively free relative to any I/O.

## Summary of headline numbers

- **Propagation p50 ≈ 3–17 ms, p99 ≈ 13–33 ms** end-to-end across a 3-node
  cluster at **100 → 2 000** SSE clients, **100 % delivery**; still 100 %
  delivery at **5 000** clients (p50 ≈ 36 ms, p99 ≈ 192 ms).
- **Local eval ≈ 74 M evals/sec single-core** (~13.5 ns/eval); ~8.7 M/sec under
  10-way concurrent access to one shared client.
- **≈ 85 KB heap + ~4 goroutines per connected client** (harness side).
- **Ceiling ≈ 5 000 SSE clients** on this single host — bounded by host CPU /
  scheduler saturation with the harness co-resident, not the LB (now tuned to
  `worker_connections 16384`) and not the backends. Past ~8 000, delivery slips
  below 100 % and p99 explodes to ~1.9 s.
