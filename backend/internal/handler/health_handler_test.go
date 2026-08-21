package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("decode body %q: %v", rec.Body.String(), err)
	}
	return m
}

func TestHealthz(t *testing.T) {
	h := &HealthHandler{nodeID: "n1"}
	rec := httptest.NewRecorder()
	h.Healthz(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if body := decodeBody(t, rec); body["status"] != "ok" {
		t.Fatalf("status field = %v, want ok", body["status"])
	}
}

func TestReadyzAllHealthy(t *testing.T) {
	h := &HealthHandler{
		nodeID:        "n1",
		pingDB:        func(context.Context) error { return nil },
		pingRedis:     func(context.Context) error { return nil },
		latestVersion: func(context.Context) (int64, error) { return 42, nil },
	}
	rec := httptest.NewRecorder()
	h.Readyz(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := decodeBody(t, rec)
	if body["ready"] != true {
		t.Fatalf("ready = %v, want true", body["ready"])
	}
	if body["node_id"] != "n1" {
		t.Fatalf("node_id = %v, want n1", body["node_id"])
	}
	if body["config_version"] != float64(42) {
		t.Fatalf("config_version = %v, want 42", body["config_version"])
	}
}

func TestReadyzPostgresDown(t *testing.T) {
	h := &HealthHandler{
		nodeID:        "n1",
		pingDB:        func(context.Context) error { return errors.New("pg down") },
		pingRedis:     func(context.Context) error { return nil },
		latestVersion: func(context.Context) (int64, error) { return 42, nil },
	}
	rec := httptest.NewRecorder()
	h.Readyz(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	body := decodeBody(t, rec)
	if body["ready"] != false {
		t.Fatalf("ready = %v, want false", body["ready"])
	}
	if body["postgres"] != "pg down" {
		t.Fatalf("postgres = %v, want error string", body["postgres"])
	}
	if body["redis"] != "ok" {
		t.Fatalf("redis = %v, want ok", body["redis"])
	}
}

func TestReadyzRedisDown(t *testing.T) {
	h := &HealthHandler{
		nodeID:        "n1",
		pingDB:        func(context.Context) error { return nil },
		pingRedis:     func(context.Context) error { return errors.New("redis down") },
		latestVersion: func(context.Context) (int64, error) { return 42, nil },
	}
	rec := httptest.NewRecorder()
	h.Readyz(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	body := decodeBody(t, rec)
	if body["ready"] != false {
		t.Fatalf("ready = %v, want false", body["ready"])
	}
	if body["redis"] != "redis down" {
		t.Fatalf("redis = %v, want error string", body["redis"])
	}
}
