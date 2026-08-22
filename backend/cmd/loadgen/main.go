// Command loadgen is the Week-3 load / benchmark driver for the feature-flag
// system, built on the ffclient Go SDK. It has two modes:
//
//	propagation  Spawn N virtual clients (each a real ffclient with its own SSE
//	             stream + local eval loop through the LB), drive M admin toggles,
//	             and measure end-to-end propagation latency: time from admin
//	             commit (t0, when the write returns the new version) to when each
//	             connected client observes that version on its stream (t1).
//	eval         Single-process pure-CPU benchmark of local IsEnabled() over a
//	             fixed flag/user matrix — throughput + per-eval percentiles.
//
// It prints a human table and a JSON blob (config + measured percentiles +
// peak goroutines/HeapAlloc). Numbers are measured, never modeled: if a run
// saturates the host or hits fd limits, lower the load and record the ceiling.
//
// Examples (cluster from docker-compose, LB on :8080):
//
//	# raise the fd limit first — 2000 SSE clients need 2000+ descriptors
//	ulimit -n 20000
//
//	go run ./cmd/loadgen -mode propagation -clients 1000 -updates 20 \
//	  -update-interval 500ms -eval-rate 10 -warmup 5s
//
//	go run ./cmd/loadgen -mode eval -eval-duration 10s -eval-workers 10
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"runtime"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/feature-flag-system/backend/pkg/ffclient"
)

func main() {
	var (
		mode    = flag.String("mode", "propagation", "propagation | eval")
		baseURL = flag.String("base-url", "http://localhost:8080", "cluster base URL (nginx LB)")
		sdkKey  = flag.String("sdk-key", "sdk-secret-key", "SDK key (X-SDK-Key)")
		admKey  = flag.String("admin-key", "admin-secret-key", "admin API key (X-Admin-API-Key)")

		clients        = flag.Int("clients", 1000, "propagation: number of virtual SSE clients")
		updates        = flag.Int("updates", 20, "propagation: number of admin toggles to drive")
		updateInterval = flag.Duration("update-interval", 500*time.Millisecond, "propagation: delay between toggles")
		evalRate       = flag.Float64("eval-rate", 10, "propagation: local evals/sec per virtual client (0 = off)")
		warmup         = flag.Duration("warmup", 5*time.Second, "propagation: settle time after all clients connect")
		settle         = flag.Duration("settle", 3*time.Second, "propagation: drain time after the last toggle")
		benchFlag      = flag.String("flag", "loadgen-bench", "propagation: flag key to toggle (auto-created)")

		evalDuration = flag.Duration("eval-duration", 10*time.Second, "eval: measurement window")
		evalWorkers  = flag.Int("eval-workers", runtime.NumCPU(), "eval: parallel goroutines for throughput")
		evalUsers    = flag.Int("eval-users", 1000, "eval: distinct user IDs in the matrix")

		jsonOut = flag.Bool("json", true, "print a JSON summary block")
	)
	flag.Parse()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	switch *mode {
	case "propagation":
		cfg := propConfig{
			baseURL: *baseURL, sdkKey: *sdkKey, admKey: *admKey,
			clients: *clients, updates: *updates, updateInterval: *updateInterval,
			evalRate: *evalRate, warmup: *warmup, settle: *settle, flagKey: *benchFlag,
			jsonOut: *jsonOut,
		}
		if err := runPropagation(ctx, cfg); err != nil {
			fmt.Fprintf(os.Stderr, "propagation run failed: %v\n", err)
			os.Exit(1)
		}
	case "eval":
		cfg := evalConfig{
			baseURL: *baseURL, sdkKey: *sdkKey,
			duration: *evalDuration, workers: *evalWorkers, users: *evalUsers,
			jsonOut: *jsonOut,
		}
		if err := runEval(ctx, cfg); err != nil {
			fmt.Fprintf(os.Stderr, "eval run failed: %v\n", err)
			os.Exit(1)
		}
	default:
		fmt.Fprintf(os.Stderr, "unknown -mode %q (want propagation | eval)\n", *mode)
		os.Exit(2)
	}
}

