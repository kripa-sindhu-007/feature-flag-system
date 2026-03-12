package repository

import (
	"context"
	"fmt"

	"github.com/feature-flag-system/backend/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type FlagRepository interface {
	Create(ctx context.Context, flag *model.Flag) error
	GetByID(ctx context.Context, id string) (*model.Flag, error)
	GetByKey(ctx context.Context, key string) (*model.Flag, error)
	List(ctx context.Context) ([]model.Flag, error)
	Update(ctx context.Context, id string, req model.UpdateFlagRequest) (*model.Flag, error)
	Delete(ctx context.Context, id string) error
}

type postgresRepo struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) FlagRepository {
	return &postgresRepo{pool: pool}
}

func (r *postgresRepo) Create(ctx context.Context, flag *model.Flag) error {
	query := `
		INSERT INTO feature_flags (key, description, enabled, rollout_percentage, targeted_users)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at`

	return r.pool.QueryRow(ctx, query,
		flag.Key, flag.Description, flag.Enabled, flag.RolloutPercentage, flag.TargetedUsers,
	).Scan(&flag.ID, &flag.CreatedAt, &flag.UpdatedAt)
}

func (r *postgresRepo) GetByID(ctx context.Context, id string) (*model.Flag, error) {
	query := `SELECT id, key, description, enabled, rollout_percentage, targeted_users, created_at, updated_at
		FROM feature_flags WHERE id = $1`

	var flag model.Flag
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&flag.ID, &flag.Key, &flag.Description, &flag.Enabled,
		&flag.RolloutPercentage, &flag.TargetedUsers, &flag.CreatedAt, &flag.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &flag, nil
}

func (r *postgresRepo) GetByKey(ctx context.Context, key string) (*model.Flag, error) {
	query := `SELECT id, key, description, enabled, rollout_percentage, targeted_users, created_at, updated_at
		FROM feature_flags WHERE key = $1`

	var flag model.Flag
	err := r.pool.QueryRow(ctx, query, key).Scan(
		&flag.ID, &flag.Key, &flag.Description, &flag.Enabled,
		&flag.RolloutPercentage, &flag.TargetedUsers, &flag.CreatedAt, &flag.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &flag, nil
}

func (r *postgresRepo) List(ctx context.Context) ([]model.Flag, error) {
	query := `SELECT id, key, description, enabled, rollout_percentage, targeted_users, created_at, updated_at
		FROM feature_flags ORDER BY created_at DESC`

	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var flags []model.Flag
	for rows.Next() {
		var f model.Flag
		if err := rows.Scan(
			&f.ID, &f.Key, &f.Description, &f.Enabled,
			&f.RolloutPercentage, &f.TargetedUsers, &f.CreatedAt, &f.UpdatedAt,
		); err != nil {
			return nil, err
		}
		flags = append(flags, f)
	}
	return flags, rows.Err()
}

func (r *postgresRepo) Update(ctx context.Context, id string, req model.UpdateFlagRequest) (*model.Flag, error) {
	setClauses := ""
	args := []interface{}{}
	argIdx := 1

	if req.Description != nil {
		setClauses += fmt.Sprintf("description = $%d, ", argIdx)
		args = append(args, *req.Description)
		argIdx++
	}
	if req.Enabled != nil {
		setClauses += fmt.Sprintf("enabled = $%d, ", argIdx)
		args = append(args, *req.Enabled)
		argIdx++
	}
	if req.RolloutPercentage != nil {
		setClauses += fmt.Sprintf("rollout_percentage = $%d, ", argIdx)
		args = append(args, *req.RolloutPercentage)
		argIdx++
	}
	if req.TargetedUsers != nil {
		setClauses += fmt.Sprintf("targeted_users = $%d, ", argIdx)
		args = append(args, req.TargetedUsers)
		argIdx++
	}

	if len(args) == 0 {
		return r.GetByID(ctx, id)
	}

	// Remove trailing ", "
	setClauses = setClauses[:len(setClauses)-2]

	query := fmt.Sprintf(`UPDATE feature_flags SET %s WHERE id = $%d
		RETURNING id, key, description, enabled, rollout_percentage, targeted_users, created_at, updated_at`,
		setClauses, argIdx)
	args = append(args, id)

	var flag model.Flag
	err := r.pool.QueryRow(ctx, query, args...).Scan(
		&flag.ID, &flag.Key, &flag.Description, &flag.Enabled,
		&flag.RolloutPercentage, &flag.TargetedUsers, &flag.CreatedAt, &flag.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &flag, nil
}

func (r *postgresRepo) Delete(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx, "DELETE FROM feature_flags WHERE id = $1", id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("flag not found")
	}
	return nil
}
