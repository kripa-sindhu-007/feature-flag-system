// Package chaoskit is the shared toolkit behind the Week-4 chaos asserter
// (cmd/chaos) and the soak runner (cmd/soak). It is built entirely on the public
// Go SDK (pkg/ffclient) plus the public HTTP API — it imports nothing from the
// server's internal packages — so the experiments exercise the system exactly as
// a real embedding application would.
//
// It provides three things:
//
//   - Admin: a thin admin/client REST helper (create / update / toggle / list /
//     latest-version) through the nginx LB or a specific node.
//   - Metrics scraping of a node's /metrics (used to assert
//     redis_publish_errors_total incremented during the Redis outage).
//   - A small docker-compose fault-injection shim (Stop/Start/Pause/Unpause/Kill).
//
// The fleet + invariant checkers live in fleet.go.
package chaoskit

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/feature-flag-system/backend/pkg/ffclient"
)

// Admin drives the admin + client HTTP API through a base URL (the LB, or a
// specific node's host port). It carries both keys so a single handle can issue
// admin writes and read the client-facing version/flags.
type Admin struct {
	BaseURL  string
	AdminKey string
	SDKKey   string
	HC       *http.Client
}

// NewAdmin builds an Admin with a sane default HTTP client (short timeout — these
// are request/response calls, never long-lived streams).
func NewAdmin(baseURL, adminKey, sdkKey string) *Admin {
	return &Admin{
		BaseURL:  baseURL,
		AdminKey: adminKey,
		SDKKey:   sdkKey,
		HC:       &http.Client{Timeout: 10 * time.Second},
	}
}