// sharedTransport builds one HTTP transport tuned for many long-lived SSE
// connections: no client-side timeout (SSE streams stay open) and a high
// per-host connection ceiling so nginx/backends — not the harness — are the
// bottleneck under test.
func sharedHTTPClient() *http.Client {
	tr := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   5 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:        0,
		MaxIdleConnsPerHost: 100,
		MaxConnsPerHost:     0,
		IdleConnTimeout:     90 * time.Second,
		// No ResponseHeaderTimeout: SSE responses stream indefinitely.
	}
	return &http.Client{Timeout: 0, Transport: tr}
}

// ---- propagation mode -------------------------------------------------------

type propConfig struct {
	baseURL, sdkKey, admKey        string
	clients, updates               int
	updateInterval, warmup, settle time.Duration
	evalRate                       float64
	flagKey                        string
	jsonOut                        bool
}

// observation records that a virtual client saw a version at a wall-clock time.
type observation struct {
	clientID int
	version  int64
	at       time.Time
}

func runPropagation(ctx context.Context, cfg propConfig) error {
	hc := sharedHTTPClient()
	admin := &adminClient{baseURL: cfg.baseURL, key: cfg.admKey, hc: hc}

	// Ensure the bench flag exists and grab its id + the current global version.
	flagID, err := admin.ensureFlag(ctx, cfg.flagKey)
	if err != nil {
		return fmt.Errorf("ensure bench flag: %w", err)
	}
	baseVersion, err := admin.latestVersion(ctx, cfg.sdkKey)
	if err != nil {
		return fmt.Errorf("read base version: %w", err)
	}

	// Collector: only versions committed during the run (> baseVersion) matter.
	var (
		obsMu sync.Mutex
		obs   []observation
	)
	record := func(id int) func(int64, time.Time) {
		return func(v int64, at time.Time) {
			if v <= baseVersion {
				return
			}
			obsMu.Lock()
			obs = append(obs, observation{clientID: id, version: v, at: at})
			obsMu.Unlock()
		}
	}

	// Spawn N virtual clients, each with its own SSE stream + eval loop.
	fmt.Printf("spawning %d virtual clients against %s ...\n", cfg.clients, cfg.baseURL)
	var (
		connWG    sync.WaitGroup
		connected int64
		startErr  atomic.Value // error
	)
	vclients := make([]*ffclient.Client, cfg.clients)
	for i := 0; i < cfg.clients; i++ {
		i := i
		connWG.Add(1)
		go func() {
			defer connWG.Done()
			c := ffclient.New(ffclient.Config{
				BaseURL:    cfg.baseURL,
				SDKKey:     cfg.sdkKey,
				HTTPClient: hc,
				OnVersion:  record(i),
			})
			if err := c.Start(ctx); err != nil {
				startErr.Store(err)
				return
			}
			vclients[i] = c
			atomic.AddInt64(&connected, 1)
			// Per-client local eval loop (exercises RLock + local FNV eval).
			if cfg.evalRate > 0 {
				go evalLoop(ctx, c, cfg.flagKey, i, cfg.evalRate)
			}
		}()
	}
	connWG.Wait()
	if e := startErr.Load(); e != nil && atomic.LoadInt64(&connected) == 0 {
		return fmt.Errorf("all clients failed to start: %v", e)
	}
	nConnected := int(atomic.LoadInt64(&connected))
	fmt.Printf("connected %d/%d clients; warming up %s ...\n", nConnected, cfg.clients, cfg.warmup)
	sleepCtx(ctx, cfg.warmup)

	// Peak resource snapshot (harness side) while all connections are live.
	peakGoroutines := runtime.NumGoroutine()
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	peakHeapMB := float64(ms.HeapAlloc) / (1024 * 1024)

	// Drive M admin toggles; t0 = time the admin write returns the new version.
	fmt.Printf("driving %d toggles every %s ...\n", cfg.updates, cfg.updateInterval)
	commits := make(map[int64]time.Time, cfg.updates)
	for u := 0; u < cfg.updates; u++ {
		if ctx.Err() != nil {
			break
		}
		version, t0, err := admin.toggle(ctx, flagID)
		if err != nil {
			fmt.Fprintf(os.Stderr, "toggle %d failed: %v\n", u, err)
			continue
		}
		commits[version] = t0
		if u < cfg.updates-1 {
			sleepCtx(ctx, cfg.updateInterval)
		}
	}
	fmt.Printf("toggles done; settling %s to catch stragglers ...\n", cfg.settle)
	sleepCtx(ctx, cfg.settle)

	// Correlate: for each committed version, latency = observedAt - commitTime.
	obsMu.Lock()
	snapshot := make([]observation, len(obs))
	copy(snapshot, obs)
	obsMu.Unlock()

	var latenciesMS []float64
	deliveredPerVersion := make(map[int64]int, len(commits))
	for _, o := range snapshot {
		t0, ok := commits[o.version]
		if !ok {
			continue
		}
		d := o.at.Sub(t0)
		if d < 0 {
			d = 0 // clock skew guard within one process; should not happen
		}
		latenciesMS = append(latenciesMS, float64(d.Microseconds())/1000.0)
		deliveredPerVersion[o.version]++
	}

	stats := ffclient.Percentiles(latenciesMS)

	// Delivery completeness: mean fraction of connected clients that saw each version.
	var totalDelivered int
	for _, n := range deliveredPerVersion {
		totalDelivered += n
	}
	expected := nConnected * len(commits)
	deliveryPct := 0.0
	if expected > 0 {
		deliveryPct = 100 * float64(totalDelivered) / float64(expected)
	}

	res := propResult{
		Mode:              "propagation",
		BaseURL:           cfg.baseURL,
		RequestedClients:  cfg.clients,
		ConnectedClients:  nConnected,
		Updates:           len(commits),
		EvalRatePerClient: cfg.evalRate,
		PeakGoroutines:    peakGoroutines,
		PeakHeapAllocMB:   peakHeapMB,
		SamplesCount:      stats.Count,
		DeliveryPct:       deliveryPct,
		PropagationMS:     stats,
	}
	printPropResult(res, cfg.jsonOut)
	// Virtual clients keep streaming until main's deferred cancel() fires on return.
	return nil
}

