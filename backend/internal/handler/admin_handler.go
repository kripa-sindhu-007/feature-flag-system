package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/feature-flag-system/backend/internal/model"
	"github.com/feature-flag-system/backend/internal/service"
	"github.com/go-chi/chi/v5"
)

type AdminHandler struct {
	service service.FlagService
}

func NewAdminHandler(svc service.FlagService) *AdminHandler {
	return &AdminHandler{service: svc}
}

func (h *AdminHandler) CreateFlag(w http.ResponseWriter, r *http.Request) {
	var req model.CreateFlagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	flag, err := h.service.CreateFlag(r.Context(), req)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate_key") {
			writeError(w, http.StatusConflict, "duplicate_key", "A flag with this key already exists")
			return
		}
		if strings.Contains(err.Error(), "must be") || strings.Contains(err.Error(), "required") {
			writeError(w, http.StatusBadRequest, "validation_error", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to create flag")
		return
	}

	writeJSON(w, http.StatusCreated, flag.ToResponse())
}

func (h *AdminHandler) ListFlags(w http.ResponseWriter, r *http.Request) {
	flags, err := h.service.ListFlags(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to list flags")
		return
	}

	responses := make([]model.FlagResponse, len(flags))
	for i, f := range flags {
		responses[i] = f.ToResponse()
	}
	writeJSON(w, http.StatusOK, responses)
}

func (h *AdminHandler) GetFlag(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	flag, err := h.service.GetFlag(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to get flag")
		return
	}
	if flag == nil {
		writeError(w, http.StatusNotFound, "not_found", "Flag not found")
		return
	}

	writeJSON(w, http.StatusOK, flag.ToResponse())
}

func (h *AdminHandler) UpdateFlag(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateFlagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid request body")
		return
	}

	flag, err := h.service.UpdateFlag(r.Context(), id, req)
	if err != nil {
		if strings.Contains(err.Error(), "must be") {
			writeError(w, http.StatusBadRequest, "validation_error", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to update flag")
		return
	}
	if flag == nil {
		writeError(w, http.StatusNotFound, "not_found", "Flag not found")
		return
	}

	writeJSON(w, http.StatusOK, flag.ToResponse())
}

func (h *AdminHandler) DeleteFlag(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	err := h.service.DeleteFlag(r.Context(), id)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			writeError(w, http.StatusNotFound, "not_found", "Flag not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to delete flag")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminHandler) ToggleFlag(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	flag, err := h.service.ToggleFlag(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "Failed to toggle flag")
		return
	}
	if flag == nil {
		writeError(w, http.StatusNotFound, "not_found", "Flag not found")
		return
	}

	writeJSON(w, http.StatusOK, flag.ToResponse())
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, errType string, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(model.ErrorResponse{
		Error:   errType,
		Message: message,
	})
}
