package chaoskit

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/feature-flag-system/backend/pkg/ffclient"
)

// Member is one virtual client in a fleet: a real ffclient plus per-client
// bookkeeping the invariant checkers read.
type Member struct {
	ID     int
	Client *ffclient.Client

	liveFrames atomic.Int64 // SSE frames observed on the wire (OnVersion hook)
}

// LiveFrames returns how many versioned SSE frames this member observed.
func (m *Member) LiveFrames() int64 { return m.liveFrames.Load() }

// Fleet is a set of monitored clients. It runs an online monotonicity check
// (Inv1: a client's applied config_version never decreases) and offers
// convergence assertions (Inv3/Inv5).
type Fleet struct {
	Members []*Member

	mu          sync.Mutex
	lastVersion map[int]int64 // member ID -> last sampled ConfigVersion
	violations  []string
	samples     int64
}

// SpawnFleet creates n virtual clients against cfg.BaseURL and Start()s each
// (bootstrap + live SSE stream + auto-reconnect + reconcile-on-connect). It
// returns once every client has started (or the first start error if none did).
func SpawnFleet(ctx context.Context, cfg SpawnConfig, n int) (*Fleet, error) {
	f := &Fleet{
		Members:     make([]*Member, 0, n),
		lastVersion: make(map[int]int64, n),
	}
	var (
		wg       sync.WaitGroup
		mu       sync.Mutex
		firstErr error
		started  int
	)
	for i := 0; i < n; i++ {
		i := i
		m := &Member{ID: i}
		m.Client = newFFClient(cfg, func(int64, time.Time) { m.liveFrames.Add(1) })
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := m.Client.Start(ctx); err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = err
				}
				mu.Unlock()
				return
			}
			mu.Lock()
			f.Members = append(f.Members, m)
			f.lastVersion[m.ID] = m.Client.ConfigVersion()
			started++
			mu.Unlock()
		}()
	}
	wg.Wait()
	if started == 0 {
		return nil, fmt.Errorf("no clients started: %v", firstErr)
	}
	sort.Slice(f.Members, func(i, j int) bool { return f.Members[i].ID < f.Members[j].ID })
	return f, nil
}

// MonitorMonotonicity samples every member's applied ConfigVersion at interval
// and records a violation if any client's version ever decreases — the online
// Inv1 check. It blocks until ctx is cancelled.
func (f *Fleet) MonitorMonotonicity(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			f.sampleOnce()
		}
	}
}

// Sample takes one immediate monotonicity sample across all members (used for a
// final check after a scenario's monitor goroutine has stopped).
func (f *Fleet) Sample() { f.sampleOnce() }

func (f *Fleet) sampleOnce() {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, m := range f.Members {
		v := m.Client.ConfigVersion()
		if prev, ok := f.lastVersion[m.ID]; ok && v < prev {
			f.violations = append(f.violations,
				fmt.Sprintf("client %d: config_version regressed %d -> %d", m.ID, prev, v))
		}
		if v > f.lastVersion[m.ID] {
			f.lastVersion[m.ID] = v
		}
		f.samples++
	}
}

// Violations returns a copy of all monotonicity violations observed so far.
func (f *Fleet) Violations() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]string, len(f.violations))
	copy(out, f.violations)
	return out
}

// Samples returns how many per-client version samples the monitor has taken.
func (f *Fleet) Samples() int64 {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.samples
}

// VersionSpread returns the current min and max ConfigVersion across members.
func (f *Fleet) VersionSpread() (min, max int64) {
	first := true
	for _, m := range f.Members {
		v := m.Client.ConfigVersion()
		if first {
			min, max = v, v
			first = false
			continue
		}
		if v < min {
			min = v
		}
		if v > max {
			max = v
		}
	}
	return min, max
}

// TotalLiveFrames sums SSE frames observed across the fleet.
func (f *Fleet) TotalLiveFrames() int64 {
	var n int64
	for _, m := range f.Members {
		n += m.LiveFrames()
	}
	return n
}

// WaitConverged blocks until every member's ConfigVersion() >= target, or the
// timeout elapses. On timeout it returns an error naming the laggards and their
// versions — the evidence for a convergence (Inv3) failure. It also runs a
// monotonicity sample each poll so a regression during convergence is caught.
func (f *Fleet) WaitConverged(ctx context.Context, target int64, timeout, poll time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		f.sampleOnce()
		lagging := f.laggards(target)
		if len(lagging) == 0 {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%d/%d clients did not converge to version %d within %s: %s",
				len(lagging), len(f.Members), target, timeout, joinLaggards(lagging, 8))
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(poll):
		}
	}
}

type laggard struct {
	id      int
	version int64
}

func (f *Fleet) laggards(target int64) []laggard {
	var out []laggard
	for _, m := range f.Members {
		if v := m.Client.ConfigVersion(); v < target {
			out = append(out, laggard{id: m.ID, version: v})
		}
	}
	return out
}

func joinLaggards(l []laggard, limit int) string {
	s := ""
	for i, x := range l {
		if i >= limit {
			s += fmt.Sprintf(" ...(+%d more)", len(l)-limit)
			break
		}
		if i > 0 {
			s += ", "
		}
		s += fmt.Sprintf("client %d@%d", x.id, x.version)
	}
	return s
}

// AssertNoneBelow returns an error if any member's ConfigVersion is below floor
// — the Inv5 "no corruption / no rollback" check during an infra outage (a
// client must hold its last-known-good, never regress below it).
func (f *Fleet) AssertNoneBelow(floor int64) error {
	var bad []laggard
	for _, m := range f.Members {
		if v := m.Client.ConfigVersion(); v < floor {
			bad = append(bad, laggard{id: m.ID, version: v})
		}
	}
	if len(bad) > 0 {
		return fmt.Errorf("%d clients regressed below last-known-good %d: %s",
			len(bad), floor, joinLaggards(bad, 8))
	}
	return nil
}

// CountAtLeast returns how many members have reached at least version v.
func (f *Fleet) CountAtLeast(v int64) int {
	n := 0
	for _, m := range f.Members {
		if m.Client.ConfigVersion() >= v {
			n++
		}
	}
	return n
}
