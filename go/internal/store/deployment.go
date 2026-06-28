package store

import (
	"database/sql"
	"time"

	"github.com/SanthoshRaaj-KR/algolens/internal/fingerprint"
)

// Deployment is one saved probe run retrieved from the database.
type Deployment struct {
	ID              int64
	Endpoint        string
	Version         string
	Notes           string
	CreatedAt       time.Time
	Vector          fingerprint.Vector
	FittedCurveJSON string
	SweepResultJSON string
	HeadersJSON     string // JSON object of custom headers used during probe
	PayloadTemplate string // payload template used during probe (with {{n}})
	HTTPMethod      string // HTTP method used during probe
	Name            string // user-defined label, required for new saves
	Tag             string // optional short tag, e.g. "pre-launch"
	Mode            string // "stress" | "simulation" | "fingerprint"
	SessionLogs     string // JSONB — full agent conversation logs (simulation mode)
	Summary         string // JSONB — {success_count, fail_count, avg_turns, per_endpoint_avg_latency}
}

// SaveDeployment inserts a new row and returns its ID.
func SaveDeployment(db *sql.DB, endpoint, version, notes string, v fingerprint.Vector, fittedCurveJSON, sweepResultJSON, headersJSON, payloadTemplate, httpMethod, name, tag, mode, sessionLogsJSON, summaryJSON string) (int64, error) {
	var id int64
	err := db.QueryRow(`
		INSERT INTO deployments (
			endpoint, version, notes,
			complexity_class, complexity_exponent,
			memory_growth_rate, concurrency_cliff,
			breaking_point, read_write_ratio,
			fitted_curve, sweep_result,
			headers, payload_template, http_method,
			name, tag, mode, session_logs, summary
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
		RETURNING id`,
		endpoint, version, notes,
		v.ComplexityClass, v.ComplexityExponent,
		v.MemoryGrowthRate, v.ConcurrencyCliff,
		v.BreakingPoint, v.ReadWriteRatio,
		fittedCurveJSON, sweepResultJSON,
		headersJSON, payloadTemplate, httpMethod,
		name, tag, mode,
		nullableJSON(sessionLogsJSON), nullableJSON(summaryJSON),
	).Scan(&id)
	return id, err
}

// nullableJSON returns nil for empty strings so Postgres stores NULL instead of
// an empty string in JSONB columns (empty string is not valid JSONB).
func nullableJSON(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// GetDeployment fetches a single deployment by ID.
func GetDeployment(db *sql.DB, id int64) (Deployment, error) {
	row := db.QueryRow(`
		SELECT id, endpoint, version, notes, created_at,
		       complexity_class, complexity_exponent,
		       memory_growth_rate, concurrency_cliff,
		       breaking_point, read_write_ratio,
		       fitted_curve, sweep_result,
		       COALESCE(headers,''), COALESCE(payload_template,''), COALESCE(http_method,'GET'),
		       COALESCE(name,''), COALESCE(tag,''), COALESCE(mode,''),
		       COALESCE(session_logs::text,''), COALESCE(summary::text,'')
		FROM deployments WHERE id = $1`, id)
	return scanDeployment(row)
}

// ListDeployments returns all deployments, newest first.
// Pass an empty string to list all.
func ListDeployments(db *sql.DB, endpoint string) ([]Deployment, error) {
	var rows *sql.Rows
	var err error
	q := `SELECT id, endpoint, version, notes, created_at,
		complexity_class, complexity_exponent, memory_growth_rate,
		concurrency_cliff, breaking_point, read_write_ratio,
		fitted_curve, sweep_result,
		COALESCE(headers,''), COALESCE(payload_template,''), COALESCE(http_method,'GET'),
		COALESCE(name,''), COALESCE(tag,''), COALESCE(mode,''),
		COALESCE(session_logs::text,''), COALESCE(summary::text,'')
		FROM deployments`
	if endpoint == "" {
		rows, err = db.Query(q + ` ORDER BY created_at DESC, id DESC`)
	} else {
		rows, err = db.Query(q+` WHERE endpoint = $1 ORDER BY created_at DESC, id DESC`, endpoint)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Deployment
	for rows.Next() {
		d, err := scanDeployment(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

type scanner interface {
	Scan(dest ...any) error
}

func scanDeployment(s scanner) (Deployment, error) {
	var d Deployment
	var notes, fittedCurve, sweepResult sql.NullString
	err := s.Scan(
		&d.ID, &d.Endpoint, &d.Version, &notes, &d.CreatedAt,
		&d.Vector.ComplexityClass, &d.Vector.ComplexityExponent,
		&d.Vector.MemoryGrowthRate, &d.Vector.ConcurrencyCliff,
		&d.Vector.BreakingPoint, &d.Vector.ReadWriteRatio,
		&fittedCurve, &sweepResult,
		&d.HeadersJSON, &d.PayloadTemplate, &d.HTTPMethod,
		&d.Name, &d.Tag, &d.Mode,
		&d.SessionLogs, &d.Summary,
	)
	if err != nil {
		return Deployment{}, err
	}
	d.Notes = notes.String
	d.FittedCurveJSON = fittedCurve.String
	d.SweepResultJSON = sweepResult.String
	return d, nil
}
