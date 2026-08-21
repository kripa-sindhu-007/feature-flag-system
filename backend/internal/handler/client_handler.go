package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/feature-flag-system/backend/internal/service"
	"github.com/feature-flag-system/backend/internal/sse"
)

type ClientHandler struct {
	service service.FlagService
	broker  *sse.Broker
	nodeID  string
}

func NewClientHandler(svc service.FlagService, broker *sse.Broker, nodeID string) *ClientHandler {
	return &ClientHandler{service: svc, broker: broker, nodeID: nodeID}
}

func (h *ClientHandler) GetAllFlags(w http.ResponseWriter, r *http.Request) {
	flags, err := h.service.GetAllFlagConfigs(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to get flags")
		return
	}

	type clientFlag struct {
		ID                string   `json:"id"`
		Key               string   `json:"key"`
		Description       string   `json:"description"`
		Enabled           bool     `json:"enabled"`
		RolloutPercentage int      `json:"rollout_percentage"`
		TargetedUsers     []string `json:"targeted_users"`
		Version           int64    `json:"version"`
	}

	result := make([]clientFlag, len(flags))
	for i, f := range flags {
		users := f.TargetedUsers
		if users == nil {
			users = []string{}
		}
		result[i] = clientFlag{
			ID:                f.ID,
			Key:               f.Key,
			Description:       f.Description,
			Enabled:           f.Enabled,
			RolloutPercentage: f.RolloutPercentage,
			TargetedUsers:     users,
			Version:           f.Version,
		}
	}

	version, err := h.service.GetLatestVersion(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to get flags")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"flags":          result,
		"config_version": version,
	})
}

func (h *ClientHandler) StreamEvents(w http.ResponseWriter, r *http.Request) {
	h.broker.ServeHTTP(w, r)
}

// Reconcile returns the ordered event backlog after ?since=V so a client that
// missed live events (disconnect, dropped Redis message, gap) can replay them
// in version order and converge to the latest committed state.
func (h *ClientHandler) Reconcile(w http.ResponseWriter, r *http.Request) {
	var since int64
	if s := r.URL.Query().Get("since"); s != "" {
		v, err := strconv.ParseInt(s, 10, 64)
		if err != nil || v < 0 {
			writeError(w, http.StatusBadRequest, "invalid_since", "since must be a non-negative integer")
			return
		}
		since = v
	}

	events, err := h.service.GetEventsSince(r.Context(), since, 0)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to get events")
		return
	}

	version, err := h.service.GetLatestVersion(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to get version")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"events":         events,
		"config_version": version,
	})
}

// Version reports this node's identity, its view of the global config version,
// and its live SSE client count — the data behind the cluster panel.
func (h *ClientHandler) Version(w http.ResponseWriter, r *http.Request) {
	version, err := h.service.GetLatestVersion(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to get version")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"node_id":        h.nodeID,
		"config_version": version,
		"sse_clients":    h.broker.ClientCount(),
	})
}
