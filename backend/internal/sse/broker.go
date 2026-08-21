package sse

import (
	"fmt"
	"log"
	"net/http"
	"time"
)

// heartbeatInterval keeps idle SSE connections (and any intermediary proxies)
// alive by sending a comment frame on a timer.
const heartbeatInterval = 15 * time.Second

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
}

func NewBroker() *Broker {
	return &Broker{
		clients:    make(map[chan SSEEvent]bool),
		register:   make(chan chan SSEEvent),
		unregister: make(chan chan SSEEvent),
		broadcast:  make(chan SSEEvent),
		countReq:   make(chan chan int),
	}
}

func (b *Broker) Run() {
	for {
		select {
		case client := <-b.register:
			b.clients[client] = true
			log.Printf("SSE client connected. Total: %d", len(b.clients))

		case client := <-b.unregister:
			if _, ok := b.clients[client]; ok {
				delete(b.clients, client)
				close(client)
				log.Printf("SSE client disconnected. Total: %d", len(b.clients))
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

		case reply := <-b.countReq:
			reply <- len(b.clients)
		}
	}
}

func (b *Broker) Broadcast(event SSEEvent) {
	b.broadcast <- event
}

// ClientCount reports the number of connected SSE clients on this node.
func (b *Broker) ClientCount() int {
	reply := make(chan int)
	b.countReq <- reply
	return <-reply
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
	b.register <- client

	defer func() {
		b.unregister <- client
	}()

	// Nudge headers/handshake to the client immediately.
	fmt.Fprintf(w, ": connected\n\n")
	rc.Flush()

	heartbeat := time.NewTicker(heartbeatInterval)
	defer heartbeat.Stop()

	ctx := r.Context()

	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeat.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			if err := rc.Flush(); err != nil {
				return
			}
		case event, ok := <-client:
			if !ok {
				// Broker dropped a slow/closed client.
				return
			}
			if event.Version > 0 {
				fmt.Fprintf(w, "id: %d\n", event.Version)
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Event, event.Data)
			if err := rc.Flush(); err != nil {
				return
			}
		}
	}
}
