package store

import (
	"database/sql"
	"time"

	_ "github.com/lib/pq"
)

// DB wraps sql.DB so callers can use db.Close() and pass db.DB to store funcs.
type DB struct{ *sql.DB }

// Open connects to a Postgres database using the given DSN and runs migrations.
// Pool tuning: max 20 open, 5 idle, 5-minute lifetime — sensible defaults for
// a single-node deploy without PgBouncer.
func Open(dsn string) (*DB, error) {
	raw, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	raw.SetMaxOpenConns(20)
	raw.SetMaxIdleConns(5)
	raw.SetConnMaxLifetime(5 * time.Minute)
	raw.SetConnMaxIdleTime(2 * time.Minute)
	if err := raw.Ping(); err != nil {
		raw.Close()
		return nil, err
	}
	if err := migrate(raw); err != nil {
		raw.Close()
		return nil, err
	}
	return &DB{raw}, nil
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS deployments (
			id                   BIGSERIAL PRIMARY KEY,
			endpoint             TEXT    NOT NULL,
			version              TEXT    NOT NULL,
			notes                TEXT,
			created_at           TIMESTAMPTZ DEFAULT NOW(),
			complexity_class     TEXT,
			complexity_exponent  DOUBLE PRECISION,
			memory_growth_rate   DOUBLE PRECISION,
			concurrency_cliff    DOUBLE PRECISION,
			breaking_point       DOUBLE PRECISION,
			read_write_ratio     DOUBLE PRECISION,
			fitted_curve         TEXT,
			sweep_result         TEXT,
			headers              TEXT,
			payload_template     TEXT,
			http_method          TEXT
		);
		ALTER TABLE deployments ADD COLUMN IF NOT EXISTS headers          TEXT;
		ALTER TABLE deployments ADD COLUMN IF NOT EXISTS payload_template TEXT;
		ALTER TABLE deployments ADD COLUMN IF NOT EXISTS http_method      TEXT;
		ALTER TABLE deployments ADD COLUMN IF NOT EXISTS name             TEXT;
		ALTER TABLE deployments ADD COLUMN IF NOT EXISTS tag              TEXT;
		ALTER TABLE deployments ADD COLUMN IF NOT EXISTS mode             TEXT;
		ALTER TABLE deployments ADD COLUMN IF NOT EXISTS session_logs     JSONB;
		ALTER TABLE deployments ADD COLUMN IF NOT EXISTS summary          JSONB;
	`)
	return err
}
