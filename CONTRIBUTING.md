# Contributing to FlagPlane

Thanks for your interest in improving FlagPlane! This project is a self-hosted
feature-flag platform built for correctness, scale, and clarity — contributions
that preserve those qualities are very welcome.

Please also read our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Ways to contribute

- **Report a bug** — open an issue with the [bug report](.github/ISSUE_TEMPLATE/bug_report.yml) template.
- **Request a feature** — open an issue with the [feature request](.github/ISSUE_TEMPLATE/feature_request.yml) template.
- **Improve docs** — READMEs, the docs in [`docs/`](docs), or inline comments.
- **Submit code** — pick up an open issue (look for `good first issue`) or propose a change.

For anything non-trivial, please open an issue to discuss the approach before you
start — it saves everyone time.

---

## Development setup

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- Go 1.22+ and Node.js 20+ (for running tests and the frontend outside Docker)

### Run the full stack

```bash
git clone https://github.com/kripa-sindhu-007/feature-flag-system.git
cd feature-flag-system
docker compose up --build
```

Dashboard: http://localhost:3000 · API (nginx LB): http://localhost:8080. See the
[README](README.md#getting-started) for the full service map.

> **After a frontend change, `:3000` is a built image** — rebuild it with
> `docker compose up -d --build frontend` (or `--build` for everything). For rapid
> frontend iteration, run a dev server instead:
> `cd frontend && NEXT_PUBLIC_NODE_URLS="http://localhost:8081,http://localhost:8082,http://localhost:8083" npm run dev`.

---

## Before you open a pull request

CI runs the same checks below on every PR — run them locally first so your PR is green.

### Backend (Go)

```bash
cd backend
gofmt -l .            # must print nothing (formatting)
go vet ./...
go build ./...
go test -race ./...   # DB/Redis tests need the env vars below
```

Some tests exercise a real Postgres and Redis. Point them at a running instance
(the compose stack works):

```bash
export TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/featureflags_test?sslmode=disable"
export REDIS_TEST_URL="redis://localhost:6379"
```

### Frontend (Next.js)

```bash
cd frontend
npm ci
npm run lint          # ESLint — includes strict react-hooks rules
npm test              # vitest (includes SDK ↔ evaluator parity tests)
npm run build         # production build must succeed
```

> **Run `npm run lint`, not just `npm run build`.** The lint config enforces
> stricter `react-hooks` rules (e.g. no impure calls or `setState` in render/effects)
> that a bare build won't catch.

---

## Coding guidelines

- **Match the surrounding style.** Read the neighboring code first; keep naming,
  structure, and comment density consistent.
- **Do not change the FNV-1a rollout hashing.** Evaluation parity across the Go
  server, the TypeScript SDK, and the Go SDK is a core invariant, pinned by a shared
  golden vector and parity tests. Changing it breaks correctness silently.
- **Keep the UI honest.** The dashboard never displays mocked data — every number
  and animation must reflect the real running system.
- **Every capability ships with a test.** New backend behavior gets Go tests; new
  evaluation logic gets parity tests; UI changes are verified in a real browser.
- **Update the docs** when behavior changes — the README, the relevant file in
  [`docs/`](docs), and `frontend/design-system/MASTER.md` for UI work.

---

## Pull request process

1. **Branch** off `main` with a descriptive name (e.g. `feat/webhook-notifications`,
   `fix/sse-reconnect-gap`, `docs/api-reference`).
2. **Make focused commits** with clear messages. Conventional-style prefixes are
   appreciated (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
3. **Run the checks above** and make sure they pass.
4. **Open a PR** using the template. Describe what changed and why, link the issue it
   closes (`Closes #123`), and include screenshots for any UI change.
5. **CI must be green** and at least one maintainer review is required before merge.
   The maintainer merges once approved.

Small, reviewable PRs merge faster than large ones — when in doubt, split it up.

---

## Reporting security issues

Please do **not** open a public issue for a security vulnerability. Follow the
process in [SECURITY.md](SECURITY.md).

---

Thank you for helping make FlagPlane better! 🚩
