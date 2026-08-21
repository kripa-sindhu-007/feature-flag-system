// Package ffclient is a server-side Go SDK for the feature-flag system. It
// bootstraps the flag snapshot, evaluates flags locally (same FNV-1a rollout as
// the backend and the browser SDK), streams live updates over SSE, and
// reconciles any missed events after a disconnect so it always converges to the
// latest committed config version.
//
// It is deliberately self-contained (no imports from the server's internal
// packages) so it reads like a real published SDK — and in Weeks 3–4 it becomes
// the load / chaos / soak driver.
package ffclient

import (
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Flag is the client-side view of a feature flag.
type Flag struct {
	ID                string   `json:"id"`
	Key               string   `json:"key"`
	Description       string   `json:"description"`
	Enabled           bool     `json:"enabled"`
	RolloutPercentage int      `json:"rollout_percentage"`
	TargetedUsers     []string `json:"targeted_users"`
	Version           int64    `json:"version"`
}

// event mirrors one row of the server's flag_events log (reconcile payload).
type event struct {
	Version   int64           `json:"version"`
	EventType string          `json:"event_type"`
	FlagKey   string          `json:"flag_key"`
	Payload   json.RawMessage `json:"payload"`
}

// Config configures a Client.
type Config struct {
	BaseURL string
	SDKKey  string
	// HTTPClient is optional; a sane default is used when nil.
	HTTPClient *http.Client
}

// Client is a concurrency-safe feature-flag client.
type Client struct {
	cfg  Config
	http *http.Client

	mu            sync.RWMutex
	flags         map[string]Flag
	configVersion int64
}

// New creates a client. Call Bootstrap (or Start) before evaluating flags.
func New(cfg Config) *Client {
	hc := cfg.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: 10 * time.Second}
	}
	return &Client{
		cfg:   cfg,
		http:  hc,
		flags: make(map[string]Flag),
	}
}

// Bootstrap loads the full flag snapshot and the current config version.
func (c *Client) Bootstrap(ctx context.Context) error {
	req, err := c.newRequest(ctx, "GET", "/api/client/flags", nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bootstrap: status %d", resp.StatusCode)
	}
	var body struct {
		Flags         []Flag `json:"flags"`
		ConfigVersion int64  `json:"config_version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return err
	}
	c.mu.Lock()
	c.flags = make(map[string]Flag, len(body.Flags))
	for _, f := range body.Flags {
		c.flags[f.Key] = f
	}
	c.configVersion = body.ConfigVersion
	c.mu.Unlock()
	return nil
}

// IsEnabled evaluates a flag for a user locally: disabled → false; explicit
// target → true; else deterministic FNV-1a rollout. Zero network per call.
func (c *Client) IsEnabled(flagKey, userID string) bool {
	c.mu.RLock()
	f, ok := c.flags[flagKey]
	c.mu.RUnlock()
	if !ok || !f.Enabled {
		return false
	}
	for _, u := range f.TargetedUsers {
		if u == userID {
			return true
		}
	}
	return inRollout(flagKey, userID, f.RolloutPercentage)
}

// ConfigVersion returns the highest global version this client has applied.
func (c *Client) ConfigVersion() int64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.configVersion
}

// Flags returns a snapshot copy of the currently known flags.
func (c *Client) Flags() map[string]Flag {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make(map[string]Flag, len(c.flags))
	for k, v := range c.flags {
		out[k] = v
	}
	return out
}

// Reconcile replays the ordered event backlog after the client's current
// version and applies each in order, converging to the latest committed state.
// It pages through the backlog (the server caps events per response) until a
// page comes back empty, only ever advancing to an applied event's version —
// never blindly to the server's latest — so a multi-page backlog isn't skipped.
// Idempotent: re-applying an already-seen version is a no-op.
func (c *Client) Reconcile(ctx context.Context) error {
	for guard := 0; guard < 100000; guard++ {
		since := c.ConfigVersion()
		req, err := c.newRequest(ctx, "GET", "/api/client/events?since="+strconv.FormatInt(since, 10), nil)
		if err != nil {
			return err
		}
		resp, err := c.http.Do(req)
		if err != nil {
			return err
		}
		var body struct {
			Events []event `json:"events"`
		}
		decErr := json.NewDecoder(resp.Body).Decode(&body)
		status := resp.StatusCode
		resp.Body.Close()
		if status != http.StatusOK {
			return fmt.Errorf("reconcile: status %d", status)
		}
		if decErr != nil {
			return decErr
		}
		if len(body.Events) == 0 {
			return nil
		}

		c.mu.Lock()
		advanced := false
		for _, ev := range body.Events {
			if ev.Version <= c.configVersion {
				continue
			}
			c.applyLocked(ev.EventType, ev.FlagKey, ev.Payload, ev.Version)
			advanced = true
		}
		c.mu.Unlock()
		// No new version applied this page → we're caught up (guards against a
		// server that doesn't filter by `since`, and terminates the loop).
		if !advanced {
			return nil
		}
	}
	return nil
}

// applyLocked mutates flag state for one event. Caller holds c.mu.
func (c *Client) applyLocked(eventType, flagKey string, payload json.RawMessage, version int64) {
	switch eventType {
	case "deleted":
		delete(c.flags, flagKey)
	default: // created / updated
		var f Flag
		if err := json.Unmarshal(payload, &f); err == nil && f.Key != "" {
			c.flags[f.Key] = f
		}
	}
	c.configVersion = version
}

// applyLiveEvent handles one SSE frame with contiguity checks: stale/duplicate
// (<= current) ignored; gap (> current+1) → caller should reconcile; exact next
// applied. Returns true when a reconcile is required.
func (c *Client) applyLiveEvent(eventType, data string, version int64) (needsReconcile bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if version <= c.configVersion {
		return false
	}
	if version > c.configVersion+1 {
		return true
	}
	if eventType == "flag_deleted" {
		var d struct {
			Key string `json:"key"`
		}
		if err := json.Unmarshal([]byte(data), &d); err == nil {
			delete(c.flags, d.Key)
		}
	} else {
		var f Flag
		if err := json.Unmarshal([]byte(data), &f); err == nil && f.Key != "" {
			c.flags[f.Key] = f
		}
	}
	c.configVersion = version
	return false
}

func (c *Client) newRequest(ctx context.Context, method, path string, body any) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.cfg.BaseURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-SDK-Key", c.cfg.SDKKey)
	return req, nil
}

// inRollout is the FNV-1a rollout, byte-for-byte identical to the backend
// (internal/hash) and the browser SDK — cross-language evaluation parity is an
// invariant, verified by a shared golden vector.
func inRollout(flagKey, userID string, percentage int) bool {
	if percentage <= 0 {
		return false
	}
	if percentage >= 100 {
		return true
	}
	h := fnv.New32a()
	h.Write([]byte(flagKey + ":" + userID))
	return int(h.Sum32()%100) < percentage
}

// parseSSEVersion extracts the numeric version from an SSE `id:` value.
func parseSSEVersion(id string) (int64, bool) {
	id = strings.TrimSpace(id)
	if id == "" {
		return 0, false
	}
	v, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		return 0, false
	}
	return v, true
}
