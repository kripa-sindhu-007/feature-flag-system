package handler

import (
	"encoding/json"
	"net/http"

	"github.com/feature-flag-system/backend/internal/service"
	"github.com/feature-flag-system/backend/internal/sse"
)

type ClientHandler struct {
	service service.FlagService
	broker  *sse.Broker
}

func NewClientHandler(svc service.FlagService, broker *sse.Broker) *ClientHandler {
	return &ClientHandler{service: svc, broker: broker}
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
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"flags": result})
}

func (h *ClientHandler) StreamEvents(w http.ResponseWriter, r *http.Request) {
	h.broker.ServeHTTP(w, r)
}
