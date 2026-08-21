package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/feature-flag-system/backend/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrVersionConflict is returned when an optimistic write's expected version
// does not match the flag's current version (a concurrent writer won).
var ErrVersionConflict = errors.New("version conflict")

// flagColumns is the canonical select list / scan order for a flag row.
const flagColumns = `id, key, description, enabled, rollout_percentage, targeted_users, version, created_at, updated_at`

type FlagRepository interface {
	Create(ctx context.Context, flag *model.Flag) error
	GetByID(ctx context.Context, id string) (*model.Flag, error)
	GetByKey(ctx context.Context, key string) (*model.Flag, error)
	List(ctx context.Context) ([]model.Flag, error)
	Update(ctx context.Context, id string, req model.UpdateFlagRequest) (*model.Flag, error)
	Toggle(ctx context.Context, id string) (*model.Flag, error)
	// Delete removes a flag and returns the config version of the delete event.
	Delete(ctx context.Context, id string) (int64, error)
	GetLatestVersion(ctx context.Context) (int64, error)
	ListEventsByFlag(ctx context.Context, flagKey string, limit int) ([]model.FlagEvent, error)
	// ListEventsSince returns events with version > since, in ascending version
	// order — the ordered backlog a client replays to reconcile after a gap.
	ListEventsSince(ctx context.Context, since int64, limit int) ([]model.FlagEvent, error)
}

type postgresRepo struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) FlagRepository {
	return &postgresRepo{pool: pool}
}

func scanFlag(row pgx.Row, f *model.Flag) error {
	return row.Scan(
		&f.ID, &f.Key, &f.Description, &f.Enabled,
		&f.RolloutPercentage, &f.TargetedUsers, &f.Version, &f.CreatedAt, &f.UpdatedAt,
	)
}

// nextVersion advances the global monotonic config version inside a tx.
func nextVersion(ctx context.Context, tx pgx.Tx) (int64, error) {
	var v int64
	err := tx.QueryRow(ctx, `SELECT nextval('config_version_seq')`).Scan(&v)
	return v, err
}

// appendEvent writes one row to the durable, append-only event log.
func appendEvent(ctx context.Context, tx pgx.Tx, version int64, eventType, flagKey, payload string) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO flag_events (version, event_type, flag_key, payload) VALUES ($1, $2, $3, $4::jsonb)`,
		version, eventType, flagKey, payload,
	)
	return err
}

func flagPayload(f *model.Flag) string {
	b, _ := json.Marshal(f.ToResponse())
	return string(b)
}

func (r *postgresRepo) Create(ctx context.Context, flag *model.Flag) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	version, err := nextVersion(ctx, tx)
	if err != nil {
		return err
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO feature_flags (key, description, enabled, rollout_percentage, targeted_users, version)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at, updated_at`,
		flag.Key, flag.Description, flag.Enabled, flag.RolloutPercentage, flag.TargetedUsers, version,
	).Scan(&flag.ID, &flag.CreatedAt, &flag.UpdatedAt)
	if err != nil {
		return err
	}
	flag.Version = version

	if err := appendEvent(ctx, tx, version, "created", flag.Key, flagPayload(flag)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *postgresRepo) GetByID(ctx context.Context, id string) (*model.Flag, error) {
	var flag model.Flag
	err := scanFlag(r.pool.QueryRow(ctx,
		`SELECT `+flagColumns+` FROM feature_flags WHERE id = $1`, id), &flag)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &flag, nil
}

func (r *postgresRepo) GetByKey(ctx context.Context, key string) (*model.Flag, error) {
	var flag model.Flag
	err := scanFlag(r.pool.QueryRow(ctx,
		`SELECT `+flagColumns+` FROM feature_flags WHERE key = $1`, key), &flag)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &flag, nil
}