func evalLoop(ctx context.Context, c *ffclient.Client, flagKey string, id int, rate float64) {
	interval := time.Duration(float64(time.Second) / rate)
	if interval <= 0 {
		interval = time.Millisecond
	}
	t := time.NewTicker(interval)
	defer t.Stop()
	user := fmt.Sprintf("vuser-%d", id)
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			_ = c.IsEnabled(flagKey, user)
		}
	}
}

type propResult struct {
	Mode              string         `json:"mode"`
	BaseURL           string         `json:"base_url"`
	RequestedClients  int            `json:"requested_clients"`
	ConnectedClients  int            `json:"connected_clients"`
	Updates           int            `json:"updates"`
	EvalRatePerClient float64        `json:"eval_rate_per_client"`
	PeakGoroutines    int            `json:"peak_goroutines"`
	PeakHeapAllocMB   float64        `json:"peak_heap_alloc_mb"`
	SamplesCount      int            `json:"samples_count"`
	DeliveryPct       float64        `json:"delivery_pct"`
	PropagationMS     ffclient.Stats `json:"propagation_ms"`
}

func printPropResult(r propResult, jsonOut bool) {
	fmt.Println()
	fmt.Println("=== propagation latency (admin commit -> client SSE observe) ===")
	fmt.Printf("  clients (connected/requested) : %d / %d\n", r.ConnectedClients, r.RequestedClients)
	fmt.Printf("  toggles driven                : %d\n", r.Updates)
	fmt.Printf("  samples (client x version)    : %d\n", r.SamplesCount)
	fmt.Printf("  delivery completeness         : %.2f%%\n", r.DeliveryPct)
	fmt.Printf("  peak goroutines (harness)     : %d\n", r.PeakGoroutines)
	fmt.Printf("  peak HeapAlloc (harness)      : %.1f MB\n", r.PeakHeapAllocMB)
	fmt.Printf("  latency ms  p50=%.1f  p95=%.1f  p99=%.1f  min=%.1f  max=%.1f  mean=%.1f\n",
		r.PropagationMS.P50, r.PropagationMS.P95, r.PropagationMS.P99,
		r.PropagationMS.Min, r.PropagationMS.Max, r.PropagationMS.Mean)
	if jsonOut {
		b, _ := json.MarshalIndent(r, "", "  ")
		fmt.Println("\n--- JSON ---")
		fmt.Println(string(b))
	}
}

