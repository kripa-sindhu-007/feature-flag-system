package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/feature-flag-system/backend/internal/config"
	"github.com/feature-flag-system/backend/internal/handler"
	"github.com/feature-flag-system/backend/internal/metrics"
	"github.com/feature-flag-system/backend/internal/middleware"
	"github.com/feature-flag-system/backend/internal/migrate"
	"github.com/feature-flag-system/backend/internal/repository"
	"github.com/feature-flag-system/backend/internal/service"
	"github.com/feature-flag-system/backend/internal/sse"
	"github.com/feature-flag-system/backend/internal/tracing"
	"github.com/feature-flag-system/backend/migrations"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

func main() {
	// Structured JSON logging is the app default from the first line.
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	cfg := config.Load()

	// Signal-driven root context: cancelled on SIGINT/SIGTERM to start drain.
	rootCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Connect to PostgreSQL
	pool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "err", err)
		os.Exit(1)
	}

	// Run migrations (ordered, run-once, idempotent)
	if err := migrate.Run(context.Background(), pool, migrations.FS); err != nil {
		slog.Error("failed to run migrations", "err", err)
		os.Exit(1)
	}

	// Connect to Redis
	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		slog.Error("failed to parse redis url", "err", err)
		os.Exit(1)
	}
	rdb := redis.NewClient(opt)

	// Tracing (no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set).
	traceShutdown, err := tracing.Init(context.Background(), cfg.OTLPEndpoint, cfg.NodeID)
	if err != nil {
		slog.Error("failed to init tracing", "err", err)
		os.Exit(1)
	}

	// SSE broker
	broker := sse.NewBroker()
	broker.SetIdleTimeout(cfg.SSEIdleTimeout)
	go broker.Run()

	// Redis subscriber: consume flag_events published by ANY backend and fan
	// them out to this node's local SSE clients. Its own context so shutdown can
	// stop it after HTTP drains.
	subCtx, stopSub := context.WithCancel(context.Background())
	go sse.Subscribe(subCtx, rdb, broker)

	// Service and handlers
	repo := repository.NewPostgresRepository(pool)
	svc := service.NewFlagService(repo, rdb, broker)
	adminHandler := handler.NewAdminHandler(svc)
	clientHandler := handler.NewClientHandler(svc, broker, cfg.NodeID)
	healthHandler := handler.NewHealthHandler(cfg.NodeID, pool, rdb, svc)

	// Router
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.CORS(cfg.AllowedOrigins))

	// Liveness / readiness. /health kept as a liveness alias for back-compat.
	r.Get("/healthz", healthHandler.Healthz)
	r.Get("/health", healthHandler.Healthz)
	r.Get("/readyz", healthHandler.Readyz)

	// Prometheus metrics (not behind auth).
	r.Handle("/metrics", metrics.Handler())

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
	srv := &http.Server{Addr: addr, Handler: r}

	// Serve in the background so main can wait on the shutdown signal.
	serveErr := make(chan error, 1)
	go func() {
		slog.Info("server starting", "node_id", cfg.NodeID, "addr", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
	}()

	// Wait for either a fatal serve error or a shutdown signal.
	select {
	case err := <-serveErr:
		slog.Error("server failed", "err", err)
		stopSub()
		broker.Shutdown()
		pool.Close()
		rdb.Close()
		os.Exit(1)
	case <-rootCtx.Done():
		slog.Info("shutdown signal received, draining")
	}

	// Graceful shutdown. srv.Shutdown() waits for active handlers to return, but
	// the streaming SSE handlers only return once the broker closes their
	// channels — so the broker MUST be drained concurrently, not after, or
	// Shutdown parks until the timeout (heartbeats keep the streams "active")
	// and SSE clients get cut by deadline instead of drained. Stop the
	// subscriber first (no new events race in), then drain the broker in
	// parallel with the HTTP shutdown so the streams finish and Shutdown returns
	// promptly. srv.Shutdown closes the listeners at its start, so no new SSE
	// connection can register after this point.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	stopSub()
	go broker.Shutdown()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("http shutdown", "err", err)
	}

	if traceShutdown != nil {
		tctx, tcancel := context.WithTimeout(context.Background(), 5*time.Second)
		_ = traceShutdown(tctx)
		tcancel()
	}

	pool.Close()
	rdb.Close()
	slog.Info("shutdown complete")
}
