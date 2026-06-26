package store

import (
	"database/sql"
	_ "modernc.org/sqlite"
)

// DB wraps sql.DB so callers can use db.Close() and pass db.DB to store funcs.
type DB struct{ *sql.DB }

// Open opens (or creates) the SQLite database and runs migrations.
func Open(path string) (*DB, error) {
	raw, err := sql.Open("sqlite", path+"?_journal_mode=WAL")
	if err != nil {
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
			id                   INTEGER PRIMARY KEY AUTOINCREMENT,
			endpoint             TEXT    NOT NULL,
			version              TEXT    NOT NULL,
			notes                TEXT,
			created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
			complexity_class     TEXT,
			complexity_exponent  REAL,
			memory_growth_rate   REAL,
			concurrency_cliff    REAL,
			breaking_point       REAL,
			read_write_ratio     REAL,
			fitted_curve         TEXT,   -- JSON: [[n, latency_ms], ...]
			sweep_result         TEXT    -- JSON: full sweep data
		);
	`)
	return err
}
