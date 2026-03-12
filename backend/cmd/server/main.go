package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/feature-flag-system/backend/internal/config"
	"github.com/feature-flag-system/backend/internal/handler"
	"github.com/feature-flag-system/backend/internal/middleware"
	"github.com/feature-flag-system/backend/internal/repository"
	"github.com/feature-flag-system/backend/internal/service"
	"github.com/feature-flag-system/backend/internal/sse"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg := config.Load()

	// Connect to PostgreSQL
	pool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Run migration
	if err := runMigration(pool); err != nil {
		log.Fatalf("Failed to run migration: %v", err)
	}

	// Connect to Redis
	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("Failed to parse Redis URL: %v", err)
	}
	rdb := redis.NewClient(opt)
	defer rdb.Close()

	// SSE broker
	broker := sse.NewBroker()
	go broker.Run()

	// Service and handlers
	repo := repository.NewPostgresRepository(pool)
	svc := service.NewFlagService(repo, rdb, broker)
	adminHandler := handler.NewAdminHandler(svc)
	clientHandler := handler.NewClientHandler(svc, broker)

	// Router
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.CORS(cfg.AllowedOrigins))

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	// Admin routes
	r.Route("/api/admin", func(r chi.Router) {
		r.Use(middleware.AdminAuth(cfg.AdminAPIKey))
		r.Post("/flags", adminHandler.CreateFlag)
		r.Get("/flags", adminHandler.ListFlags)
		r.Get("/flags/{id}", adminHandler.GetFlag)
		r.Put("/flags/{id}", adminHandler.UpdateFlag)
		r.Delete("/flags/{id}", adminHandler.DeleteFlag)
		r.Patch("/flags/{id}/toggle", adminHandler.ToggleFlag)
	})

	// Client routes
	r.Route("/api/client", func(r chi.Router) {
		r.Use(middleware.SDKAuth(cfg.SDKAPIKey))
		r.Get("/flags", clientHandler.GetAllFlags)
		r.Get("/stream", clientHandler.StreamEvents)
	})

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Server starting on %s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func runMigration(pool *pgxpool.Pool) error {
	migration, err := os.ReadFile("migrations/001_create_flags.sql")
	if err != nil {
		log.Printf("Migration file not found, skipping: %v", err)
		return nil
	}
	_, err = pool.Exec(context.Background(), string(migration))
	return err
}
