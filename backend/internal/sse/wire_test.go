package sse

import (
	"context"
	"encoding/json"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// captureSink records every SSEEvent broadcast to it.
type captureSink struct {
	mu     sync.Mutex
	events []SSEEvent
	got    chan struct{}
}

func newCaptureSink() *captureSink { return &captureSink{got: make(chan struct{}, 16)} }

func (c *captureSink) Broadcast(e SSEEvent) {
	c.mu.Lock()
	c.events = append(c.events, e)
	c.mu.Unlock()
	c.got <- struct{}{}
}

func (c *captureSink) snapshot() []SSEEvent {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]SSEEvent, len(c.events))
	copy(out, c.events)
	return out
}

// TestCrossInstanceFanout proves the core W2 mechanism: one publish reaches the
// subscribers of MULTIPLE backends (here, two independent sinks on one Redis).
// Requires a real Redis (REDIS_TEST_URL); skipped otherwise.
func TestCrossInstanceFanout(t *testing.T) {
	url := os.Getenv("REDIS_TEST_URL")
	if url == "" {
		t.Skip("set REDIS_TEST_URL to run the cross-instance fan-out test")
	}
	opt, err := redis.ParseURL(url)
	if err != nil {
		t.Fatalf("parse redis url: %v", err)
	}
	rdb := redis.NewClient(opt)
	defer rdb.Close()
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		t.Skipf("redis not reachable: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Baseline first: the channel may already have subscribers (e.g. a running
	// compose cluster on the same Redis), so we wait for OUR two to register on
	// top of whatever is already there — not an absolute count.
	baseline := subscriberCount(t, rdb)

	// Two backends' subscribers, both on the same Redis channel.
	sinkA, sinkB := newCaptureSink(), newCaptureSink()
	go Subscribe(ctx, rdb, sinkA)
	go Subscribe(ctx, rdb, sinkB)

	// Wait for both of our subscriptions to be live before publishing.
	waitForSubscribers(t, rdb, baseline+2)

	data := json.RawMessage(`{"key":"checkout","enabled":true,"version":42}`)
	Publish(ctx, rdb, "flag_updated", 42, data)

	// Both sinks must receive the event — a write on ONE node reaching clients on
	// ALL nodes is exactly cross-instance propagation.
	waitFor(t, sinkA.got)
	waitFor(t, sinkB.got)

	for name, s := range map[string]*captureSink{"A": sinkA, "B": sinkB} {
		evs := s.snapshot()
		if len(evs) != 1 {
			t.Fatalf("sink %s: want 1 event, got %d", name, len(evs))
		}
		if evs[0].Event != "flag_updated" || evs[0].Version != 42 {
			t.Fatalf("sink %s: bad event %+v", name, evs[0])
		}
	}
}

func subscriberCount(t *testing.T, rdb *redis.Client) int {
	t.Helper()
	res, err := rdb.PubSubNumSub(context.Background(), FlagUpdatesChannel).Result()
	if err != nil {
		t.Fatalf("pubsub numsub: %v", err)
	}
	return int(res[FlagUpdatesChannel])
}

func waitForSubscribers(t *testing.T, rdb *redis.Client, want int) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if subscriberCount(t, rdb) >= want {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %d subscribers", want)
}

func waitFor(t *testing.T, ch <-chan struct{}) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for broadcast")
	}
}
