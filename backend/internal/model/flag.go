package model

import (
	"encoding/json"
	"time"
)

type Flag struct {
	ID                string    `json:"id" db:"id"`
	Key               string    `json:"key" db:"key"`
	Description       string    `json:"description" db:"description"`
	Enabled           bool      `json:"enabled" db:"enabled"`
	RolloutPercentage int       `json:"rollout_percentage" db:"rollout_percentage"`
	TargetedUsers     []string  `json:"targeted_users" db:"targeted_users"`
	Version           int64     `json:"version" db:"version"`
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time `json:"updated_at" db:"updated_at"`
}

type CreateFlagRequest struct {
	Key               string   `json:"key"`
	Description       string   `json:"description"`
	Enabled           bool     `json:"enabled"`
	RolloutPercentage int      `json:"rollout_percentage"`
	TargetedUsers     []string `json:"targeted_users"`
}

type UpdateFlagRequest struct {
	Description       *string  `json:"description,omitempty"`
	Enabled           *bool    `json:"enabled,omitempty"`
	RolloutPercentage *int     `json:"rollout_percentage,omitempty"`
	TargetedUsers     []string `json:"targeted_users,omitempty"`
	// ExpectedVersion enables optimistic concurrency: when set, the write only
	// applies if the flag's current version matches, else ErrVersionConflict.
	ExpectedVersion *int64 `json:"-"`
}

type FlagResponse struct {
	ID                string   `json:"id"`
	Key               string   `json:"key"`
	Description       string   `json:"description"`
	Enabled           bool     `json:"enabled"`
	RolloutPercentage int      `json:"rollout_percentage"`
	TargetedUsers     []string `json:"targeted_users"`
	Version           int64    `json:"version"`
	CreatedAt         string   `json:"created_at"`
	UpdatedAt         string   `json:"updated_at"`
}

// FlagEvent is one append-only entry in the durable event log.
type FlagEvent struct {
	Version   int64           `json:"version"`
	EventType string          `json:"event_type"`
	FlagKey   string          `json:"flag_key"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt time.Time       `json:"created_at"`
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

func (f *Flag) ToResponse() FlagResponse {
	users := f.TargetedUsers
	if users == nil {
		users = []string{}
	}
	return FlagResponse{
		ID:                f.ID,
		Key:               f.Key,
		Description:       f.Description,
		Enabled:           f.Enabled,
		RolloutPercentage: f.RolloutPercentage,
		TargetedUsers:     users,
		Version:           f.Version,
		CreatedAt:         f.CreatedAt.Format(time.RFC3339),
		UpdatedAt:         f.UpdatedAt.Format(time.RFC3339),
	}
}
