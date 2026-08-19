-- Week 1 — configuration versioning.
-- Adds a global monotonic version, a per-flag version, and a durable event log.

-- Global monotonic configuration version counter. Every committed write bumps it.
CREATE SEQUENCE IF NOT EXISTS config_version_seq AS BIGINT START WITH 1 INCREMENT BY 1;

-- Per-flag version = the config_version at which this flag last changed.
-- Powers optimistic concurrency (WHERE version = $expected). Existing rows start at 0.
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;

-- Append-only, ordered event log — the reconciliation backbone (transactional outbox).
-- version is the PK, so it is unique + ordered for "/events?since=V" replay (Week 2).
CREATE TABLE IF NOT EXISTS flag_events (
    version    BIGINT PRIMARY KEY,
    event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'deleted')),
    flag_key   TEXT NOT NULL,
    payload    JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-flag history lookups (the Week 1 history drawer) + ordered replay by key.
CREATE INDEX IF NOT EXISTS idx_flag_events_flag_key ON flag_events (flag_key, version);
