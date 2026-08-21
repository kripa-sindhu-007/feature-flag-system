package middleware

import (
	"github.com/go-chi/cors"
	"net/http"
)

func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	return cors.Handler(cors.Options{
		AllowedOrigins: allowedOrigins,
		AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		// If-Match carries the expected version for optimistic-concurrency updates
		// (PUT). Without it in the allow-list, the browser's preflight for a
		// cross-origin update fails the header check and the update is blocked.
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "If-Match", "X-Admin-API-Key", "X-SDK-Key"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	})
}
