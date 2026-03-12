package sse

import (
	"fmt"
	"log"
	"net/http"
)

type SSEEvent struct {
	Event string
	Data  string
}

type Broker struct {
	clients    map[chan SSEEvent]bool
	register   chan chan SSEEvent
	unregister chan chan SSEEvent
	broadcast  chan SSEEvent
}

func NewBroker() *Broker {
	return &Broker{
		clients:    make(map[chan SSEEvent]bool),
		register:   make(chan chan SSEEvent),
		unregister: make(chan chan SSEEvent),
		broadcast:  make(chan SSEEvent),
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
		}
	}
}

func (b *Broker) Broadcast(event SSEEvent) {
	b.broadcast <- event
}

func (b *Broker) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	client := make(chan SSEEvent)
	b.register <- client

	defer func() {
		b.unregister <- client
	}()

	ctx := r.Context()

	for {
		select {
		case <-ctx.Done():
			return
		case event := <-client:
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Event, event.Data)
			flusher.Flush()
		}
	}
}
