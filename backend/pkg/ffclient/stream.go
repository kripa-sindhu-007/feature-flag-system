package ffclient

import (
	"bufio"
	"context"
	"net/http"
	"strings"
	"time"
)

// Start bootstraps the snapshot then keeps a live SSE stream open, reconnecting
// with backoff and reconciling after every (re)connect so the client always
// converges to the latest committed version. It blocks until ctx is cancelled.
func (c *Client) Start(ctx context.Context) error {
	if err := c.Bootstrap(ctx); err != nil {
		return err
	}
	go c.streamLoop(ctx)
	return nil
}

func (c *Client) streamLoop(ctx context.Context) {
	backoff := 500 * time.Millisecond
	const maxBackoff = 5 * time.Second
	for {
		if ctx.Err() != nil {
			return
		}
		// Reconcile before/after (re)connecting to backfill anything missed
		// while the stream was down.
		_ = c.Reconcile(ctx)

		err := c.stream(ctx)
		if ctx.Err() != nil {
			return
		}
		_ = err // reconnect regardless of why the stream ended

		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < maxBackoff {
			backoff *= 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
		}
	}
}

// stream opens one SSE connection and applies frames until it ends. A gap
// (non-contiguous version) triggers an inline reconcile.
func (c *Client) stream(ctx context.Context) error {
	req, err := c.newRequest(ctx, "GET", "/api/client/stream", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "text/event-stream")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return errStatus(resp.StatusCode)
	}

	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var eventType, data string
	var id string
	for sc.Scan() {
		line := sc.Text()
		switch {
		case line == "":
			// Dispatch on blank line.
			if data != "" {
				version, ok := parseSSEVersion(id)
				if !ok {
					version = c.ConfigVersion() + 1
				} else if c.cfg.OnVersion != nil {
					// Passive measurement hook: record when this client observed
					// the versioned frame on the wire (before apply/reconcile).
					c.cfg.OnVersion(version, time.Now())
				}
				if c.applyLiveEvent(eventType, data, version) {
					if err := c.Reconcile(ctx); err != nil {
						return err
					}
				}
			}
			eventType, data, id = "", "", ""
		case strings.HasPrefix(line, ":"):
			// Comment / heartbeat — ignore.
		case strings.HasPrefix(line, "event:"):
			eventType = strings.TrimSpace(line[len("event:"):])
		case strings.HasPrefix(line, "data:"):
			data += strings.TrimSpace(line[len("data:"):])
		case strings.HasPrefix(line, "id:"):
			id = strings.TrimSpace(line[len("id:"):])
		}
	}
	return sc.Err()
}

type statusError int

func (e statusError) Error() string { return "unexpected stream status" }

func errStatus(code int) error { return statusError(code) }
