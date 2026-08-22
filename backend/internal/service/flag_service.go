package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"

	"github.com/feature-flag-system/backend/internal/metrics"
	"github.com/feature-flag-system/backend/internal/model"
	"github.com/feature-flag-system/backend/internal/repository"
	"github.com/feature-flag-system/backend/internal/reqid"
	"github.com/feature-flag-system/backend/internal/sse"
	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/otel"
)

type FlagService interface {
	CreateFlag(ctx context.Context, req model.CreateFlagRequest) (*model.Flag, error)
	GetFlag(ctx context.Context, id string) (*model.Flag, error)
	ListFlags(ctx context.Context) ([]model.Flag, error)
	UpdateFlag(ctx context.Context, id string, req model.UpdateFlagRequest) (*model.Flag, error)
	DeleteFlag(ctx context.Context, id string) error
	ToggleFlag(ctx context.Context, id string) (*model.Flag, error)
	GetAllFlagConfigs(ctx context.Context) ([]model.Flag, error)
	GetLatestVersion(ctx context.Context) (int64, error)
	GetFlagHistory(ctx context.Context, id string, limit int) ([]model.FlagEvent, error)
	GetEventsSince(ctx context.Context, since int64, limit int) ([]model.FlagEvent, error)
}

// ErrVersionConflict is re-exported so handlers can map it to HTTP 409 without
// importing the repository package.
var ErrVersionConflict = repository.ErrVersionConflict

type flagService struct {
	repo   repository.FlagRepository
	rdb    *redis.Client
	broker *sse.Broker
}

func NewFlagService(repo repository.FlagRepository, rdb *redis.Client, broker *sse.Broker) FlagService {
	return &flagService{repo: repo, rdb: rdb, broker: broker}
}

var keyRegex = regexp.MustCompile(`^[a-zA-Z0-9-]+$`)

func (s *flagService) CreateFlag(ctx context.Context, req model.CreateFlagRequest) (*model.Flag, error) {
	if req.Key == "" || len(req.Key) > 64 {
		return nil, fmt.Errorf("key is required and must be at most 64 characters")
	}
	if !keyRegex.MatchString(req.Key) {
		return nil, fmt.Errorf("key must be alphanumeric with hyphens only")
	}
	if req.RolloutPercentage < 0 || req.RolloutPercentage > 100 {
		return nil, fmt.Errorf("rollout_percentage must be between 0 and 100")
	}

	existing, err := s.repo.GetByKey(ctx, req.Key)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, fmt.Errorf("duplicate_key")
	}

	users := req.TargetedUsers
	if users == nil {
		users = []string{}
	}

	flag := &model.Flag{
		Key:               req.Key,
		Description:       req.Description,
		Enabled:           req.Enabled,
		RolloutPercentage: req.RolloutPercentage,
		TargetedUsers:     users,
	}

	if err := s.repo.Create(ctx, flag); err != nil {
		return nil, err
	}

	s.publishFlagUpdate(ctx, flag, "created")
	return flag, nil
}

func (s *flagService) GetFlag(ctx context.Context, id string) (*model.Flag, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *flagService) ListFlags(ctx context.Context) ([]model.Flag, error) {
	return s.repo.List(ctx)
}

func (s *flagService) UpdateFlag(ctx context.Context, id string, req model.UpdateFlagRequest) (*model.Flag, error) {
	if req.RolloutPercentage != nil && (*req.RolloutPercentage < 0 || *req.RolloutPercentage > 100) {
		return nil, fmt.Errorf("rollout_percentage must be between 0 and 100")
	}

	flag, err := s.repo.Update(ctx, id, req)
	if err != nil {
		return nil, err // includes ErrVersionConflict
	}
	if flag == nil {
		return nil, nil
	}

	s.publishFlagUpdate(ctx, flag, "updated")
	return flag, nil
}

func (s *flagService) DeleteFlag(ctx context.Context, id string) error {
	flag, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if flag == nil {
		return fmt.Errorf("flag not found")
	}

	version, err := s.repo.Delete(ctx, id)
	if err != nil {
		return err
	}

	s.publishFlagDelete(ctx, flag.Key, version)
	return nil
}

func (s *flagService) ToggleFlag(ctx context.Context, id string) (*model.Flag, error) {
	updated, err := s.repo.Toggle(ctx, id)
	if err != nil {
		return nil, err
	}
	if updated == nil {
		return nil, nil
	}

	s.publishFlagUpdate(ctx, updated, "toggled")
	return updated, nil
}

func (s *flagService) GetAllFlagConfigs(ctx context.Context) ([]model.Flag, error) {
	return s.repo.List(ctx)
}

func (s *flagService) GetLatestVersion(ctx context.Context) (int64, error) {
	return s.repo.GetLatestVersion(ctx)
}

func (s *flagService) GetFlagHistory(ctx context.Context, id string, limit int) ([]model.FlagEvent, error) {
	flag, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if flag == nil {
		return nil, nil
	}
	return s.repo.ListEventsByFlag(ctx, flag.Key, limit)
}

func (s *flagService) GetEventsSince(ctx context.Context, since int64, limit int) ([]model.FlagEvent, error) {
	return s.repo.ListEventsSince(ctx, since, limit)
}

// publishFlagUpdate publishes a versioned envelope to Redis. It does NOT
// broadcast locally: this node's own subscriber consumes the envelope and fans
// it out, so every backend (publisher included) delivers via one uniform path.
// action is the mutation kind (created/updated/toggled) used for metrics and
// logs; the SSE wire event type stays "flag_updated" for backward compat.
func (s *flagService) publishFlagUpdate(ctx context.Context, flag *model.Flag, action string) {
	// Exemplar span: the admin-commit origin of the one traced propagation path.
	ctx, span := otel.Tracer("flag-service").Start(ctx, "flag.propagate")
	defer span.End()

	metrics.ObserveFlagUpdate(action)
	slog.Info("flag mutated",
		"action", action, "key", flag.Key, "version", flag.Version,
		"request_id", reqid.From(ctx))

	data, err := json.Marshal(flag.ToResponse())
	if err != nil {
		slog.Error("marshaling flag update", "err", err, "key", flag.Key)
		return
	}
	sse.Publish(ctx, s.rdb, "flag_updated", flag.Version, data)
}

func (s *flagService) publishFlagDelete(ctx context.Context, key string, version int64) {
	ctx, span := otel.Tracer("flag-service").Start(ctx, "flag.propagate")
	defer span.End()

	metrics.ObserveFlagUpdate("deleted")
	slog.Info("flag mutated",
		"action", "deleted", "key", key, "version", version,
		"request_id", reqid.From(ctx))

	data, err := json.Marshal(map[string]string{"key": key})
	if err != nil {
		slog.Error("marshaling flag delete", "err", err, "key", key)
		return
	}
	sse.Publish(ctx, s.rdb, "flag_deleted", version, data)
}
