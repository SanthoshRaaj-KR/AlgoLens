-- AlgoLens PostgreSQL schema (reference copy)
-- The authoritative migration runs in go/internal/store/store.go via store.Open().
-- This file is kept in sync for documentation and manual inspection only.

CREATE TABLE IF NOT EXISTS deployments (
    id                   BIGSERIAL PRIMARY KEY,
    endpoint             TEXT    NOT NULL,
    version              TEXT    NOT NULL,
    notes                TEXT,
    created_at           TIMESTAMPTZ DEFAULT NOW(),

    -- Fingerprint vector components
    complexity_class     TEXT,           -- e.g. "O(n²)"
    complexity_exponent  DOUBLE PRECISION,  -- 0=O(1), 0.5=O(log n), 1=O(n), 2=O(n²)
    memory_growth_rate   DOUBLE PRECISION,
    concurrency_cliff    DOUBLE PRECISION,  -- req/s where p99 spikes
    breaking_point       DOUBLE PRECISION,  -- input size where p99 > threshold
    read_write_ratio     DOUBLE PRECISION,  -- 0=write-heavy, 1=read-heavy

    -- Raw data blobs (JSON text)
    fitted_curve         TEXT,           -- [[n, latency_ms], ...]
    sweep_result         TEXT,           -- full sweep matrix JSON

    -- Request config stored alongside fingerprint
    headers              TEXT,           -- JSON object of custom headers
    payload_template     TEXT,           -- payload template (with {{n}})
    http_method          TEXT,           -- HTTP method used during probe

    -- Run metadata (Phase 2)
    name                 TEXT,           -- user-defined label (required for new saves)
    tag                  TEXT,           -- optional short tag, e.g. "pre-launch"
    mode                 TEXT,           -- "stress" | "simulation" | "fingerprint"

    -- Simulation mode data (Phase 6)
    session_logs         JSONB,          -- [{session_id, persona, success, turns, total_latency_ms}]
    summary              JSONB           -- {success_count, fail_count, avg_turns, avg_latency_ms, per_endpoint_avg_latency}
);
