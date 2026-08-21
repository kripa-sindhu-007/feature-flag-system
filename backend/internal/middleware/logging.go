package middleware

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/feature-flag-system/backend/internal/reqid"
)

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// Unwrap exposes the underlying ResponseWriter so http.ResponseController can
// reach capabilities this wrapper doesn't implement itself (notably Flush for
// SSE streaming). Without this, the SSE handler's flusher lookup fails and the
// stream 500s.
func (rw *responseWriter) Unwrap() http.ResponseWriter {
	return rw.ResponseWriter
}

// Flush forwards to the underlying writer when it supports flushing, so SSE
// frames are pushed to the client immediately.
func (rw *responseWriter) Flush() {
	if f, ok := rw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Logger assigns each request a correlation id (propagated in context and
// echoed as X-Request-Id) and emits a structured slog line on completion.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		id := reqid.New()
		r = r.WithContext(reqid.With(r.Context(), id))
		w.Header().Set("X-Request-Id", id)

		rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(rw, r)

		slog.Info("http request",
			"request_id", id,
			"method", r.Method,
			"path", r.URL.Path,
			"status", rw.statusCode,
			"duration_ms", float64(time.Since(start).Microseconds())/1000,
		)
	})
}