func (a *Admin) do(ctx context.Context, method, path string, body []byte, headers map[string]string) (*http.Response, error) {
	var r *bytes.Reader
	if body != nil {
		r = bytes.NewReader(body)
	} else {
		r = bytes.NewReader(nil)
	}
	req, err := http.NewRequestWithContext(ctx, method, a.BaseURL+path, r)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Admin-API-Key", a.AdminKey)
	req.Header.Set("X-SDK-Key", a.SDKKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	return a.HC.Do(req)
}

// EnsureFlag returns the id of flagKey, creating it (enabled, 50% rollout) if
// absent. Idempotent so scenarios can be re-run.
func (a *Admin) EnsureFlag(ctx context.Context, flagKey string) (string, error) {
	body, _ := json.Marshal(map[string]any{
		"key":                flagKey,
		"description":        "chaos experiment flag (safe to toggle)",
		"enabled":            true,
		"rollout_percentage": 50,
		"targeted_users":     []string{},
	})
	resp, err := a.do(ctx, "POST", "/api/admin/flags", body, nil)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusCreated {
		var f struct {
			ID string `json:"id"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&f); err != nil {
			return "", err
		}
		return f.ID, nil
	}
	if resp.StatusCode != http.StatusConflict {
		return "", fmt.Errorf("create flag: status %d", resp.StatusCode)
	}
	// Already exists → find it.
	id, _, err := a.flagByKey(ctx, flagKey)
	return id, err
}

// AdminFlag is the subset of a flag row the toolkit reads back from the admin API.
type AdminFlag struct {
	ID                string   `json:"id"`
	Key               string   `json:"key"`
	Enabled           bool     `json:"enabled"`
	RolloutPercentage int      `json:"rollout_percentage"`
	TargetedUsers     []string `json:"targeted_users"`
	Version           int64    `json:"version"`
}

// ListFlags returns all flags and the server's global config version, straight
// from the admin API (the authoritative "latest committed" view).
func (a *Admin) ListFlags(ctx context.Context) ([]AdminFlag, int64, error) {
	resp, err := a.do(ctx, "GET", "/api/admin/flags", nil, nil)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("list flags: status %d", resp.StatusCode)
	}
	var body struct {
		Flags         []AdminFlag `json:"flags"`
		ConfigVersion int64       `json:"config_version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, 0, err
	}
	return body.Flags, body.ConfigVersion, nil
}

func (a *Admin) flagByKey(ctx context.Context, key string) (string, AdminFlag, error) {
	flags, _, err := a.ListFlags(ctx)
	if err != nil {
		return "", AdminFlag{}, err
	}
	for _, f := range flags {
		if f.Key == key {
			return f.ID, f, nil
		}
	}
	return "", AdminFlag{}, fmt.Errorf("flag %q not found", key)
}

// GetFlagByKey returns the current committed state of one flag.
func (a *Admin) GetFlagByKey(ctx context.Context, key string) (AdminFlag, error) {
	_, f, err := a.flagByKey(ctx, key)
	return f, err
}

// LatestVersion reads the current global config version via the client API
// (/api/client/version) — this is the "server latest" convergence target.
func (a *Admin) LatestVersion(ctx context.Context) (int64, error) {
	resp, err := a.do(ctx, "GET", "/api/client/version", nil, nil)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("version: status %d", resp.StatusCode)
	}
	var v struct {
		ConfigVersion int64 `json:"config_version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		return 0, err
	}
	return v.ConfigVersion, nil
}

// WriteResult captures the outcome of a single mutating call: the HTTP status,
// and (on success) the committed version and enabled state.
type WriteResult struct {
	Status  int
	Version int64
	Enabled bool
}

// Toggle flips a flag's enabled state (atomic server-side). Returns the committed
// version. A non-200 status is returned as an error carrying the status.
func (a *Admin) Toggle(ctx context.Context, flagID string) (WriteResult, error) {
	resp, err := a.do(ctx, "PATCH", "/api/admin/flags/"+flagID+"/toggle", nil, nil)
	if err != nil {
		return WriteResult{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return WriteResult{Status: resp.StatusCode}, fmt.Errorf("toggle: status %d", resp.StatusCode)
	}
	var f struct {
		Version int64 `json:"version"`
		Enabled bool  `json:"enabled"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&f); err != nil {
		return WriteResult{Status: resp.StatusCode}, err
	}
	return WriteResult{Status: resp.StatusCode, Version: f.Version, Enabled: f.Enabled}, nil
}

// Update issues a PUT with an optional If-Match version for optimistic
// concurrency. It NEVER treats a 409 as an error: the WriteResult carries the
// status so the caller can distinguish a committed write (200) from a rejected
// conflict (409) — the whole point of the concurrent-writers experiment.
func (a *Admin) Update(ctx context.Context, flagID string, body map[string]any, ifMatch int64) (WriteResult, error) {
	b, _ := json.Marshal(body)
	headers := map[string]string{}
	if ifMatch > 0 {
		headers["If-Match"] = strconv.FormatInt(ifMatch, 10)
	}
	resp, err := a.do(ctx, "PUT", "/api/admin/flags/"+flagID, b, headers)
	if err != nil {
		return WriteResult{}, err
	}
	defer resp.Body.Close()
	res := WriteResult{Status: resp.StatusCode}
	if resp.StatusCode == http.StatusOK {
		var f struct {
			Version int64 `json:"version"`
			Enabled bool  `json:"enabled"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&f); err != nil {
			return res, err
		}
		res.Version = f.Version
		res.Enabled = f.Enabled
	}
	return res, nil
}

// EventsSinceCount returns how many committed events exist with version > since —
// used to assert "one event per successful write" (no lost updates).
func (a *Admin) EventsSinceCount(ctx context.Context, since int64, flagKey string) (int, error) {
	resp, err := a.do(ctx, "GET", "/api/client/events?since="+strconv.FormatInt(since, 10), nil, nil)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("events: status %d", resp.StatusCode)
	}
	var body struct {
		Events []struct {
			Version int64  `json:"version"`
			FlagKey string `json:"flag_key"`
		} `json:"events"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return 0, err
	}
	n := 0
	for _, e := range body.Events {
		if flagKey == "" || e.FlagKey == flagKey {
			n++
		}
	}
	return n, nil
}

// RawToggle issues a toggle with a caller-supplied context (used to prove writes
// fail cleanly — a bounded 5xx, not a hang — while Postgres is down). It returns
// the status code, or an error if the call itself failed (timeout / connection
// refused).
func (a *Admin) RawToggle(ctx context.Context, flagID string) (int, error) {
	resp, err := a.do(ctx, "PATCH", "/api/admin/flags/"+flagID+"/toggle", nil, nil)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
}

// -- health / metrics scraping -----------------------------------------------

// Readyz probes a node's /readyz and returns its HTTP status (503 when a
// dependency is down). A transport error is returned as (0, err).
func Readyz(ctx context.Context, nodeURL string) (int, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", nodeURL+"/readyz", nil)
	if err != nil {
		return 0, err
	}
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
}

// ScrapeCounter fetches nodeURL/metrics and returns the value of a single
// (unlabeled) Prometheus counter, e.g. redis_publish_errors_total. Missing
// metric → 0 (a counter that never fired is not exposed until first use).
func ScrapeCounter(ctx context.Context, nodeURL, metric string) (float64, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", nodeURL+"/metrics", nil)
	if err != nil {
		return 0, err
	}
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("metrics: status %d", resp.StatusCode)
	}
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, metric+" ") || strings.HasPrefix(line, metric+"{") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				return strconv.ParseFloat(fields[len(fields)-1], 64)
			}
		}
	}
	return 0, nil
}