func (r *postgresRepo) List(ctx context.Context) ([]model.Flag, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+flagColumns+` FROM feature_flags ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var flags []model.Flag
	for rows.Next() {
		var f model.Flag
		if err := scanFlag(rows, &f); err != nil {
			return nil, err
		}
		flags = append(flags, f)
	}
	return flags, rows.Err()
}

// Update applies the provided fields inside a transaction, bumping the flag's
// version and appending an event. If req.ExpectedVersion is set, the write only
// applies when the flag's current version matches, else ErrVersionConflict.
func (r *postgresRepo) Update(ctx context.Context, id string, req model.UpdateFlagRequest) (*model.Flag, error) {
	setClauses := []string{}
	args := []interface{}{}
	add := func(col string, val interface{}) {
		args = append(args, val)
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", col, len(args)))
	}

	if req.Description != nil {
		add("description", *req.Description)
	}
	if req.Enabled != nil {
		add("enabled", *req.Enabled)
	}
	if req.RolloutPercentage != nil {
		add("rollout_percentage", *req.RolloutPercentage)
	}
	if req.TargetedUsers != nil {
		add("targeted_users", req.TargetedUsers)
	}

	// Nothing to change → no version bump, no event.
	if len(setClauses) == 0 {
		return r.GetByID(ctx, id)
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	version, err := nextVersion(ctx, tx)
	if err != nil {
		return nil, err
	}
	add("version", version)

	args = append(args, id)
	where := fmt.Sprintf("id = $%d", len(args))
	if req.ExpectedVersion != nil {
		args = append(args, *req.ExpectedVersion)
		where += fmt.Sprintf(" AND version = $%d", len(args))
	}

	query := fmt.Sprintf(`UPDATE feature_flags SET %s WHERE %s RETURNING %s`,
		strings.Join(setClauses, ", "), where, flagColumns)

	var flag model.Flag
	err = scanFlag(tx.QueryRow(ctx, query, args...), &flag)
	if err == pgx.ErrNoRows {
		// No row updated: either the flag is gone, or the optimistic guard failed.
		if req.ExpectedVersion != nil {
			var exists bool
			if e := tx.QueryRow(ctx,
				`SELECT EXISTS(SELECT 1 FROM feature_flags WHERE id = $1)`, id).Scan(&exists); e != nil {
				return nil, e
			}
			if exists {
				return nil, ErrVersionConflict
			}
		}
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if err := appendEvent(ctx, tx, version, "updated", flag.Key, flagPayload(&flag)); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &flag, nil
}

// Toggle flips enabled in a single atomic statement — no read-modify-write race,
// so concurrent toggles never lose an update.
func (r *postgresRepo) Toggle(ctx context.Context, id string) (*model.Flag, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	version, err := nextVersion(ctx, tx)
	if err != nil {
		return nil, err
	}

	var flag model.Flag
	err = scanFlag(tx.QueryRow(ctx, `
		UPDATE feature_flags SET enabled = NOT enabled, version = $2
		WHERE id = $1
		RETURNING `+flagColumns, id, version), &flag)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if err := appendEvent(ctx, tx, version, "updated", flag.Key, flagPayload(&flag)); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &flag, nil
}

func (r *postgresRepo) Delete(ctx context.Context, id string) (int64, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var key string
	err = tx.QueryRow(ctx, `SELECT key FROM feature_flags WHERE id = $1`, id).Scan(&key)
	if err == pgx.ErrNoRows {
		return 0, fmt.Errorf("flag not found")
	}
	if err != nil {
		return 0, err
	}

	version, err := nextVersion(ctx, tx)
	if err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM feature_flags WHERE id = $1`, id); err != nil {
		return 0, err
	}

	payload, _ := json.Marshal(map[string]string{"id": id, "key": key})
	if err := appendEvent(ctx, tx, version, "deleted", key, string(payload)); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return version, nil
}

// GetLatestVersion returns the global config version = the highest committed
// event version (0 if nothing has ever been written).
func (r *postgresRepo) GetLatestVersion(ctx context.Context) (int64, error) {
	var v int64
	err := r.pool.QueryRow(ctx, `SELECT COALESCE(MAX(version), 0) FROM flag_events`).Scan(&v)
	return v, err
}

func (r *postgresRepo) ListEventsByFlag(ctx context.Context, flagKey string, limit int) ([]model.FlagEvent, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	rows, err := r.pool.Query(ctx, `
		SELECT version, event_type, flag_key, payload, created_at
		FROM flag_events WHERE flag_key = $1
		ORDER BY version DESC LIMIT $2`, flagKey, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []model.FlagEvent{}
	for rows.Next() {
		var e model.FlagEvent
		var payload []byte
		if err := rows.Scan(&e.Version, &e.EventType, &e.FlagKey, &payload, &e.CreatedAt); err != nil {
			return nil, err
		}
		e.Payload = payload
		events = append(events, e)
	}
	return events, rows.Err()
}

func (r *postgresRepo) ListEventsSince(ctx context.Context, since int64, limit int) ([]model.FlagEvent, error) {
	if limit <= 0 {
		limit = 500
	}
	if limit > 1000 {
		limit = 1000
	}
	rows, err := r.pool.Query(ctx, `
		SELECT version, event_type, flag_key, payload, created_at
		FROM flag_events WHERE version > $1
		ORDER BY version ASC LIMIT $2`, since, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []model.FlagEvent{}
	for rows.Next() {
		var e model.FlagEvent
		var payload []byte
		if err := rows.Scan(&e.Version, &e.EventType, &e.FlagKey, &payload, &e.CreatedAt); err != nil {
			return nil, err
		}
		e.Payload = payload
		events = append(events, e)
	}
	return events, rows.Err()
}
