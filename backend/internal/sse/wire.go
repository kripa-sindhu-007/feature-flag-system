package sse

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/feature-flag-system/backend/internal/metrics"
	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

// FlagUpdatesChannel is the Redis pub/sub channel every backend publishes flag
// changes to and every backend subscribes to.
const FlagUpdatesChannel = "flag_updates"

// Envelope is the versioned message published on Redis and consumed by each
// backend's subscriber. Data is the event-specific JSON: a flag for updates, a
// {"key": ...} object for deletes. Type doubles as the SSE event name and
// Version as the SSE `id:`.
//
// Ts and Traceparent are W3-era additions and are OPTIONAL: older publishers
// omit them (zero value), and consumers must still apply such envelopes. Ts is
// the publish time in Unix nanoseconds, used to measure propagation latency on
// the receiving node. Traceparent carries W3C trace context for the exemplar
// span path.
type Envelope struct {
	Type        string          `json:"type"`
	Version     int64           `json:"version"`
	Data        json.RawMessage `json:"data"`
	Ts          int64           `json:"ts,omitempty"`
	Traceparent string          `json:"traceparent,omitempty"`
}

// Publish sends an envelope to all backends via Redis. Delivery is best-effort:
// the durable source of truth is the flag_events log, and clients backfill any
// missed message via the /events?since= reconcile endpoint.
func Publish(ctx context.Context, rdb *redis.Client, eventType string, version int64, data json.RawMessage) {
	if rdb == nil {
		return
	}

	// Exemplar: child span under the caller's flag.propagate span, plus inject
	// W3C trace context into the envelope so the receiving node can continue it.
	ctx, span := otel.Tracer("sse").Start(ctx, "redis.publish")
	defer span.End()

	carrier := propagation.MapCarrier{}
	otel.GetTextMapPropagator().Inject(ctx, carrier)

	env := Envelope{
		Type:        eventType,
		Version:     version,
		Data:        data,
		Ts:          time.Now().UnixNano(),
		Traceparent: carrier["traceparent"],
	}
	payload, err := json.Marshal(env)
	if err != nil {
		slog.Error("sse: marshal envelope", "err", err)
		return
	}
	if err := rdb.Publish(ctx, FlagUpdatesChannel, payload).Err(); err != nil {
		metrics.IncRedisPublishError()
		slog.Error("sse: redis publish", "err", err)
	}
}

// Broadcaster is the fan-out sink a subscriber feeds. *Broker implements it;
// tests inject a capturing fake.
type Broadcaster interface {
	Broadcast(SSEEvent)
}

// Subscribe runs one goroutine per backend: it consumes the Redis channel and
// re-broadcasts every envelope to this node's local SSE clients. This is the
// single delivery path — the publishing node also receives its own writes back
// here, so every backend behind the load balancer fans out uniformly. Blocks
// until ctx is cancelled.
func Subscribe(ctx context.Context, rdb *redis.Client, broker Broadcaster) {
	if rdb == nil {
		slog.Warn("sse: no redis client, cross-instance propagation disabled")
		return
	}
	sub := rdb.Subscribe(ctx, FlagUpdatesChannel)
	defer sub.Close()

	slog.Info("sse: subscribed", "channel", FlagUpdatesChannel)
	ch := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var env Envelope
			if err := json.Unmarshal([]byte(msg.Payload), &env); err != nil {
				slog.Error("sse: bad envelope", "err", err)
				continue
			}

			// Propagation latency: publish -> consume, observed here on the
			// receiving node. Skip when Ts is absent (older/backward-compat
			// envelopes) so we don't record a bogus "since epoch" duration.
			if env.Ts > 0 {
				metrics.ObservePropagation(time.Since(time.Unix(0, env.Ts)))
			}

			// Exemplar: continue the trace from the publisher and record the
			// receiving-node broadcast as a child span.
			if env.Traceparent != "" {
				carrier := propagation.MapCarrier{"traceparent": env.Traceparent}
				bctx := otel.GetTextMapPropagator().Extract(context.Background(), carrier)
				_, span := otel.Tracer("sse").Start(bctx, "sse.broadcast")
				span.End()
			}

			broker.Broadcast(SSEEvent{
				Event:   env.Type,
				Data:    string(env.Data),
				Version: env.Version,
			})
		}
	}
}
