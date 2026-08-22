package sse

import (
	"testing"
	"time"
)

// TestBrokerShutdownClosesClients: a connected client channel is closed by the
// drain so its ServeHTTP loop returns, Shutdown returns, and post-shutdown
// Broadcast/ClientCount never block.
func TestBrokerShutdownClosesClients(t *testing.T) {
	b := NewBroker()
	go b.Run()

	client := make(chan SSEEvent, 1)
	b.register <- client

	done := make(chan struct{})
	go func() { b.Shutdown(); close(done) }()

	select {
	case _, ok := <-client:
		if ok {
			t.Fatal("client channel should be closed on shutdown")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("client channel not closed within timeout")
	}

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Shutdown did not return")
	}

	// Must not deadlock now that Run has exited.
	b.Broadcast(SSEEvent{Event: "flag_updated", Version: 1})
	if n := b.ClientCount(); n != 0 {
		t.Fatalf("ClientCount after shutdown = %d, want 0", n)
	}
}

// TestBrokerShutdownIdempotent: calling Shutdown twice is safe.
func TestBrokerShutdownIdempotent(t *testing.T) {
	b := NewBroker()
	go b.Run()
	b.Shutdown()
	b.Shutdown()
}
