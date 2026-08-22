// Package reqid carries a per-request correlation id through context so the
// HTTP middleware, the service layer, and the logs can all reference the same
// request without the domain layers depending on the HTTP layer.
package reqid

import (
	"context"
	"crypto/rand"
	"encoding/hex"
)

type ctxKey struct{}

// New generates a random 128-bit request id as hex. Falls back to a fixed
// sentinel only if the system RNG fails (never expected).
func New() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "req-unknown"
	}
	return hex.EncodeToString(b[:])
}

// With returns a context carrying the request id.
func With(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

// From extracts the request id, or "" when absent.
func From(ctx context.Context) string {
	if v, ok := ctx.Value(ctxKey{}).(string); ok {
		return v
	}
	return ""
}
