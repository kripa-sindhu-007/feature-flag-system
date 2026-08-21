// Package migrate applies ordered SQL migrations exactly once each, tracking
// applied files in a schema_migrations table. Ordered, run-once, idempotent.
package migrate

import (
	"context"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// advisoryLockKey serializes migration runs across processes. When several
// backend replicas boot together (the 3-replica cluster), only one migrates at
// a time; the others block here, then find every migration already applied and
// skip. Without this, two racing runners double-apply DDL and crash on startup.
const advisoryLockKey = 0x66666C6167 // "flag"

// Run applies every *.sql file in fsys, in filename order, that has not already
// been recorded in schema_migrations. Each file is applied in its own
// transaction together with its bookkeeping row, so a failure leaves no
// half-applied migration. Re-running Run is a no-op, and concurrent runs across
// replicas are serialized by a session-level advisory lock.
func Run(ctx context.Context, pool *pgxpool.Pool, fsys fs.FS) error {
	// Hold the advisory lock on a dedicated connection for the whole run.
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire migration lock conn: %w", err)
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, advisoryLockKey); err != nil {
		return fmt.Errorf("acquire advisory lock: %w", err)
	}
	defer conn.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, advisoryLockKey)

	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	names, err := fs.Glob(fsys, "*.sql")
	if err != nil {
		return fmt.Errorf("glob migrations: %w", err)
	}
	sort.Strings(names)

	for _, name := range names {
		var applied bool
		if err := pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)`, name,
		).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s: %w", name, err)
		}
		if applied {
			continue
		}

		body, err := fs.ReadFile(fsys, name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		if err := applyOne(ctx, pool, name, string(body)); err != nil {
			return err
		}
	}
	return nil
}

func applyOne(ctx context.Context, pool *pgxpool.Pool, name, body string) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin migration %s: %w", name, err)
	}
	defer tx.Rollback(ctx) // no-op after a successful commit

	if strings.TrimSpace(body) != "" {
		if _, err := tx.Exec(ctx, body); err != nil {
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO schema_migrations (version) VALUES ($1)`, name,
	); err != nil {
		return fmt.Errorf("record migration %s: %w", name, err)
	}
	return tx.Commit(ctx)
}
