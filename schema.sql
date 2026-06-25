-- AlgoLens SQLite schema
-- Applied automatically by store.Open() on first run.
-- This file is the human-readable reference copy.

CREATE TABLE IF NOT EXISTS deployments (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint             TEXT    NOT NULL,
    version              TEXT    NOT NULL,
    notes                TEXT,
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Fingerprint vector components
    complexity_class     TEXT,           -- e.g. "O(n²)"
    complexity_exponent  REAL,           -- 0.0=O(1), 0.5=O(log n), 1.0=O(n), 1.5=O(n log n), 2.0=O(n²)
    memory_growth_rate   REAL,
    concurrency_cliff    REAL,           -- req/s where p99 spikes
    breaking_point       REAL,           -- input size where p99 > threshold
    read_write_ratio     REAL,           -- 0.0=write-heavy, 1.0=read-heavy

    -- Raw data blobs (JSON)
    fitted_curve         TEXT,           -- [[n, latency_ms], ...]
    sweep_result         TEXT            -- full sweep matrix JSON
);
