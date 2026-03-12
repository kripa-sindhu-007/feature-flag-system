# Feature Flag System

A developer platform for managing feature flags — enable or disable features dynamically without redeployment. Supports percentage-based rollouts, targeted user access, and real-time updates via SSE.

## Architecture

```
┌──────────────┐       SSE        ┌──────────────────┐
│  Demo App    │◄────────────────►│                  │
│  (Next.js)   │                  │  Feature Flag    │
├──────────────┤   REST API       │  Service (Go)    │
│  Admin       │◄────────────────►│                  │
│  Dashboard   │                  │  :8080           │
└──────────────┘                  └────────┬─────────┘
    :3000                                  │
                                   ┌───────┴───────┐
                                   │               │
                              ┌────▼───┐     ┌─────▼────┐
                              │PostgreSQL│    │  Redis   │
                              │  :5432  │     │  :6379   │
                              └─────────┘     └──────────┘
```

**Backend** — Go 1.22 with Chi router, PostgreSQL for storage, Redis for pub/sub, SSE for real-time streaming.

**Frontend** — Next.js 16, React 19, TailwindCSS, shadcn/ui, Framer Motion, React Query.

**Client SDK** — JavaScript SDK that fetches flag config, caches locally, evaluates rules client-side, and syncs via SSE.

## Features

- **Flag Management** — Create, update, delete, and toggle feature flags via admin dashboard
- **Percentage Rollout** — Gradual rollout using deterministic FNV-1a hashing (same user always gets the same result)
- **Targeted Users** — Enable features for specific user IDs regardless of rollout percentage
- **Real-time Updates** — Server-Sent Events push flag changes to all connected clients instantly
- **Client SDK** — Local flag evaluation without network calls after initial fetch
- **Demo App** — Switch between 10 simulated users to see rollout behavior in action

## Quick Start

### Docker (Recommended)

```bash
docker-compose up --build
```

This starts all four services:

| Service    | URL                    |
|------------|------------------------|
| Frontend   | http://localhost:3000   |
| Backend    | http://localhost:8080   |
| PostgreSQL | localhost:5432          |
| Redis      | localhost:6379          |

### Manual Setup

#### Backend

```bash
cd backend

# Set environment variables
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/featureflags?sslmode=disable"
export REDIS_URL="localhost:6379"
export ADMIN_API_KEY="admin-secret-key"
export SDK_API_KEY="sdk-secret-key"

go run cmd/server/main.go
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

## API Reference

### Admin Endpoints

All admin endpoints require `X-Admin-API-Key` header.

| Method   | Endpoint                        | Description          |
|----------|---------------------------------|----------------------|
| `POST`   | `/api/admin/flags`              | Create a flag        |
| `GET`    | `/api/admin/flags`              | List all flags       |
| `GET`    | `/api/admin/flags/{id}`         | Get flag by ID       |
| `PUT`    | `/api/admin/flags/{id}`         | Update a flag        |
| `DELETE` | `/api/admin/flags/{id}`         | Delete a flag        |
| `PATCH`  | `/api/admin/flags/{id}/toggle`  | Toggle flag on/off   |

### Client Endpoints

Client endpoints require `X-SDK-Key` header (or `key` query param for SSE).

| Method | Endpoint               | Description                  |
|--------|------------------------|------------------------------|
| `GET`  | `/api/client/flags`    | Fetch all flag configs       |
| `GET`  | `/api/client/stream`   | SSE stream for live updates  |

### Health Check

| Method | Endpoint   | Description    |
|--------|------------|----------------|
| `GET`  | `/health`  | Returns `"ok"` |

## Flag Evaluation Logic

The SDK evaluates flags in this order:

1. **Global check** — If the flag is disabled, return `false`
2. **Targeted users** — If the user ID is in the targeted list, return `true`
3. **Percentage rollout** — Hash `flagKey:userId` with FNV-1a, return `hash % 100 < rollout_percentage`

## Data Model

```
Flag
├── id                  UUID (auto-generated)
├── key                 String (unique, alphanumeric + hyphens, max 64 chars)
├── description         String
├── enabled             Boolean
├── rollout_percentage  Integer (0–100)
├── targeted_users      String[]
├── created_at          Timestamp
└── updated_at          Timestamp
```

## Environment Variables

| Variable                     | Default              | Description                  |
|------------------------------|----------------------|------------------------------|
| `PORT`                       | `8080`               | Backend server port          |
| `DATABASE_URL`               | —                    | PostgreSQL connection string |
| `REDIS_URL`                  | —                    | Redis connection string      |
| `ADMIN_API_KEY`              | `admin-secret-key`   | Admin API authentication     |
| `SDK_API_KEY`                | `sdk-secret-key`     | Client SDK authentication    |
| `NEXT_PUBLIC_API_URL`        | `http://localhost:8080` | Backend URL for frontend  |
| `NEXT_PUBLIC_ADMIN_API_KEY`  | `admin-secret-key`   | Admin key used by frontend   |
| `NEXT_PUBLIC_SDK_KEY`        | `sdk-secret-key`     | SDK key used by demo app     |

## Tech Stack

| Component  | Technology                                          |
|------------|-----------------------------------------------------|
| Backend    | Go 1.22, Chi, pgx, go-redis                         |
| Frontend   | Next.js 16, React 19, TypeScript, TailwindCSS v4    |
| UI         | shadcn/ui, Framer Motion, Lucide icons               |
| Database   | PostgreSQL 16                                        |
| Cache      | Redis 7                                              |
| Deployment | Docker, Docker Compose                               |

## Project Structure

```
├── backend/
│   ├── cmd/server/          # Entry point
│   ├── internal/
│   │   ├── config/          # Environment config
│   │   ├── handler/         # HTTP handlers (admin + client)
│   │   ├── hash/            # FNV-1a rollout hashing
│   │   ├── middleware/      # Auth, CORS, logging
│   │   ├── model/           # Data types
│   │   ├── repository/      # PostgreSQL queries
│   │   ├── service/         # Business logic
│   │   └── sse/             # SSE broker
│   └── migrations/          # SQL migrations
├── frontend/
│   ├── app/                 # Next.js pages
│   ├── components/          # React components
│   │   ├── demo/            # Demo feature components
│   │   ├── flags/           # Flag management components
│   │   ├── layout/          # Header, Sidebar
│   │   └── ui/              # shadcn/ui primitives
│   ├── hooks/               # React Query hooks + SSE
│   ├── lib/                 # API client, SSE connection
│   ├── sdk/                 # Feature flag client SDK
│   └── types/               # TypeScript types
└── docker-compose.yml
```
