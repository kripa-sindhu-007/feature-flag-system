package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"regexp"

	"github.com/feature-flag-system/backend/internal/model"
	"github.com/feature-flag-system/backend/internal/repository"
	"github.com/feature-flag-system/backend/internal/sse"
	"github.com/redis/go-redis/v9"
)

type FlagService interface {
	CreateFlag(ctx context.Context, req model.CreateFlagRequest) (*model.Flag, error)
	GetFlag(ctx context.Context, id string) (*model.Flag, error)
	ListFlags(ctx context.Context) ([]model.Flag, error)
	UpdateFlag(ctx context.Context, id string, req model.UpdateFlagRequest) (*model.Flag, error)
	DeleteFlag(ctx context.Context, id string) error
	ToggleFlag(ctx context.Context, id string) (*model.Flag, error)
	GetAllFlagConfigs(ctx context.Context) ([]model.Flag, error)
}

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

	s.publishFlagUpdate(ctx, flag)
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
		return nil, err
	}
	if flag == nil {
		return nil, nil
	}

	s.publishFlagUpdate(ctx, flag)
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

	if err := s.repo.Delete(ctx, id); err != nil {
		return err
	}

	s.publishFlagDelete(ctx, flag.Key)
	return nil
}

func (s *flagService) ToggleFlag(ctx context.Context, id string) (*model.Flag, error) {
	flag, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if flag == nil {
		return nil, nil
	}

	newEnabled := !flag.Enabled
	updated, err := s.repo.Update(ctx, id, model.UpdateFlagRequest{Enabled: &newEnabled})
	if err != nil {
		return nil, err
	}

	s.publishFlagUpdate(ctx, updated)
	return updated, nil
}

func (s *flagService) GetAllFlagConfigs(ctx context.Context) ([]model.Flag, error) {
	return s.repo.List(ctx)
}

func (s *flagService) publishFlagUpdate(ctx context.Context, flag *model.Flag) {
	data, err := json.Marshal(map[string]interface{}{
		"id":                flag.ID,
		"key":               flag.Key,
		"description":       flag.Description,
		"enabled":           flag.Enabled,
		"rollout_percentage": flag.RolloutPercentage,
		"targeted_users":    flag.TargetedUsers,
	})
	if err != nil {
		log.Printf("Error marshaling flag update: %v", err)
		return
	}

	s.broker.Broadcast(sse.SSEEvent{Event: "flag_updated", Data: string(data)})

	if s.rdb != nil {
		s.rdb.Publish(ctx, "flag_updates", string(data))
	}
}

func (s *flagService) publishFlagDelete(ctx context.Context, key string) {
	data, err := json.Marshal(map[string]string{"key": key})
	if err != nil {
		log.Printf("Error marshaling flag delete: %v", err)
		return
	}

	s.broker.Broadcast(sse.SSEEvent{Event: "flag_deleted", Data: string(data)})

	if s.rdb != nil {
		s.rdb.Publish(ctx, "flag_updates", string(data))
	}
}
