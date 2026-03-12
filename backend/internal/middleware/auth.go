package middleware

import (
	"encoding/json"
	"net/http"
)

func AdminAuth(apiKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := r.Header.Get("X-Admin-API-Key")
			if key != apiKey {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{
					"error":   "unauthorized",
					"message": "Invalid or missing admin API key",
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func SDKAuth(sdkKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := r.Header.Get("X-SDK-Key")
			if key == "" {
				key = r.URL.Query().Get("key")
			}
			if key != sdkKey {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{
					"error":   "unauthorized",
					"message": "Invalid or missing SDK key",
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
