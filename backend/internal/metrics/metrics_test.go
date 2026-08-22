package metrics

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// TestMetricsHandlerExposesSeries proves registration doesn't panic (it happens
// at package init) and that /metrics serves 200 with every shipped series
// present. Label-bearing metrics only appear after an observation, so we touch
// each helper first.
func TestMetricsHandlerExposesSeries(t *testing.T) {
	ObserveFlagUpdate("updated")
	ObservePropagation(3 * time.Millisecond)
	SetConnectedClients(2)
	IncRedisPublishError()
	TimeDB("list")()
	TimeReconcile()()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body, _ := io.ReadAll(rec.Body)
	out := string(body)

	for _, name := range []string{
		"flag_updates_total",
		"config_propagation_seconds",
		"sse_connected_clients",
		"redis_publish_errors_total",
		"db_query_seconds",
		"reconciliation_seconds",
	} {
		if !strings.Contains(out, name) {
			t.Errorf("metrics output missing series %q", name)
		}
	}
}

func TestObservePropagationClampsNegative(t *testing.T) {
	// Should not panic on a negative (clock-skew) duration.
	ObservePropagation(-5 * time.Second)
}
