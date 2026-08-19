package migrate_test

import (
	"context"
	"io/fs"
	"os"
	"testing"

	"github.com/feature-flag-system/backend/internal/migrate"
	"github.com/feature-flag-system/backend/migrations"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestMigrationsOrderedAndIdempotent verifies the runner applies each file once
// and that re-running is a clean no-op.
func TestMigrationsOrderedAndIdempotent(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping DB integration test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	// Run twice — the second run must not error and must not re-apply anything.
	if err := migrate.Run(ctx, pool, migrations.FS); err != nil {
		t.Fatalf("first run: %v", err)
	}
	if err := migrate.Run(ctx, pool, migrations.FS); err != nil {
		t.Fatalf("second run (idempotency): %v", err)
	}

	names, err := fs.Glob(migrations.FS, "*.sql")
	if err != nil {
		t.Fatalf("glob: %v", err)
	}

	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != len(names) {
		t.Fatalf("expected %d applied migrations, got %d", len(names), count)
	}
}
