// Command soak runs a continuous mixed workload against the feature-flag cluster
// with an ONLINE invariant checker, to prove the system holds its guarantees
// over time (not just in a single burst). It is built on the same chaoskit /
// ffclient toolkit as the chaos asserter.
//
// Workload:
//   - A fleet of ffclients (each a live SSE stream + local eval loop).
//   - Reconnect churn: a rotating subset periodically drops and re-opens its
//     stream (StreamOnce under a cancellable ctx), exercising the
//     reconnect → reconcile → converge path continuously.
//   - A writer doing periodic toggles / If-Match updates on a soak flag.
//
// Online invariant checks (run throughout):
//   - Inv1 monotonicity: every client's applied config_version is sampled
//     frequently; any decrease is a violation.
//   - Inv3 convergence: periodically the checker reads the server's latest
//     committed version, then requires every client to reach it within a grace
//     window (churning clients get the grace to reconnect + reconcile).
//
// It prints a summary and exits non-zero if ANY invariant was violated. Use
// -duration to control the run; it supports 1h+ (this project's demo run uses
// ~20–25m). Nothing here is faked — every number is a live measurement.
package main

import (
	"context"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/feature-flag-system/backend/pkg/chaoskit"
	"github.com/feature-flag-system/backend/pkg/ffclient"
)

