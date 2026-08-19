package repository

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"

	"github.com/feature-flag-system/backend/internal/migrate"
	"github.com/feature-flag-system/backend/internal/model"
	"github.com/feature-flag-system/backend/migrations"
	"github.com/jackc/pgx/v5/pgxpool"
)

// newTestRepo connects to TEST_DATABASE_URL, applies migrations, and starts from
// a clean slate. Tests are skipped when no test database is configured.
func newTestRepo(t *testing.T) (FlagRepository, *pgxpool.Pool) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping DB integration test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if err := migrate.Run(ctx, pool, migrations.FS); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if _, err := pool.Exec(ctx, `TRUNCATE feature_flags, flag_events`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	t.Cleanup(pool.Close)
	return NewPostgresRepository(pool), pool
}

func mustCreate(t *testing.T, repo FlagRepository, key string) *model.Flag {
	t.Helper()
	f := &model.Flag{Key: key, Enabled: false, RolloutPercentage: 0, TargetedUsers: []string{}}
	if err := repo.Create(context.Background(), f); err != nil {
		t.Fatalf("create: %v", err)
	}
	return f
}

func TestVersionMonotonicity(t *testing.T) {
	repo, _ := newTestRepo(t)
	ctx := context.Background()
	f := mustCreate(t, repo, "mono")

	prev := f.Version
	desc := ""
	for i := 0; i < 20; i++ {
		desc += "x"
		updated, err := repo.Update(ctx, f.ID, model.UpdateFlagRequest{Description: &desc})
		if err != nil {
			t.Fatalf("update %d: %v", i, err)
		}
		if updated.Version <= prev {
			t.Fatalf("version not increasing: %d <= %d", updated.Version, prev)
		}
		prev = updated.Version
	}

	latest, err := repo.GetLatestVersion(ctx)
	if err != nil {
		t.Fatalf("latest: %v", err)
	}
	if latest < prev {
		t.Fatalf("config version %d < flag version %d", latest, prev)
	}
}

func TestAtomicToggle(t *testing.T) {
	repo, _ := newTestRepo(t)
	ctx := context.Background()
	f := mustCreate(t, repo, "toggle")

	toggled, err := repo.Toggle(ctx, f.ID)
	if err != nil {
		t.Fatalf("toggle: %v", err)
	}
	if toggled.Enabled == f.Enabled {
		t.Fatal("enabled did not flip")
	}
	if toggled.Version <= f.Version {
		t.Fatalf("toggle did not bump version: %d <= %d", toggled.Version, f.Version)
	}

	events, err := repo.ListEventsByFlag(ctx, "toggle", 100)
	if err != nil {
		t.Fatalf("events: %v", err)
	}
	if len(events) != 2 { // created + one toggle
		t.Fatalf("expected 2 events, got %d", len(events))
	}
}

func TestOptimisticConflict(t *testing.T) {
	repo, _ := newTestRepo(t)
	ctx := context.Background()
	f := mustCreate(t, repo, "optimistic")

	// Correct expected version succeeds.
	stale := f.Version
	d1 := "first"
	if _, err := repo.Update(ctx, f.ID, model.UpdateFlagRequest{Description: &d1, ExpectedVersion: &stale}); err != nil {
		t.Fatalf("first update should succeed: %v", err)
	}

	// Reusing the now-stale version must conflict.
	d2 := "second"
	_, err := repo.Update(ctx, f.ID, model.UpdateFlagRequest{Description: &d2, ExpectedVersion: &stale})
	if !errors.Is(err, ErrVersionConflict) {
		t.Fatalf("expected ErrVersionConflict, got %v", err)
	}
}

// TestConcurrentTogglesNoLostUpdates is the core correctness gate: N goroutines
// toggle the same flag; every toggle must be recorded (zero lost updates).
func TestConcurrentTogglesNoLostUpdates(t *testing.T) {
	repo, pool := newTestRepo(t)
	ctx := context.Background()
	f := mustCreate(t, repo, "race")

	const n = 1000
	var wg sync.WaitGroup
	errs := make(chan error, n)
	// Bound concurrency so we don't exhaust the connection pool.
	sem := make(chan struct{}, 16)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			if _, err := repo.Toggle(ctx, f.ID); err != nil {
				errs <- err
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("toggle error: %v", err)
	}

	// Count events directly — 1 created + exactly n toggle events → nothing lost.
	var count int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM flag_events WHERE flag_key = 'race'`).Scan(&count); err != nil {
		t.Fatalf("count events: %v", err)
	}
	if count != n+1 {
		t.Fatalf("expected %d events, got %d (lost updates)", n+1, count)
	}

	// Every event version must be distinct (no duplicate/overwritten versions).
	var distinct int
	if err := pool.QueryRow(ctx,
		`SELECT count(DISTINCT version) FROM flag_events WHERE flag_key = 'race'`).Scan(&distinct); err != nil {
		t.Fatalf("count distinct: %v", err)
	}
	if distinct != count {
		t.Fatalf("expected %d distinct versions, got %d", count, distinct)
	}
}
