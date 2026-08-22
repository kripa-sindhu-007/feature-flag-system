package sse

import (
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/feature-flag-system/backend/internal/metrics"
)

// heartbeatInterval keeps idle SSE connections (and any intermediary proxies)
// alive by sending a comment frame on a timer.
const heartbeatInterval = 15 * time.Second

// defaultIdleTimeout is the absolute cap between successful deliveries (event
// OR heartbeat) before a connection is dropped. Healthy clients get a heartbeat
// every 15s which resets the idle timer, so this only fires for stuck/dead
// connections whose ticker never delivers — it MUST stay comfortably above the
// heartbeat interval so a healthy idle client is never dropped.
const defaultIdleTimeout = 60 * time.Second

// SSEEvent is one message fanned out to connected clients. Version is the global
// monotonic config version the event represents; it is emitted as the SSE `id:`
// field so clients can detect gaps and reconcile. Version 0 means "no id".
type SSEEvent struct {
	Event   string
	Data    string
	Version int64
}

type Broker struct {
	clients    map[chan SSEEvent]bool
	register   chan chan SSEEvent
	unregister chan chan SSEEvent
	broadcast  chan SSEEvent
	countReq   chan chan int

	idleTimeout time.Duration

	shutdown     chan struct{}
	shutdownOnce sync.Once
	done         chan struct{} // closed once Run has exited and drained clients
}

func NewBroker() *Broker {
	return &Broker{
		clients:     make(map[chan SSEEvent]bool),
		register:    make(chan chan SSEEvent),
		unregister:  make(chan chan SSEEvent),
		broadcast:   make(chan SSEEvent),
		countReq:    make(chan chan int),
		idleTimeout: defaultIdleTimeout,
		shutdown:    make(chan struct{}),
		done:        make(chan struct{}),
	}
}

// SetIdleTimeout overrides the per-connection idle cap. Call before Run.
func (b *Broker) SetIdleTimeout(d time.Duration) {
	if d > 0 {
		b.idleTimeout = d
	}
}

func (b *Broker) Run() {
	for {
		select {
		case <-b.shutdown:
			// Drain: close every client channel so their ServeHTTP loops return,
			// then stop the loop. done unblocks any handler parked on unregister
			// and any caller of Broadcast/ClientCount.
			for client := range b.clients {
				delete(b.clients, client)
				close(client)
			}
			metrics.SetConnectedClients(0)
			close(b.done)
			return

		case client := <-b.register:
			b.clients[client] = true
			metrics.SetConnectedClients(len(b.clients))
			slog.Info("sse client connected", "total", len(b.clients))

		case client := <-b.unregister:
			if _, ok := b.clients[client]; ok {
				delete(b.clients, client)
				close(client)
				metrics.SetConnectedClients(len(b.clients))
				slog.Info("sse client disconnected", "total", len(b.clients))
			}

		case event := <-b.broadcast:
			for client := range b.clients {
				select {
				case client <- event:
				default:
					delete(b.clients, client)
					close(client)
				}
			}
			metrics.SetConnectedClients(len(b.clients))

		case reply := <-b.countReq:
			reply <- len(b.clients)
		}
	}
}

// Shutdown stops Run, closing all connected clients so streaming handlers
// return. Safe to call once; blocks until the drain completes.
func (b *Broker) Shutdown() {
	b.shutdownOnce.Do(func() { close(b.shutdown) })
	<-b.done
}

func (b *Broker) Broadcast(event SSEEvent) {
	select {
	case b.broadcast <- event:
	case <-b.done:
	}
}

// ClientCount reports the number of connected SSE clients on this node.
func (b *Broker) ClientCount() int {
	reply := make(chan int)
	select {
	case b.countReq <- reply:
		return <-reply
	case <-b.done:
		return 0
	}
}

func (b *Broker) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Set SSE headers BEFORE the first flush. The first flush commits the 200
	// status with whatever headers are set at that moment, so Content-Type must
	// already be text/event-stream — browsers' EventSource refuses any other
	// type and would hang in CONNECTING. (curl ignores Content-Type, which is
	// why this only shows up in a real browser.)
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// ResponseController walks the middleware Unwrap() chain to reach a real
	// Flusher, so streaming works even when the writer is wrapped (e.g. by the
	// logging middleware). This flush also commits the headers above.
	rc := http.NewResponseController(w)
	if err := rc.Flush(); err != nil {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	client := make(chan SSEEvent, 16)
	// If the broker is already shutting down, Run has exited and no one will
	// receive on register — sending unguarded would block until the request
	// context is cancelled. Bail out via done instead.
	select {
	case b.register <- client:
	case <-b.done:
		return
	}

	defer func() {
		// After Shutdown, Run has exited and already closed this channel; sending
		// on unregister would block forever, so bail out via done.
		select {
		case b.unregister <- client:
		case <-b.done:
		}
	}()

	// Nudge headers/handshake to the client immediately.
	fmt.Fprintf(w, ": connected\n\n")
	rc.Flush()

	heartbeat := time.NewTicker(heartbeatInterval)
	defer heartbeat.Stop()

	// Absolute idle cap: reset on every successful delivery (event or
	// heartbeat). Because heartbeats fire every 15s < idleTimeout, a healthy
	// client is never dropped; a stuck client whose deliveries stall is reaped.
	idle := time.NewTimer(b.idleTimeout)
	defer idle.Stop()
	resetIdle := func() {
		if !idle.Stop() {
			select {
			case <-idle.C:
			default:
			}
		}
		idle.Reset(b.idleTimeout)
	}

	ctx := r.Context()

	for {
		select {
		case <-ctx.Done():
			return
		case <-idle.C:
			slog.Warn("sse client idle timeout, dropping")
			return
		case <-heartbeat.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			if err := rc.Flush(); err != nil {
				return
			}
			resetIdle()
		case event, ok := <-client:
			if !ok {
				// Broker dropped a slow/closed client, or is shutting down.
				return
			}
			if event.Version > 0 {
				fmt.Fprintf(w, "id: %d\n", event.Version)
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Event, event.Data)
			if err := rc.Flush(); err != nil {
				return
			}
			resetIdle()
		}
	}
}