// ---- eval mode --------------------------------------------------------------

type evalConfig struct {
	baseURL, sdkKey string
	duration        time.Duration
	workers, users  int
	jsonOut         bool
}

func runEval(ctx context.Context, cfg evalConfig) error {
	// Bootstrap a real snapshot so the eval matrix uses production flags.
	hc := sharedHTTPClient()
	c := ffclient.New(ffclient.Config{BaseURL: cfg.baseURL, SDKKey: cfg.sdkKey, HTTPClient: hc})
	bctx, bcancel := context.WithTimeout(ctx, 10*time.Second)
	err := c.Bootstrap(bctx)
	bcancel()
	if err != nil {
		return fmt.Errorf("bootstrap for eval matrix: %w", err)
	}
	flagsMap := c.Flags()
	flagKeys := make([]string, 0, len(flagsMap))
	for k := range flagsMap {
		flagKeys = append(flagKeys, k)
	}
	sort.Strings(flagKeys)
	if len(flagKeys) == 0 {
		return fmt.Errorf("no flags in snapshot; create at least one flag before the eval benchmark")
	}
	users := make([]string, cfg.users)
	for i := range users {
		users[i] = fmt.Sprintf("user-%d", i)
	}

	fmt.Printf("eval bench: %d flags x %d users, %d workers, %s window ...\n",
		len(flagKeys), cfg.users, cfg.workers, cfg.duration)

	// Throughput: N workers hammering the matrix for the full window.
	var totalOps int64
	deadline := time.Now().Add(cfg.duration)
	var wg sync.WaitGroup
	start := time.Now()
	for w := 0; w < cfg.workers; w++ {
		w := w
		wg.Add(1)
		go func() {
			defer wg.Done()
			var ops int64
			ui := w
			fi := 0
			for time.Now().Before(deadline) {
				// Inner batch to amortize the time.Now() check.
				for k := 0; k < 2000; k++ {
					_ = c.IsEnabled(flagKeys[fi], users[ui])
					fi++
					if fi >= len(flagKeys) {
						fi = 0
					}
					ui++
					if ui >= len(users) {
						ui = 0
					}
				}
				ops += 2000
			}
			atomic.AddInt64(&totalOps, ops)
		}()
	}
	wg.Wait()
	elapsed := time.Since(start)
	throughput := float64(totalOps) / elapsed.Seconds()

	// Per-eval latency: single-thread sampled (nanosecond-scale ops).
	const latSamples = 200000
	latenciesUS := make([]float64, 0, latSamples)
	ui, fi := 0, 0
	for i := 0; i < latSamples; i++ {
		t0 := time.Now()
		_ = c.IsEnabled(flagKeys[fi], users[ui])
		latenciesUS = append(latenciesUS, float64(time.Since(t0).Nanoseconds())/1000.0)
		fi = (fi + 1) % len(flagKeys)
		ui = (ui + 1) % len(users)
	}
	stats := ffclient.Percentiles(latenciesUS)

	res := evalResult{
		Mode:          "eval",
		Flags:         len(flagKeys),
		Users:         cfg.users,
		Workers:       cfg.workers,
		WindowSeconds: elapsed.Seconds(),
		TotalOps:      totalOps,
		EvalsPerSec:   throughput,
		PerEvalUS:     stats,
	}
	printEvalResult(res, cfg.jsonOut)
	return nil
}

type evalResult struct {
	Mode          string         `json:"mode"`
	Flags         int            `json:"flags"`
	Users         int            `json:"users"`
	Workers       int            `json:"workers"`
	WindowSeconds float64        `json:"window_seconds"`
	TotalOps      int64          `json:"total_ops"`
	EvalsPerSec   float64        `json:"evals_per_sec"`
	PerEvalUS     ffclient.Stats `json:"per_eval_us"`
}

