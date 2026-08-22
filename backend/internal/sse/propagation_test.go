package sse

import (
	"encoding/json"
	"testing"
	"time"
)

// TestEnvelopePropagationRoundTrip: the publish timestamp (Ts) survives the JSON
// wire round-trip and yields a non-negative propagation delay on the receiving
// side — the exact quantity the subscriber feeds into config_propagation_seconds.
func TestEnvelopePropagationRoundTrip(t *testing.T) {
	sent := Envelope{
		Type:        "flag_updated",
		Version:     7,
		Data:        json.RawMessage(`{"key":"checkout"}`),
		Ts:          time.Now().UnixNano(),
		Traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
	}
	payload, err := json.Marshal(sent)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var got Envelope
	if err := json.Unmarshal(payload, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got.Ts != sent.Ts {
		t.Fatalf("Ts round-trip = %d, want %d", got.Ts, sent.Ts)
	}
	if got.Traceparent != sent.Traceparent {
		t.Fatalf("Traceparent round-trip = %q, want %q", got.Traceparent, sent.Traceparent)
	}

	if d := time.Since(time.Unix(0, got.Ts)); d < 0 {
		t.Fatalf("propagation delay = %v, want non-negative", d)
	}
}

// TestEnvelopeBackwardCompatNoTs: an older envelope without ts/traceparent still
// unmarshals and applies — those fields are optional (W2 wire compatibility).
func TestEnvelopeBackwardCompatNoTs(t *testing.T) {
	legacy := `{"type":"flag_deleted","version":3,"data":{"key":"old"}}`
	var got Envelope
	if err := json.Unmarshal([]byte(legacy), &got); err != nil {
		t.Fatalf("unmarshal legacy envelope: %v", err)
	}
	if got.Ts != 0 {
		t.Fatalf("legacy Ts = %d, want 0", got.Ts)
	}
	if got.Traceparent != "" {
		t.Fatalf("legacy Traceparent = %q, want empty", got.Traceparent)
	}
	if got.Type != "flag_deleted" || got.Version != 3 {
		t.Fatalf("legacy fields not parsed: %+v", got)
	}
}
