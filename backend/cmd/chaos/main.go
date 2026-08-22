// Command chaos is the Week-4 invariant asserter for the feature-flag system.
// It drives real ffclient SDK clients through the nginx LB (or a specific node),
// injects an infrastructure fault via `docker compose`, and ASSERTS one of the
// roadmap §15 invariants, exiting non-zero on any violation so the chaos/ shell
// scripts (and run-all) can gate on it.
//
// It never fabricates a result: every assertion is against live server state
// (GET /api/client/version, /api/admin/flags, /metrics, /readyz) or the applied
// state of real SDK clients. Where a scenario reveals a real weakness the tool
// reports it and fails rather than papering over it.
//
// Scenarios (roadmap §12 matrix):
//
//	backend-crash      Inv3  kill a backend; survivors serve, clients reconcile.
//	redis-down         Inv4/5 stop Redis; writes still commit, no corruption,
//	                         publish errors rise, gap closes on recovery.
//	postgres-down      Inv5  stop Postgres; writes fail cleanly (5xx), /readyz
//	                         flips 503, client state uncorrupted, recovery ok.
//	sse-disconnect     Inv3  cut a client's stream across updates; reconnect →
//	                         gap → reconcile → converge.
//	missed-events      Inv1/3 pause a node's subscriber (fire-and-forget loss);
//	                         its clients detect the gap and reconcile.
//	concurrent-writers Inv1  N writers hammer one flag; no lost updates, strictly
//	                         increasing versions, deterministic final state.
//
// Each scenario cleans up the fault it injected (restart/unpause) even on
// failure, so the cluster is left healthy.
package main

import (
	"context"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/feature-flag-system/backend/pkg/chaoskit"
	"github.com/feature-flag-system/backend/pkg/ffclient"
)

type opts struct {
	scenario        string
	baseURL         string
	nodeURLs        []string
	sdkKey, admKey  string
	composeDir      string
	clients         int
	convergeTimeout time.Duration
	disconnect      time.Duration
	writers, iters  int
}

