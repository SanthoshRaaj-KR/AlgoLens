package store

import (
	"database/sql"
	"time"

	"github.com/SanthoshRaaj-KR/algolens/internal/fingerprint"
)

// Deployment is one saved probe run retrieved from SQLite.
type Deployment struct {
	ID              int64
	Endpoint        string
	Version         string
	Notes           string
	CreatedAt       time.Time
	Vector          fingerprint.Vector
	FittedCurveJSON string // raw JSON blob
	SweepResultJSON string // raw JSON blob
}

// SaveDeployment inserts a new row and returns its auto-increment ID.
// Never called automatically — only on explicit user action.
func SaveDeployment(db *sql.DB, endpoint, version, notes string, v fingerprint.Vector, fittedCurveJSON, sweepResultJSON string) (int64, error) {
	res, err := db.Exec(`
		INSERT INTO deployments (
			endpoint, version, notes,
			complexity_class, complexity_exponent,
			memory_growth_rate, concurrency_cliff,
			breaking_point, read_write_ratio,
			fitted_curve, sweep_result
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		endpoint, version, notes,
		v.ComplexityClass, v.ComplexityExponent,
		v.MemoryGrowthRate, v.ConcurrencyCliff,
		v.BreakingPoint, v.ReadWriteRatio,
		fittedCurveJSON, sweepResultJSON,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// GetDeployment fetches a single deployment by ID.
func GetDeployment(db *sql.DB, id int64) (Deployment, error) {
	row := db.QueryRow(`
		SELECT id, endpoint, version, notes, created_at,
		       complexity_class, complexity_exponent,
		       memory_growth_rate, concurrency_cliff,
		       breaking_point, read_write_ratio,
		       fitted_curve, sweep_result
		FROM deployments WHERE id = ?`, id)
	return scanDeployment(row)
}

// ListDeployments returns all deployments for a given endpoint, newest first.
// Pass an empty string to list all deployments.
func ListDeployments(db *sql.DB, endpoint string) ([]Deployment, error) {
	var rows *sql.Rows
	var err error
	if endpoint == "" {
		rows, err = db.Query(`SELECT id, endpoint, version, notes, created_at,
			complexity_class, complexity_exponent, memory_growth_rate,
			concurrency_cliff, breaking_point, read_write_ratio,
			fitted_curve, sweep_result
			FROM deployments ORDER BY created_at DESC, id DESC`)
	} else {
		rows, err = db.Query(`SELECT id, endpoint, version, notes, created_at,
			complexity_class, complexity_exponent, memory_growth_rate,
			concurrency_cliff, breaking_point, read_write_ratio,
			fitted_curve, sweep_result
			FROM deployments WHERE endpoint = ? ORDER BY created_at DESC, id DESC`, endpoint)
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
	var createdAt string
	var notes, fittedCurve, sweepResult sql.NullString
	err := s.Scan(
		&d.ID, &d.Endpoint, &d.Version, &notes, &createdAt,
		&d.Vector.ComplexityClass, &d.Vector.ComplexityExponent,
		&d.Vector.MemoryGrowthRate, &d.Vector.ConcurrencyCliff,
		&d.Vector.BreakingPoint, &d.Vector.ReadWriteRatio,
		&fittedCurve, &sweepResult,
	)
	if err != nil {
		return Deployment{}, err
	}
	d.Notes = notes.String
	d.FittedCurveJSON = fittedCurve.String
	d.SweepResultJSON = sweepResult.String
	d.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	return d, nil
}
