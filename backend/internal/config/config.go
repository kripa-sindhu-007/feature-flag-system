package config

import (
	"os"
	"strings"
)

type Config struct {
	Port           string
	NodeID         string
	DatabaseURL    string
	RedisURL       string
	AdminAPIKey    string
	SDKAPIKey      string
	AllowedOrigins []string
}

func Load() *Config {
	return &Config{
		Port:           getEnv("PORT", "8080"),
		NodeID:         getEnv("NODE_ID", "node-local"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/featureflags?sslmode=disable"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		AdminAPIKey:    getEnv("ADMIN_API_KEY", "admin-secret-key"),
		SDKAPIKey:      getEnv("SDK_API_KEY", "sdk-secret-key"),
		AllowedOrigins: getEnvList("ALLOWED_ORIGINS", []string{"http://localhost:3000"}),
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