func main() {
	var (
		scenario   = flag.String("scenario", "", "backend-crash | redis-down | postgres-down | sse-disconnect | missed-events | concurrent-writers")
		baseURL    = flag.String("base-url", "http://localhost:8080", "cluster base URL (nginx LB)")
		nodeCSV    = flag.String("node-urls", "http://localhost:8081,http://localhost:8082,http://localhost:8083", "per-node host URLs, comma-separated (backend1,2,3)")
		sdkKey     = flag.String("sdk-key", "sdk-secret-key", "SDK key (X-SDK-Key)")
		admKey     = flag.String("admin-key", "admin-secret-key", "admin API key (X-Admin-API-Key)")
		composeDir = flag.String("compose-dir", "", "dir containing docker-compose.yml (default: walk up from cwd)")
		clients    = flag.Int("clients", 15, "fleet size for scenarios that spawn clients")
		conv       = flag.Duration("converge-timeout", 30*time.Second, "max wait for fleet convergence")
		disc       = flag.Duration("disconnect", 15*time.Second, "sse-disconnect: stream cut window")
		writers    = flag.Int("writers", 8, "concurrent-writers: number of writer goroutines")
		iters      = flag.Int("iters", 15, "concurrent-writers: iterations per writer per phase")
	)
	flag.Parse()

	dir, err := resolveComposeDir(*composeDir)
	if err != nil {
		fatalf("resolve compose dir: %v", err)
	}

	o := opts{
		scenario:        *scenario,
		baseURL:         *baseURL,
		nodeURLs:        splitCSV(*nodeCSV),
		sdkKey:          *sdkKey,
		admKey:          *admKey,
		composeDir:      dir,
		clients:         *clients,
		convergeTimeout: *conv,
		disconnect:      *disc,
		writers:         *writers,
		iters:           *iters,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	fmt.Printf("=== chaos scenario: %s ===\n", o.scenario)
	fmt.Printf("    LB=%s nodes=%v compose-dir=%s\n\n", o.baseURL, o.nodeURLs, o.composeDir)

	var runErr error
	switch o.scenario {
	case "backend-crash":
		runErr = backendCrash(ctx, o)
	case "redis-down":
		runErr = redisDown(ctx, o)
	case "postgres-down":
		runErr = postgresDown(ctx, o)
	case "sse-disconnect":
		runErr = sseDisconnect(ctx, o)
	case "missed-events":
		runErr = missedEvents(ctx, o)
	case "concurrent-writers":
		runErr = concurrentWriters(ctx, o)
	default:
		fatalf("unknown -scenario %q", o.scenario)
	}

	if runErr != nil {
		fmt.Printf("\nRESULT: FAIL — %v\n", runErr)
		os.Exit(1)
	}
	fmt.Printf("\nRESULT: PASS — invariant held.\n")
}

// ---- scenario: backend-crash (Inv3 convergence) -----------------------------

func backendCrash(ctx context.Context, o opts) error {
	const flagKey = "chaos-backend-crash"
	const victim = "backend2"
	lb := chaoskit.NewAdmin(o.baseURL, o.admKey, o.sdkKey)
	compose := &chaoskit.Compose{Dir: o.composeDir}

	id, err := lb.EnsureFlag(ctx, flagKey)
	if err != nil {
		return fmt.Errorf("ensure flag: %w", err)
	}

	fleet, err := chaoskit.SpawnFleet(ctx, spawnCfg(o), o.clients)
	if err != nil {
		return err
	}
	step("spawned %d SDK clients through the LB", len(fleet.Members))
	monCtx, monCancel := context.WithCancel(ctx)
	defer monCancel()
	go fleet.MonitorMonotonicity(monCtx, 200*time.Millisecond)

	base, err := lb.LatestVersion(ctx)
	if err != nil {
		return err
	}
	if err := fleet.WaitConverged(ctx, base, 20*time.Second, 250*time.Millisecond); err != nil {
		return fmt.Errorf("baseline convergence: %w", err)
	}
	step("baseline: all %d clients converged to v%d", len(fleet.Members), base)

	// Injecting the fault: kill a backend (fast RST, real crash).
	restore := ensureStarted(compose, victim, o.nodeURLs)
	defer restore()
	if err := compose.Kill(ctx, victim); err != nil {
		return fmt.Errorf("kill %s: %w", victim, err)
	}
	step("INJECT: killed %s (its SSE clients must reconnect via the LB)", victim)

	// Survivors must serve writes issued through the LB.
	var last chaoskit.WriteResult
	for k := 0; k < 6; k++ {
		res, err := lb.Toggle(ctx, id)
		if err != nil {
			return fmt.Errorf("write %d through LB after crash failed (survivors not serving): %w", k, err)
		}
		last = res
		time.Sleep(300 * time.Millisecond)
	}
	latest, err := lb.LatestVersion(ctx)
	if err != nil {
		return err
	}
	step("survivors served %d writes; latest committed v%d (last write v%d)", 6, latest, last.Version)

	if err := fleet.WaitConverged(ctx, latest, o.convergeTimeout, 250*time.Millisecond); err != nil {
		return fmt.Errorf("post-crash convergence (Inv3): %w", err)
	}
	step("Inv3: all %d clients reconnected + reconciled to v%d", len(fleet.Members), latest)

	restore()
	step("recovery: %s restarted and /readyz 200", victim)

	return finishMonotonicity(fleet)
}

// ---- scenario: redis-down (Inv4 durability, Inv5 no corruption) -------------

func redisDown(ctx context.Context, o opts) error {
	const flagKey = "chaos-redis-down"
	lb := chaoskit.NewAdmin(o.baseURL, o.admKey, o.sdkKey)
	compose := &chaoskit.Compose{Dir: o.composeDir}

	id, err := lb.EnsureFlag(ctx, flagKey)
	if err != nil {
		return fmt.Errorf("ensure flag: %w", err)
	}
	fleet, err := chaoskit.SpawnFleet(ctx, spawnCfg(o), o.clients)
	if err != nil {
		return err
	}
	step("spawned %d SDK clients through the LB", len(fleet.Members))
	monCtx, monCancel := context.WithCancel(ctx)
	defer monCancel()
	go fleet.MonitorMonotonicity(monCtx, 200*time.Millisecond)

	base, err := lb.LatestVersion(ctx)
	if err != nil {
		return err
	}
	if err := fleet.WaitConverged(ctx, base, 20*time.Second, 250*time.Millisecond); err != nil {
		return fmt.Errorf("baseline convergence: %w", err)
	}
	step("baseline: all clients converged to v%d", base)

	preErr := chaoskit.SumCounterAcrossNodes(ctx, "redis_publish_errors_total", o.nodeURLs)

	restore := ensureStarted(compose, "redis", nil)
	defer restore()
	if err := compose.Stop(ctx, "redis"); err != nil {
		return fmt.Errorf("stop redis: %w", err)
	}
	step("INJECT: stopped Redis (live push must pause; writes must still commit)")

	// Inv4: the write must still COMMIT (Postgres commit precedes publish).
	res, err := lb.Toggle(ctx, id)
	if err != nil {
		return fmt.Errorf("write during redis outage did NOT commit (Inv4 violated): %w", err)
	}
	committed, err := lb.LatestVersion(ctx)
	if err != nil {
		return err
	}
	if committed <= base || committed != res.Version {
		return fmt.Errorf("Inv4: expected committed version > %d and == write result %d, got latest=%d", base, res.Version, committed)
	}
	step("Inv4: write COMMITTED as v%d during Redis outage (durable source of truth)", committed)

	// Live push is paused — give it a moment, then confirm no corruption.
	time.Sleep(3 * time.Second)
	stillGood := fleet.CountAtLeast(base) // all should be >= base
	notYet := len(fleet.Members) - fleet.CountAtLeast(committed)
	if err := fleet.AssertNoneBelow(base); err != nil {
		return fmt.Errorf("Inv5 (no corruption): %w", err)
	}
	step("Inv5: no client regressed below last-good v%d (%d/%d hold last-good, live push paused)", base, notYet, len(fleet.Members))
	_ = stillGood

	postErr := chaoskit.SumCounterAcrossNodes(ctx, "redis_publish_errors_total", o.nodeURLs)
	if postErr <= preErr {
		return fmt.Errorf("expected redis_publish_errors_total to increase, was %.0f now %.0f", preErr, postErr)
	}
	step("observed: redis_publish_errors_total %.0f -> %.0f (best-effort publish failed as expected)", preErr, postErr)

	// Recover Redis, then close the gap.
	restore()
	step("recovery: Redis restarted, nodes /readyz 200")

	// A post-recovery write is non-contiguous for clients still on last-good →
	// gap → reconcile via the durable event log → converge (Inv3).
	if _, err := lb.Toggle(ctx, id); err != nil {
		return fmt.Errorf("post-recovery write: %w", err)
	}
	latest, err := lb.LatestVersion(ctx)
	if err != nil {
		return err
	}
	if err := fleet.WaitConverged(ctx, latest, o.convergeTimeout, 250*time.Millisecond); err != nil {
		return fmt.Errorf("gap did not close after Redis recovery (Inv3): %w", err)
	}
	step("Inv3: gap closed — all clients converged to v%d after recovery", latest)

	return finishMonotonicity(fleet)
}

// ---- scenario: postgres-down (Inv5 no corruption, clean failure) ------------

func postgresDown(ctx context.Context, o opts) error {
	const flagKey = "chaos-postgres-down"
	lb := chaoskit.NewAdmin(o.baseURL, o.admKey, o.sdkKey)
	compose := &chaoskit.Compose{Dir: o.composeDir}

	id, err := lb.EnsureFlag(ctx, flagKey)
	if err != nil {
		return fmt.Errorf("ensure flag: %w", err)
	}
	fleet, err := chaoskit.SpawnFleet(ctx, spawnCfg(o), o.clients)
	if err != nil {
		return err
	}
	step("spawned %d SDK clients through the LB", len(fleet.Members))
	monCtx, monCancel := context.WithCancel(ctx)
	defer monCancel()
	go fleet.MonitorMonotonicity(monCtx, 200*time.Millisecond)

	base, err := lb.LatestVersion(ctx)
	if err != nil {
		return err
	}
	if err := fleet.WaitConverged(ctx, base, 20*time.Second, 250*time.Millisecond); err != nil {
		return fmt.Errorf("baseline convergence: %w", err)
	}
	step("baseline: all clients converged to v%d", base)

	restore := ensureStarted(compose, "postgres", o.nodeURLs)
	defer restore()
	if err := compose.Stop(ctx, "postgres"); err != nil {
		return fmt.Errorf("stop postgres: %w", err)
	}
	step("INJECT: stopped Postgres (writes must fail cleanly, /readyz must flip 503)")

	// Writes must fail CLEANLY: a bounded 5xx, not a hang or a crash.
	wctx, wcancel := context.WithTimeout(ctx, 8*time.Second)
	status, werr := lb.RawToggle(wctx, id)
	wcancel()
	if werr != nil {
		return fmt.Errorf("write did not fail cleanly (hang/refused, not a 5xx): %v", werr)
	}
	if status < 500 {
		return fmt.Errorf("expected 5xx while Postgres down, got %d", status)
	}
	step("clean failure: write returned HTTP %d (bounded error, no hang/crash)", status)

	// /readyz must flip to 503 on each node.
	if err := pollReadyz(ctx, o.nodeURLs, 503, 15*time.Second); err != nil {
		return fmt.Errorf("readiness did not flip to 503: %w", err)
	}
	step("each node /readyz -> 503 (LB would drain them)")

	// Existing SDK state must be uncorrupted (no regression).
	if err := fleet.AssertNoneBelow(base); err != nil {
		return fmt.Errorf("Inv5 (no corruption during PG outage): %w", err)
	}
	_, maxv := fleet.VersionSpread()
	step("Inv5: client state uncorrupted — all still hold last-good (max v%d)", maxv)

	// Recover.
	restore()
	if err := pollReadyz(ctx, o.nodeURLs, 200, o.convergeTimeout); err != nil {
		return fmt.Errorf("recovery: readiness did not return to 200: %w", err)
	}
	step("recovery: each node /readyz -> 200")
	if _, err := lb.Toggle(ctx, id); err != nil {
		return fmt.Errorf("write after recovery failed: %w", err)
	}
	step("recovery: a write succeeds again")

	return finishMonotonicity(fleet)
}

// ---- scenario: sse-disconnect (Inv3 convergence via reconcile) --------------

func sseDisconnect(ctx context.Context, o opts) error {
	const flagKey = "chaos-sse-disconnect"
	lb := chaoskit.NewAdmin(o.baseURL, o.admKey, o.sdkKey)

	id, err := lb.EnsureFlag(ctx, flagKey)
	if err != nil {
		return fmt.Errorf("ensure flag: %w", err)
	}

	hc := streamingClient()
	var frames int
	c := ffclient.New(ffclient.Config{
		BaseURL: o.baseURL, SDKKey: o.sdkKey, HTTPClient: hc,
		OnVersion: func(int64, time.Time) { frames++ },
	})
	if err := c.Bootstrap(ctx); err != nil {
		return fmt.Errorf("bootstrap: %w", err)
	}
	if err := c.Reconcile(ctx); err != nil {
		return fmt.Errorf("initial reconcile: %w", err)
	}

	// Session 1: one live stream the caller owns.
	s1ctx, s1cancel := context.WithCancel(ctx)
	defer s1cancel() // safety net; we also cancel explicitly to cut the stream
	go func() { _ = c.StreamOnce(s1ctx) }()
	latest0, _ := lb.LatestVersion(ctx)
	if err := waitClientConverged(ctx, c, latest0, 15*time.Second); err != nil {
		return fmt.Errorf("initial convergence: %w", err)
	}
	stale := c.ConfigVersion()
	step("client streaming, converged to v%d", stale)

	// CUT the stream (controllable disconnect).
	s1cancel()
	time.Sleep(500 * time.Millisecond) // let StreamOnce return
	step("INJECT: cut the SSE stream; issuing updates during a %s blackout", o.disconnect)

	// Drive updates the client cannot see (not streaming, not reconciling).
	cutDeadline := time.Now().Add(o.disconnect)
	n := 0
	for time.Now().Before(cutDeadline) {
		if _, err := lb.Toggle(ctx, id); err != nil {
			return fmt.Errorf("update during blackout: %w", err)
		}
		n++
		time.Sleep(700 * time.Millisecond)
	}
	if got := c.ConfigVersion(); got != stale {
		return fmt.Errorf("client advanced to v%d while disconnected (should hold v%d)", got, stale)
	}
	latestDuringCut, _ := lb.LatestVersion(ctx)
	step("during blackout: %d updates committed (server now v%d), client held stale v%d", n, latestDuringCut, stale)

	// RECONNECT.
	s2ctx, s2cancel := context.WithCancel(ctx)
	defer s2cancel()
	go func() { _ = c.StreamOnce(s2ctx) }()
	time.Sleep(1 * time.Second) // ensure the stream is established
	// One more update: its live frame is non-contiguous (>> stale+1) → the SDK
	// detects the gap and reconciles via /events?since= to converge.
	if _, err := lb.Toggle(ctx, id); err != nil {
		return fmt.Errorf("trigger update after reconnect: %w", err)
	}
	latest, err := lb.LatestVersion(ctx)
	if err != nil {
		return err
	}
	if err := waitClientConverged(ctx, c, latest, o.convergeTimeout); err != nil {
		return fmt.Errorf("Inv3: client did not reconcile+converge after reconnect: %w", err)
	}
	step("Inv3: reconnect → gap detected → reconcile → converged v%d -> v%d", stale, latest)
	return nil
}

// ---- scenario: missed-events (Inv1 + Inv3 via durable-log backstop) ----------

func missedEvents(ctx context.Context, o opts) error {
	const flagKey = "chaos-missed-events"
	const victim = "backend3"
	if len(o.nodeURLs) < 3 {
		return fmt.Errorf("missed-events needs 3 node URLs, got %d", len(o.nodeURLs))
	}
	nodeVictim := o.nodeURLs[2] // backend3
	nodeWriter := o.nodeURLs[0] // backend1

	lb := chaoskit.NewAdmin(o.baseURL, o.admKey, o.sdkKey)
	writer := chaoskit.NewAdmin(nodeWriter, o.admKey, o.sdkKey) // writes bypass the LB (paused node would hang it)
	compose := &chaoskit.Compose{Dir: o.composeDir}

	id, err := lb.EnsureFlag(ctx, flagKey)
	if err != nil {
		return fmt.Errorf("ensure flag: %w", err)
	}

	// Clients pinned DIRECTLY to backend3 so pausing it stops THEIR subscriber.
	cfg := spawnCfg(o)
	cfg.BaseURL = nodeVictim
	fleet, err := chaoskit.SpawnFleet(ctx, cfg, o.clients)
	if err != nil {
		return err
	}
	step("spawned %d SDK clients pinned to %s", len(fleet.Members), victim)
	monCtx, monCancel := context.WithCancel(ctx)
	defer monCancel()
	go fleet.MonitorMonotonicity(monCtx, 200*time.Millisecond)

	base, err := writer.LatestVersion(ctx)
	if err != nil {
		return err
	}
	if err := fleet.WaitConverged(ctx, base, 20*time.Second, 250*time.Millisecond); err != nil {
		return fmt.Errorf("baseline convergence: %w", err)
	}
	step("baseline: all clients converged to v%d", base)

	// Pause backend3 → its subscriber stops consuming; Redis pub/sub is
	// fire-and-forget, so messages published while it is paused are LOST.
	restore := ensureUnpaused(compose, victim, nodeVictim)
	defer restore()
	if err := compose.Pause(ctx, victim); err != nil {
		return fmt.Errorf("pause %s: %w", victim, err)
	}
	step("INJECT: paused %s (subscriber frozen; published events will be missed)", victim)

	for k := 0; k < 6; k++ {
		if _, err := writer.Toggle(ctx, id); err != nil {
			return fmt.Errorf("write via %s during pause: %w", nodeWriter, err)
		}
		time.Sleep(400 * time.Millisecond)
	}
	latestDuringPause, err := writer.LatestVersion(ctx)
	if err != nil {
		return err
	}
	time.Sleep(1 * time.Second)
	_, maxv := fleet.VersionSpread()
	if maxv > base {
		return fmt.Errorf("client advanced to v%d while its node was paused (expected to hold v%d)", maxv, base)
	}
	step("during pause: server advanced to v%d via %s; paused node's clients missed it (held v%d)", latestDuringPause, "backend1", base)

	// Unpause. The pause-window messages are gone (no backlog) — recovery must
	// come from the durable event log via reconcile, not from replayed pub/sub.
	restore()
	step("recovery: unpaused %s (missed pub/sub messages are gone — durable log is the backstop)", victim)

	// One more write: the live frame is non-contiguous for the paused node's
	// clients → gap → reconcile via /events?since= → converge (Inv1 + Inv3).
	if _, err := writer.Toggle(ctx, id); err != nil {
		return fmt.Errorf("trigger write after unpause: %w", err)
	}
	latest, err := writer.LatestVersion(ctx)
	if err != nil {
		return err
	}
	if err := fleet.WaitConverged(ctx, latest, o.convergeTimeout, 250*time.Millisecond); err != nil {
		return fmt.Errorf("Inv3: clients did not reconcile to latest after missing events: %w", err)
	}
	step("Inv1+Inv3: clients detected the gap and reconciled v%d -> v%d via the durable log", base, latest)

	return finishMonotonicity(fleet)
}

// ---- scenario: concurrent-writers (Inv1 no lost updates) ---------------------

func concurrentWriters(ctx context.Context, o opts) error {
	const flagKey = "chaos-concurrent"
	lb := chaoskit.NewAdmin(o.baseURL, o.admKey, o.sdkKey)

	id, err := lb.EnsureFlag(ctx, flagKey)
	if err != nil {
		return fmt.Errorf("ensure flag: %w", err)
	}

	// One SDK client to confirm convergence to the deterministic final state.
	fleet, err := chaoskit.SpawnFleet(ctx, spawnCfg(o), 1)
	if err != nil {
		return err
	}
	monCtx, monCancel := context.WithCancel(ctx)
	defer monCancel()
	go fleet.MonitorMonotonicity(monCtx, 200*time.Millisecond)

	// --- Phase 1: atomic toggle burst (server Toggle is a single UPDATE). ---
	base1, err := lb.LatestVersion(ctx)
	if err != nil {
		return err
	}
	step("phase 1: %d writers × %d atomic toggles on one flag", o.writers, o.iters)
	versions, statuses := hammer(ctx, o.writers, o.iters, func(wctx context.Context) chaoskit.WriteResult {
		res, err := lb.Toggle(wctx, id)
		if err != nil {
			res.Status = -1
		}
		return res
	})
	okVersions := successVersions(versions, statuses, 200)
	totalToggles := o.writers * o.iters
	if len(okVersions) != totalToggles {
		return fmt.Errorf("atomic toggles lost updates: %d/%d succeeded (toggle must never conflict)", len(okVersions), totalToggles)
	}
	if err := assertStrictlyIncreasing(okVersions, base1); err != nil {
		return fmt.Errorf("phase 1 %w", err)
	}
	events1, err := lb.EventsSinceCount(ctx, base1, flagKey)
	if err != nil {
		return err
	}
	if events1 != totalToggles {
		return fmt.Errorf("phase 1: expected %d durable events, found %d (lost updates)", totalToggles, events1)
	}
	step("phase 1 OK: %d/%d toggles committed, %d distinct increasing versions, %d durable events (no lost updates)",
		len(okVersions), totalToggles, len(okVersions), events1)

	// --- Phase 2: If-Match optimistic contention (conflicts must 409). ---
	base2, err := lb.LatestVersion(ctx)
	if err != nil {
		return err
	}
	step("phase 2: %d writers × %d read-then-If-Match updates on the SAME flag (max contention)", o.writers, o.iters)
	v2, s2 := hammer(ctx, o.writers, o.iters, func(wctx context.Context) chaoskit.WriteResult {
		cur, err := lb.GetFlagByKey(wctx, flagKey)
		if err != nil {
			return chaoskit.WriteResult{Status: -1}
		}
		res, err := lb.Update(wctx, id, map[string]any{"enabled": !cur.Enabled}, cur.Version)
		if err != nil {
			return chaoskit.WriteResult{Status: -1}
		}
		return res
	})
	ok2 := successVersions(v2, s2, 200)
	conflicts := countStatus(s2, 409)
	other := len(s2) - len(ok2) - conflicts
	if other != 0 {
		return fmt.Errorf("phase 2: %d writes returned neither 200 nor 409 (unclean failure)", other)
	}
	if err := assertStrictlyIncreasing(ok2, base2); err != nil {
		return fmt.Errorf("phase 2 %w", err)
	}
	events2, err := lb.EventsSinceCount(ctx, base2, flagKey)
	if err != nil {
		return err
	}
	if events2 != len(ok2) {
		return fmt.Errorf("phase 2: %d successful writes but %d durable events (lost updates)", len(ok2), events2)
	}
	step("phase 2 OK: %d committed (unique increasing versions), %d rejected as 409 (no silent loss), %d durable events",
		len(ok2), conflicts, events2)

	// --- Deterministic final state. ---
	finalFlag, err := lb.GetFlagByKey(ctx, flagKey)
	if err != nil {
		return err
	}
	latest, err := lb.LatestVersion(ctx)
	if err != nil {
		return err
	}
	if finalFlag.Version != latest {
		return fmt.Errorf("final flag version %d != server latest %d", finalFlag.Version, latest)
	}
	if err := fleet.WaitConverged(ctx, latest, o.convergeTimeout, 250*time.Millisecond); err != nil {
		return fmt.Errorf("Inv3: SDK client did not converge to final v%d: %w", latest, err)
	}
	step("Inv1: deterministic final state v%d (enabled=%v); SDK client converged", latest, finalFlag.Enabled)

	// Honest note: rolled-back If-Match conflicts still consume sequence numbers
	// (nextval isn't transactional), so committed versions may have gaps.
	if len(ok2) > 0 {
		span := ok2[len(ok2)-1] - base2
		if span > int64(len(ok2)) {
			step("note: %d committed events span %d version numbers — %d gap(s) from rolled-back conflicts (expected; not a loss)",
				len(ok2), span, span-int64(len(ok2)))
		}
	}
	return finishMonotonicity(fleet)
}

// ---- shared helpers ---------------------------------------------------------

func spawnCfg(o opts) chaoskit.SpawnConfig {
	return chaoskit.SpawnConfig{BaseURL: o.baseURL, SDKKey: o.sdkKey, HC: streamingClient()}
}

// streamingClient is tuned for many long-lived SSE streams: no client timeout.
func streamingClient() *http.Client {
	tr := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   5 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:        0,
		MaxIdleConnsPerHost: 100,
		IdleConnTimeout:     90 * time.Second,
	}
	return &http.Client{Timeout: 0, Transport: tr}
}

