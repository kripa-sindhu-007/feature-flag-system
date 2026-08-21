// Package metrics defines the Prometheus instrumentation for the backend and
// exposes it on /metrics. Every metric here measures a REAL server-side event;
// nothing is faked. Flag EVALUATION happens in the SDK, on the client side, so
// there is deliberately no flag_evaluations_total counter — the server never
// evaluates, and a hard-wired zero would be dishonest (see W3 D2).
package metrics

import (
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	// FlagUpdates counts admin mutations that were published to the cluster,
	// labeled by event type (created/updated/deleted/toggled).
	FlagUpdates = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "flag_updates_total",
		Help: "Total flag mutations published to the cluster, by event type.",
	}, []string{"type"})

	// ConfigPropagation measures subscriber-side propagation latency: the wall
	// time between a node publishing an envelope and any node consuming it off
	// Redis (envelope carries the publish timestamp). This is the end-to-end
	// "how fast does a change reach every backend" number.
	ConfigPropagation = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "config_propagation_seconds",
		Help:    "Publish-to-consume propagation latency observed on the receiving node.",
		Buckets: []float64{.0005, .001, .0025, .005, .01, .025, .05, .1, .25, .5, 1},
	})

	// SSEConnectedClients is the live count of SSE clients on THIS node.
	SSEConnectedClients = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "sse_connected_clients",
		Help: "Currently connected SSE clients on this node.",
	})

	// RedisPublishErrors counts failed Redis publishes (best-effort delivery;
	// clients still reconcile via the durable event log, so this is a health
	// signal, not a correctness failure).
	RedisPublishErrors = promauto.NewCounter(prometheus.CounterOpts{
		Name: "redis_publish_errors_total",
		Help: "Total failed Redis publishes of flag-update envelopes.",
	})

	// DBQuery times repository queries, labeled by logical query name.
	DBQuery = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "db_query_seconds",
		Help:    "Repository query latency, by query.",
		Buckets: prometheus.DefBuckets,
	}, []string{"query"})

	// Reconciliation times the /api/client/events?since= backlog replay handler.
	Reconciliation = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "reconciliation_seconds",
		Help:    "Duration of client reconcile (events-since) requests.",
		Buckets: prometheus.DefBuckets,
	})
)

// Handler serves the metrics endpoint (default registry). Not behind auth.
func Handler() http.Handler { return promhttp.Handler() }

// ObserveFlagUpdate records one published mutation.
func ObserveFlagUpdate(eventType string) { FlagUpdates.WithLabelValues(eventType).Inc() }

// ObservePropagation records a receiving-node propagation delay. A negative
// delay (clock skew across nodes) is clamped to 0 so the histogram stays sane.
func ObservePropagation(d time.Duration) {
	if d < 0 {
		d = 0
	}
	ConfigPropagation.Observe(d.Seconds())
}

// SetConnectedClients publishes the current SSE client count.
func SetConnectedClients(n int) { SSEConnectedClients.Set(float64(n)) }

// IncRedisPublishError bumps the failed-publish counter.
func IncRedisPublishError() { RedisPublishErrors.Inc() }

// TimeDB returns a stop func that records the elapsed time under the given
// query label. Usage: defer metrics.TimeDB("List")().
func TimeDB(query string) func() {
	start := time.Now()
	return func() { DBQuery.WithLabelValues(query).Observe(time.Since(start).Seconds()) }
}

// TimeReconcile mirrors TimeDB for the reconcile handler.
func TimeReconcile() func() {
	start := time.Now()
	return func() { Reconciliation.Observe(time.Since(start).Seconds()) }
}