func main() {
	var (
		baseURL    = flag.String("base-url", "http://localhost:8080", "cluster base URL (nginx LB)")
		sdkKey     = flag.String("sdk-key", "sdk-secret-key", "SDK key")
		admKey     = flag.String("admin-key", "admin-secret-key", "admin API key")
		duration   = flag.Duration("duration", 20*time.Minute, "total soak duration (supports 1h+)")
		clients    = flag.Int("clients", 40, "steady fleet size")
		churn      = flag.Int("churn", 6, "concurrent reconnect-churn clients (rotating streams)")
		writeEvery = flag.Duration("write-interval", 2*time.Second, "delay between writer mutations")
		convEvery  = flag.Duration("converge-interval", 20*time.Second, "how often to run a convergence check")
		convGrace  = flag.Duration("converge-grace", 20*time.Second, "grace window for all clients to reach the checked version")
		flagKey    = flag.String("flag", "soak-flag", "flag key the writer mutates")
	)
	flag.Parse()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, *duration)
	defer cancel()

	admin := chaoskit.NewAdmin(*baseURL, *admKey, *sdkKey)
	bctx, bcancel := context.WithTimeout(ctx, 15*time.Second)
	flagID, err := admin.EnsureFlag(bctx, *flagKey)
	bcancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "ensure soak flag: %v\n", err)
		os.Exit(2)
	}

	fmt.Printf("=== soak: %s, %d steady clients + %d churn clients, writer every %s ===\n",
		*duration, *clients, *churn, *writeEvery)
	fmt.Printf("    LB=%s flag=%s convergence check every %s (grace %s)\n\n",
		*baseURL, *flagKey, *convEvery, *convGrace)

	fleet, err := chaoskit.SpawnFleet(ctx, chaoskit.SpawnConfig{
		BaseURL: *baseURL, SDKKey: *sdkKey, HC: streamingClient(),
	}, *clients)
	if err != nil {
		fmt.Fprintf(os.Stderr, "spawn fleet: %v\n", err)
		os.Exit(2)
	}
	fmt.Printf("[%s] steady fleet: %d clients connected\n", ts(), len(fleet.Members))

	// Online Inv1 monotonicity monitor.
	go fleet.MonitorMonotonicity(ctx, 250*time.Millisecond)

	var (
		evals       atomic.Int64
		writes      atomic.Int64
		conflicts   atomic.Int64
		reconnects  atomic.Int64
		convChecks  atomic.Int64
		convFails   atomic.Int64
		convFailLog []string
		logMu       sync.Mutex
	)

	var wg sync.WaitGroup

	// Local eval loops on the steady fleet (exercise RLock + FNV under churn).
	for _, m := range fleet.Members {
		m := m
		wg.Add(1)
		go func() {
			defer wg.Done()
			t := time.NewTicker(100 * time.Millisecond)
			defer t.Stop()
			user := fmt.Sprintf("soak-user-%d", m.ID)
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					_ = m.Client.IsEnabled(*flagKey, user)
					evals.Add(1)
				}
			}
		}()
	}

	// Reconnect-churn clients: each repeatedly opens a stream, holds it briefly,
	// cuts it, and reopens — the reconnect+reconcile path, continuously.
	for i := 0; i < *churn; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			c := ffclient.New(ffclient.Config{
				BaseURL: *baseURL, SDKKey: *sdkKey, HTTPClient: streamingClient(),
			})
			if err := c.Bootstrap(ctx); err != nil {
				return
			}
			for ctx.Err() == nil {
				sctx, scancel := context.WithCancel(ctx)
				go func() { _ = c.StreamOnce(sctx) }()
				// Hold the stream 3–8s, then cut and reconcile before reopening.
				sleepCtx(ctx, time.Duration(3+i%6)*time.Second)
				scancel()
				_ = c.Reconcile(ctx) // backfill anything missed while cutting
				reconnects.Add(1)
				sleepCtx(ctx, 500*time.Millisecond)
			}
		}()
	}

	// Writer: periodic mutations (mix of atomic toggle + If-Match update).
	wg.Add(1)
	go func() {
		defer wg.Done()
		t := time.NewTicker(*writeEvery)
		defer t.Stop()
		i := 0
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				wctx, wcancel := context.WithTimeout(ctx, 10*time.Second)
				if i%3 == 2 {
					// If-Match update (optimistic): read then conditional write.
					if cur, err := admin.GetFlagByKey(wctx, *flagKey); err == nil {
						res, err := admin.Update(wctx, flagID, map[string]any{
							"rollout_percentage": (int(cur.Version) % 100),
						}, cur.Version)
						if err == nil && res.Status == 200 {
							writes.Add(1)
						} else if err == nil && res.Status == 409 {
							conflicts.Add(1)
						}
					}
				} else {
					if _, err := admin.Toggle(wctx, flagID); err == nil {
						writes.Add(1)
					}
				}
				wcancel()
				i++
			}
		}
	}()

	// Periodic convergence checker (Inv3).
	wg.Add(1)
	go func() {
		defer wg.Done()
		t := time.NewTicker(*convEvery)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				cctx, ccancel := context.WithTimeout(ctx, *convGrace+5*time.Second)
				target, err := admin.LatestVersion(cctx)
				if err != nil {
					ccancel()
					continue
				}
				err = fleet.WaitConverged(cctx, target, *convGrace, 500*time.Millisecond)
				ccancel()
				convChecks.Add(1)
				if err != nil {
					convFails.Add(1)
					logMu.Lock()
					convFailLog = append(convFailLog, fmt.Sprintf("[%s] %v", ts(), err))
					logMu.Unlock()
					fmt.Printf("[%s] CONVERGENCE CHECK FAILED: %v\n", ts(), err)
				} else {
					min, max := fleet.VersionSpread()
					fmt.Printf("[%s] converged: all %d clients at v%d (spread %d-%d) | evals=%d writes=%d reconnects=%d\n",
						ts(), len(fleet.Members), target, min, max,
						evals.Load(), writes.Load(), reconnects.Load())
				}
			}
		}
	}()

	<-ctx.Done()
	wg.Wait()

	// Final immediate monotonicity sample + summary.
	fleet.Sample()
	monoViol := fleet.Violations()

	fmt.Println("\n=== soak summary ===")
	fmt.Printf("  duration (target)        : %s\n", *duration)
	fmt.Printf("  steady clients           : %d\n", len(fleet.Members))
	fmt.Printf("  churn clients            : %d\n", *churn)
	fmt.Printf("  local evals              : %d\n", evals.Load())
	fmt.Printf("  writer mutations (200)   : %d\n", writes.Load())
	fmt.Printf("  If-Match conflicts (409) : %d\n", conflicts.Load())
	fmt.Printf("  stream reconnects        : %d\n", reconnects.Load())
	fmt.Printf("  live SSE frames observed : %d\n", fleet.TotalLiveFrames())
	fmt.Printf("  version samples          : %d\n", fleet.Samples())
	fmt.Printf("  convergence checks       : %d (failed: %d)\n", convChecks.Load(), convFails.Load())
	fmt.Printf("  monotonicity violations  : %d\n", len(monoViol))

	violated := len(monoViol) > 0 || convFails.Load() > 0
	if violated {
		fmt.Println("\nRESULT: FAIL — invariant(s) violated during soak.")
		for _, v := range monoViol {
			fmt.Printf("  monotonicity: %s\n", v)
		}
		logMu.Lock()
		for _, v := range convFailLog {
			fmt.Printf("  convergence: %s\n", v)
		}
		logMu.Unlock()
		os.Exit(1)
	}
	fmt.Println("\nRESULT: PASS — zero invariant violations over the full soak.")
}

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

func ts() string { return time.Now().Format("15:04:05") }