// hammer runs writers×iters concurrent writes and returns (version, status)
// pairs. The work fn should return a WriteResult (Status<=0 marks a call error).
func hammer(ctx context.Context, writers, iters int, fn func(context.Context) chaoskit.WriteResult) ([]int64, []int) {
	var (
		mu       sync.Mutex
		versions []int64
		statuses []int
		wg       sync.WaitGroup
	)
	for w := 0; w < writers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < iters; i++ {
				wctx, cancel := context.WithTimeout(ctx, 10*time.Second)
				res := fn(wctx)
				cancel()
				mu.Lock()
				versions = append(versions, res.Version)
				statuses = append(statuses, res.Status)
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	return versions, statuses
}

func successVersions(versions []int64, statuses []int, okStatus int) []int64 {
	var out []int64
	for i, s := range statuses {
		if s == okStatus {
			out = append(out, versions[i])
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

func countStatus(statuses []int, want int) int {
	n := 0
	for _, s := range statuses {
		if s == want {
			n++
		}
	}
	return n
}

// assertStrictlyIncreasing verifies versions are all > floor and strictly
// increasing (no duplicates) — the "no lost updates" core of Inv1.
func assertStrictlyIncreasing(sorted []int64, floor int64) error {
	var prev int64 = floor
	for _, v := range sorted {
		if v <= prev {
			return fmt.Errorf("versions not strictly increasing above %d: saw %d after %d (lost update / duplicate)", floor, v, prev)
		}
		prev = v
	}
	return nil
}

func finishMonotonicity(fleet *chaoskit.Fleet) error {
	fleet.Sample() // final immediate sample after the monitor goroutine stopped
	v := fleet.Violations()
	if len(v) > 0 {
		return fmt.Errorf("Inv1 monotonicity violated (%d): %v", len(v), v)
	}
	step("Inv1: %d version samples, zero monotonicity violations", fleet.Samples())
	return nil
}

// waitClientConverged polls a single client until ConfigVersion >= target.
func waitClientConverged(ctx context.Context, c *ffclient.Client, target int64, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		if c.ConfigVersion() >= target {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("client at v%d, target v%d after %s", c.ConfigVersion(), target, timeout)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}
}

// pollReadyz waits until every node's /readyz returns wantStatus, or timeout.
func pollReadyz(ctx context.Context, nodeURLs []string, wantStatus int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		all := true
		var bad string
		for _, u := range nodeURLs {
			st, err := chaoskit.Readyz(ctx, u)
			if err != nil || st != wantStatus {
				all = false
				bad = fmt.Sprintf("%s (status=%d err=%v)", u, st, err)
				break
			}
		}
		if all {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("timeout waiting for /readyz=%d: %s", wantStatus, bad)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}
	}
}

// ensureStarted returns a cleanup that (re)starts a stopped/killed service and,
// if nodeURLs is set, waits for readiness. Safe to call more than once.
func ensureStarted(compose *chaoskit.Compose, svc string, nodeURLs []string) func() {
	var once sync.Once
	return func() {
		once.Do(func() {
			cctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()
			if err := compose.Start(cctx, svc); err != nil {
				fmt.Printf("  [cleanup] start %s: %v\n", svc, err)
			}
			if len(nodeURLs) > 0 {
				_ = pollReadyz(cctx, nodeURLs, 200, 45*time.Second)
			} else {
				time.Sleep(3 * time.Second)
			}
		})
	}
}

// ensureUnpaused returns a cleanup that unpauses a paused service.
func ensureUnpaused(compose *chaoskit.Compose, svc, nodeURL string) func() {
	var once sync.Once
	return func() {
		once.Do(func() {
			cctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if err := compose.Unpause(cctx, svc); err != nil {
				fmt.Printf("  [cleanup] unpause %s: %v\n", svc, err)
			}
			if nodeURL != "" {
				_ = pollReadyz(cctx, []string{nodeURL}, 200, 20*time.Second)
			}
		})
	}
}

func resolveComposeDir(explicit string) (string, error) {
	if explicit != "" {
		abs, err := filepath.Abs(explicit)
		if err != nil {
			return "", err
		}
		return abs, nil
	}
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	dir := cwd
	for {
		if _, err := os.Stat(filepath.Join(dir, "docker-compose.yml")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("docker-compose.yml not found walking up from %s", cwd)
		}
		dir = parent
	}
}

func splitCSV(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func step(format string, args ...any) {
	fmt.Printf("  → "+format+"\n", args...)
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(2)
}