// SumCounterAcrossNodes sums a counter over several node URLs (each backend
// increments its own copy). Nodes that are unreachable contribute 0 with a
// logged note; the caller decides whether that matters.
func SumCounterAcrossNodes(ctx context.Context, metric string, nodeURLs []string) float64 {
	var total float64
	for _, u := range nodeURLs {
		v, err := ScrapeCounter(ctx, u, metric)
		if err != nil {
			continue
		}
		total += v
	}
	return total
}

// -- docker compose fault injection ------------------------------------------

// Compose shells out to `docker compose` in a fixed project directory to inject
// infrastructure faults. Every method returns the combined output on error so
// failures are legible in scenario logs.
type Compose struct {
	Dir string // repo root (where docker-compose.yml lives)
}

func (c *Compose) run(ctx context.Context, args ...string) error {
	full := append([]string{"compose"}, args...)
	cmd := exec.CommandContext(ctx, "docker", full...)
	cmd.Dir = c.Dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker %s: %v: %s", strings.Join(full, " "), err, strings.TrimSpace(string(out)))
	}
	return nil
}

func (c *Compose) Stop(ctx context.Context, svc string) error    { return c.run(ctx, "stop", svc) }
func (c *Compose) Start(ctx context.Context, svc string) error   { return c.run(ctx, "start", svc) }
func (c *Compose) Kill(ctx context.Context, svc string) error    { return c.run(ctx, "kill", svc) }
func (c *Compose) Pause(ctx context.Context, svc string) error   { return c.run(ctx, "pause", svc) }
func (c *Compose) Unpause(ctx context.Context, svc string) error { return c.run(ctx, "unpause", svc) }

// SpawnConfig configures a fleet member's SDK client.
type SpawnConfig struct {
	BaseURL string
	SDKKey  string
	HC      *http.Client
}

// newFFClient builds a raw ffclient wired to a version tracker's hook. Exposed
// via the fleet helpers; kept here so all SDK construction is in one place.
func newFFClient(cfg SpawnConfig, onVersion func(int64, time.Time)) *ffclient.Client {
	return ffclient.New(ffclient.Config{
		BaseURL:    cfg.BaseURL,
		SDKKey:     cfg.SDKKey,
		HTTPClient: cfg.HC,
		OnVersion:  onVersion,
	})
}
