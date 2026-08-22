package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/feature-flag-system/backend/internal/service"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// readyzProbeTimeout bounds the Postgres+Redis readiness probes so a hung
// dependency yields a prompt 503 rather than a hanging request.
const readyzProbeTimeout = 2 * time.Second

// HealthHandler serves liveness (/healthz) and readiness (/readyz). Readiness
// is what the nginx LB / orchestrator polls to drain a node: it must reflect
// real dependency health (Postgres + Redis) so a node with a broken dep is
// pulled out of rotation. The dependency probes are function fields so the
// handler is unit-testable with fakes (no live PG/Redis needed).
type HealthHandler struct {
	nodeID        string
	pingDB        func(context.Context) error
	pingRedis     func(context.Context) error
	latestVersion func(context.Context) (int64, error)
}

func NewHealthHandler(nodeID string, pool *pgxpool.Pool, rdb *redis.Client, svc service.FlagService) *HealthHandler {
	return &HealthHandler{
		nodeID:        nodeID,
		pingDB:        pool.Ping,
		pingRedis:     func(ctx context.Context) error { return rdb.Ping(ctx).Err() },
		latestVersion: svc.GetLatestVersion,
	}
}

// Healthz is liveness: it answers 200 as long as the process is running and can
// serve HTTP. It performs no dependency checks — a dep outage must NOT make the
// orchestrator kill the process.
func (h *HealthHandler) Healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

// Readyz is readiness: 200 only when BOTH Postgres and Redis are reachable,
// else 503 with which dep failed. On success it also reports this node's latest
// config version so the LB / cluster panel can see per-node convergence.
func (h *HealthHandler) Readyz(w http.ResponseWriter, r *http.Request) {
	// Bound the dependency probes so a HUNG (not merely down) Postgres/Redis
	// makes readiness fail fast with 503 instead of hanging the probe — the LB
	// needs a prompt unready signal to drain the node.
	ctx, cancel := context.WithTimeout(r.Context(), readyzProbeTimeout)
	defer cancel()

	resp := map[string]any{
		"node_id":  h.nodeID,
		"postgres": "ok",
		"redis":    "ok",
	}
	ready := true

	if err := h.pingDB(ctx); err != nil {
		resp["postgres"] = err.Error()
		ready = false
	}
	if err := h.pingRedis(ctx); err != nil {
		resp["redis"] = err.Error()
		ready = false
	}

	if ready {
		if v, err := h.latestVersion(ctx); err == nil {
			resp["config_version"] = v
		} else {
			// A DB read failing here means Postgres isn't truly ready.
			resp["postgres"] = err.Error()
			ready = false
		}
	}

	resp["ready"] = ready
	status := http.StatusOK
	if !ready {
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, resp)
}
