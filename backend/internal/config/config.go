package config

import (
	"os"
	"strings"
	"time"
)

type Config struct {
	Port           string
	NodeID         string
	DatabaseURL    string
	RedisURL       string
	AdminAPIKey    string
	SDKAPIKey      string
	AllowedOrigins []string

	// OTLPEndpoint is the OpenTelemetry OTLP/HTTP trace endpoint. Empty (the
	// default) disables tracing entirely — the app runs with a no-op tracer and
	// needs no collector.
	OTLPEndpoint string
	// ShutdownTimeout bounds graceful HTTP drain on SIGINT/SIGTERM.
	ShutdownTimeout time.Duration
	// SSEIdleTimeout is the absolute per-connection idle cap for SSE streams.
	SSEIdleTimeout time.Duration
}

func Load() *Config {
	return &Config{
		Port:            getEnv("PORT", "8080"),
		NodeID:          getEnv("NODE_ID", "node-local"),
		DatabaseURL:     getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/featureflags?sslmode=disable"),
		RedisURL:        getEnv("REDIS_URL", "redis://localhost:6379"),
		AdminAPIKey:     getEnv("ADMIN_API_KEY", "admin-secret-key"),
		SDKAPIKey:       getEnv("SDK_API_KEY", "sdk-secret-key"),
		AllowedOrigins:  getEnvList("ALLOWED_ORIGINS", []string{"http://localhost:3000"}),
		OTLPEndpoint:    getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", ""),
		ShutdownTimeout: getEnvDuration("SHUTDOWN_TIMEOUT", 15*time.Second),
		SSEIdleTimeout:  getEnvDuration("SSE_IDLE_TIMEOUT", 60*time.Second),
	}
}

func getEnvList(key string, fallback []string) []string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	if len(out) == 0 {
		return fallback
	}
	return out
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// getEnvDuration parses a Go duration string (e.g. "15s", "500ms"); an unset or
// unparseable value falls back to the default.
func getEnvDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}
