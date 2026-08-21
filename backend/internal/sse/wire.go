package sse

import (
	"context"
	"encoding/json"
	"log"

	"github.com/redis/go-redis/v9"
)

// FlagUpdatesChannel is the Redis pub/sub channel every backend publishes flag
// changes to and every backend subscribes to.
const FlagUpdatesChannel = "flag_updates"

// Envelope is the versioned message published on Redis and consumed by each
// backend's subscriber. Data is the event-specific JSON: a flag for updates, a
// {"key": ...} object for deletes. Type doubles as the SSE event name and
// Version as the SSE `id:`.
type Envelope struct {
	Type    string          `json:"type"`
	Version int64           `json:"version"`
	Data    json.RawMessage `json:"data"`
}

// Publish sends an envelope to all backends via Redis. Delivery is best-effort:
// the durable source of truth is the flag_events log, and clients backfill any
// missed message via the /events?since= reconcile endpoint.
func Publish(ctx context.Context, rdb *redis.Client, eventType string, version int64, data json.RawMessage) {
	if rdb == nil {
		return
	}
	env := Envelope{Type: eventType, Version: version, Data: data}
	payload, err := json.Marshal(env)
	if err != nil {
		log.Printf("sse: marshal envelope: %v", err)
		return
	}
	if err := rdb.Publish(ctx, FlagUpdatesChannel, payload).Err(); err != nil {
		log.Printf("sse: redis publish: %v", err)
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
		log.Printf("sse: no redis client, cross-instance propagation disabled")
		return
	}
	sub := rdb.Subscribe(ctx, FlagUpdatesChannel)
	defer sub.Close()

	log.Printf("sse: subscribed to %q", FlagUpdatesChannel)
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
				log.Printf("sse: bad envelope: %v", err)
				continue
			}
			broker.Broadcast(SSEEvent{
				Event:   env.Type,
				Data:    string(env.Data),
				Version: env.Version,
			})
		}
	}
}
