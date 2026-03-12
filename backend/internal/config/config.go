package config

import "os"

type Config struct {
	Port           string
	DatabaseURL    string
	RedisURL       string
	AdminAPIKey    string
	SDKAPIKey      string
	AllowedOrigins []string
}

func Load() *Config {
	return &Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/featureflags?sslmode=disable"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		AdminAPIKey:    getEnv("ADMIN_API_KEY", "admin-secret-key"),
		SDKAPIKey:      getEnv("SDK_API_KEY", "sdk-secret-key"),
		AllowedOrigins: []string{"http://localhost:3000"},
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
