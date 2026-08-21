package main

import (
	"context"
	"fmt"
	"log"
	"net/http"

	"github.com/feature-flag-system/backend/internal/config"
	"github.com/feature-flag-system/backend/internal/handler"
	"github.com/feature-flag-system/backend/internal/middleware"
	"github.com/feature-flag-system/backend/internal/migrate"
	"github.com/feature-flag-system/backend/internal/repository"
	"github.com/feature-flag-system/backend/internal/service"
	"github.com/feature-flag-system/backend/internal/sse"
	"github.com/feature-flag-system/backend/migrations"
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

	// Run migrations (ordered, run-once, idempotent)
	if err := migrate.Run(context.Background(), pool, migrations.FS); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
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

	// Redis subscriber: consume flag_events published by ANY backend and fan
	// them out to this node's local SSE clients. This is what makes propagation
	// cross-instance — a write on one replica reaches clients on all of them.
	go sse.Subscribe(context.Background(), rdb, broker)

	// Service and handlers
	repo := repository.NewPostgresRepository(pool)
	svc := service.NewFlagService(repo, rdb, broker)
	adminHandler := handler.NewAdminHandler(svc)
	clientHandler := handler.NewClientHandler(svc, broker, cfg.NodeID)

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
		r.Get("/flags/{id}/events", adminHandler.GetFlagHistory)
		r.Put("/flags/{id}", adminHandler.UpdateFlag)
		r.Delete("/flags/{id}", adminHandler.DeleteFlag)
		r.Patch("/flags/{id}/toggle", adminHandler.ToggleFlag)
	})

	// Client routes
	r.Route("/api/client", func(r chi.Router) {
		r.Use(middleware.SDKAuth(cfg.SDKAPIKey))
		r.Get("/flags", clientHandler.GetAllFlags)
		r.Get("/stream", clientHandler.StreamEvents)
		r.Get("/events", clientHandler.Reconcile)
		r.Get("/version", clientHandler.Version)
	})

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Server [%s] starting on %s", cfg.NodeID, addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
