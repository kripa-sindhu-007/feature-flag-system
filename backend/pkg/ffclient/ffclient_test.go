package ffclient

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

// GOLDEN is shared with the backend (internal/hash/rollout_test.go) and the
// browser SDK (FeatureFlagClient.test.ts). All three MUST agree — cross-language
// evaluation parity is a core invariant.
var golden = []struct {
	input  string
	bucket uint32
}{
	{"checkout:user-1", 60},
	{"checkout:user-2", 17},
	{"dark-mode:alice", 29},
	{"beta:u_1024", 72},
	{"ai-assistant:user-7", 19},
}

func TestRolloutParity(t *testing.T) {
	// inRollout(pct) is true iff bucket < pct, so bucket == the smallest pct that
	// flips it on. Verify the exact boundary matches the golden bucket.
	for _, g := range golden {
		flagKey, userID := splitKey(g.input)
		if inRollout(flagKey, userID, int(g.bucket)) {
			t.Errorf("%s: bucket %d should be OFF at pct=%d", g.input, g.bucket, g.bucket)
		}
		if !inRollout(flagKey, userID, int(g.bucket)+1) {
			t.Errorf("%s: bucket %d should be ON at pct=%d", g.input, g.bucket, g.bucket+1)
		}
	}
}

func splitKey(s string) (string, string) {
	for i := 0; i < len(s); i++ {
		if s[i] == ':' {
			return s[:i], s[i+1:]
		}
	}
	return s, ""
}

// fakeServer serves a snapshot at startVersion plus an events backlog so a
// client can bootstrap then reconcile.
func fakeServer(t *testing.T, startVersion int64, backlog []event) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/api/client/flags", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{
			"flags":          []Flag{{ID: "1", Key: "checkout", Enabled: true, RolloutPercentage: 50, Version: startVersion}},
			"config_version": startVersion,
		})
	})
	mux.HandleFunc("/api/client/events", func(w http.ResponseWriter, r *http.Request) {
		since := startVersion
		if s := r.URL.Query().Get("since"); s != "" {
			if v, err := strconv.ParseInt(s, 10, 64); err == nil {
				since = v
			}
		}
		filtered := []event{}
		latest := startVersion
		for _, e := range backlog {
			if e.Version > latest {
				latest = e.Version
			}
			if e.Version > since {
				filtered = append(filtered, e)
			}
		}
		json.NewEncoder(w).Encode(map[string]any{
			"events":         filtered,
			"config_version": latest,
		})
	})
	return httptest.NewServer(mux)
}

func flagPayload(t *testing.T, key string, enabled bool, pct int, version int64) json.RawMessage {
	t.Helper()
	b, _ := json.Marshal(Flag{ID: "1", Key: key, Enabled: enabled, RolloutPercentage: pct, Version: version})
	return b
}

// TestReconcileAfterGap is the headline scenario: client at v41, misses 42-44,
// then reconciles up to v44.
func TestReconcileAfterGap(t *testing.T) {
	backlog := []event{
		{Version: 42, EventType: "updated", FlagKey: "checkout", Payload: flagPayload(t, "checkout", true, 60, 42)},
		{Version: 43, EventType: "created", FlagKey: "beta", Payload: flagPayload(t, "beta", true, 100, 43)},
		{Version: 44, EventType: "updated", FlagKey: "checkout", Payload: flagPayload(t, "checkout", false, 60, 44)},
	}
	srv := fakeServer(t, 41, backlog)
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL, SDKKey: "k"})
	if err := c.Bootstrap(context.Background()); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	if c.ConfigVersion() != 41 {
		t.Fatalf("want v41 after bootstrap, got v%d", c.ConfigVersion())
	}

	// A live event for v44 arrives — 42,43 were missed → gap → must reconcile.
	needs := c.applyLiveEvent("flag_updated", string(flagPayload(t, "checkout", false, 60, 44)), 44)
	if !needs {
		t.Fatal("expected a gap to require reconcile")
	}

	if err := c.Reconcile(context.Background()); err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if c.ConfigVersion() != 44 {
		t.Fatalf("want v44 after reconcile, got v%d", c.ConfigVersion())
	}
	// State reflects the full backlog: beta created, checkout disabled at v44.
	flags := c.Flags()
	if _, ok := flags["beta"]; !ok {
		t.Error("beta flag missing after reconcile")
	}
	if flags["checkout"].Enabled {
		t.Error("checkout should be disabled at v44")
	}
}

// TestReconcileIdempotent: applying the same backlog twice, and a stale/reordered
// live event, never regresses the version or corrupts state.
func TestReconcileIdempotent(t *testing.T) {
	backlog := []event{
		{Version: 42, EventType: "updated", FlagKey: "checkout", Payload: flagPayload(t, "checkout", false, 60, 42)},
	}
	srv := fakeServer(t, 41, backlog)
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL, SDKKey: "k"})
	if err := c.Bootstrap(context.Background()); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	for i := 0; i < 3; i++ {
		if err := c.Reconcile(context.Background()); err != nil {
			t.Fatalf("reconcile %d: %v", i, err)
		}
	}
	if c.ConfigVersion() != 42 {
		t.Fatalf("want v42, got v%d", c.ConfigVersion())
	}
	// A stale/duplicate live event must be ignored and never regress the version.
	if needs := c.applyLiveEvent("flag_updated", string(flagPayload(t, "checkout", true, 60, 42)), 42); needs {
		t.Error("stale event should not request reconcile")
	}
	if c.ConfigVersion() != 42 {
		t.Fatalf("stale event regressed version to v%d", c.ConfigVersion())
	}
	if c.Flags()["checkout"].Enabled {
		t.Error("stale v42 event must not re-enable checkout")
	}
}

func TestContiguousLiveEventApplies(t *testing.T) {
	c := New(Config{BaseURL: "http://unused", SDKKey: "k"})
	// Seed at v0; the exact next event (v1) applies without reconcile.
	data := fmt.Sprintf(`{"id":"1","key":"x","enabled":true,"rollout_percentage":100,"version":1}`)
	if needs := c.applyLiveEvent("flag_updated", data, 1); needs {
		t.Fatal("contiguous event should apply directly, not reconcile")
	}
	if c.ConfigVersion() != 1 {
		t.Fatalf("want v1, got v%d", c.ConfigVersion())
	}
	if !c.IsEnabled("x", "anyone") {
		t.Error("flag x should be enabled at 100% rollout")
	}
}