func printEvalResult(r evalResult, jsonOut bool) {
	fmt.Println()
	fmt.Println("=== local eval throughput (IsEnabled, pure CPU, no network) ===")
	fmt.Printf("  matrix              : %d flags x %d users\n", r.Flags, r.Users)
	fmt.Printf("  workers             : %d\n", r.Workers)
	fmt.Printf("  window              : %.2fs\n", r.WindowSeconds)
	fmt.Printf("  total evals         : %d\n", r.TotalOps)
	fmt.Printf("  throughput          : %.0f evals/sec\n", r.EvalsPerSec)
	fmt.Printf("  per-eval us (1 thd) : p50=%.3f p95=%.3f p99=%.3f min=%.3f max=%.3f\n",
		r.PerEvalUS.P50, r.PerEvalUS.P95, r.PerEvalUS.P99, r.PerEvalUS.Min, r.PerEvalUS.Max)
	if jsonOut {
		b, _ := json.MarshalIndent(r, "", "  ")
		fmt.Println("\n--- JSON ---")
		fmt.Println(string(b))
	}
}

// ---- admin client -----------------------------------------------------------

type adminClient struct {
	baseURL, key string
	hc           *http.Client
}

func (a *adminClient) do(ctx context.Context, method, path string, body []byte) (*http.Response, error) {
	var r *bytes.Reader
	if body != nil {
		r = bytes.NewReader(body)
	} else {
		r = bytes.NewReader(nil)
	}
	req, err := http.NewRequestWithContext(ctx, method, a.baseURL+path, r)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Admin-API-Key", a.key)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return a.hc.Do(req)
}

// ensureFlag returns the id of flagKey, creating it if absent.
func (a *adminClient) ensureFlag(ctx context.Context, flagKey string) (string, error) {
	// Try to create; on 409 it already exists → look it up in the list.
	body, _ := json.Marshal(map[string]any{
		"key":                flagKey,
		"description":        "loadgen benchmark flag (safe to toggle)",
		"enabled":            true,
		"rollout_percentage": 50,
		"targeted_users":     []string{},
	})
	resp, err := a.do(ctx, "POST", "/api/admin/flags", body)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusCreated {
		var f struct {
			ID string `json:"id"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&f); err != nil {
			return "", err
		}
		return f.ID, nil
	}
	if resp.StatusCode != http.StatusConflict {
		return "", fmt.Errorf("create flag: status %d", resp.StatusCode)
	}

	// Already exists → find it.
	lr, err := a.do(ctx, "GET", "/api/admin/flags", nil)
	if err != nil {
		return "", err
	}
	defer lr.Body.Close()
	var list struct {
		Flags []struct {
			ID  string `json:"id"`
			Key string `json:"key"`
		} `json:"flags"`
	}
	if err := json.NewDecoder(lr.Body).Decode(&list); err != nil {
		return "", err
	}
	for _, f := range list.Flags {
		if f.Key == flagKey {
			return f.ID, nil
		}
	}
	return "", fmt.Errorf("flag %q exists but was not found in list", flagKey)
}

// toggle flips the flag and returns the committed version and the wall-clock
// time the write completed (t0 for propagation timing).
func (a *adminClient) toggle(ctx context.Context, flagID string) (int64, time.Time, error) {
	resp, err := a.do(ctx, "PATCH", "/api/admin/flags/"+flagID+"/toggle", nil)
	if err != nil {
		return 0, time.Time{}, err
	}
	t0 := time.Now() // commit is visible to callers the instant the write returns
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, time.Time{}, fmt.Errorf("toggle: status %d", resp.StatusCode)
	}
	var f struct {
		Version int64 `json:"version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&f); err != nil {
		return 0, time.Time{}, err
	}
	return f.Version, t0, nil
}

// latestVersion reads the current global config version via the client API.
func (a *adminClient) latestVersion(ctx context.Context, sdkKey string) (int64, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", a.baseURL+"/api/client/version", nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("X-SDK-Key", sdkKey)
	resp, err := a.hc.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("version: status %d", resp.StatusCode)
	}
	var v struct {
		ConfigVersion int64 `json:"config_version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		return 0, err
	}
	return v.ConfigVersion, nil
}

func sleepCtx(ctx context.Context, d time.Duration) {
	if d <= 0 {
		return
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
	case <-t.C:
	}
}
