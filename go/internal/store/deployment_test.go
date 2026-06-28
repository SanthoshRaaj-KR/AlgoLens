package store

import (
	"os"
	"testing"

	"github.com/SanthoshRaaj-KR/algolens/internal/fingerprint"
)

func openTestDB(t *testing.T) *DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set — skipping integration test")
	}
	db, err := Open(dsn)
	if err != nil {
		t.Fatalf("open DB: %v", err)
	}
	t.Cleanup(func() {
		db.Exec("TRUNCATE TABLE deployments RESTART IDENTITY")
		db.Close()
	})
	return db
}

func sampleVector() fingerprint.Vector {
	return fingerprint.Vector{
		ComplexityClass:    "O(n²)",
		ComplexityExponent: 2.0,
		MemoryGrowthRate:   0.12,
		ConcurrencyCliff:   8.0,
		BreakingPoint:      512.0,
		ReadWriteRatio:     0.5,
	}
}

func TestSaveAndGetDeployment(t *testing.T) {
	db := openTestDB(t)
	v := sampleVector()

	id, err := SaveDeployment(db.DB, "http://api.example.com/search", "v1.2.0", "baseline", v, `[[1,1.0]]`, `{}`, "", "", "GET", "baseline-run", "", "stress", "", "")
	if err != nil {
		t.Fatalf("SaveDeployment: %v", err)
	}
	if id <= 0 {
		t.Errorf("expected positive ID, got %d", id)
	}

	got, err := GetDeployment(db.DB, id)
	if err != nil {
		t.Fatalf("GetDeployment: %v", err)
	}

	if got.Endpoint != "http://api.example.com/search" {
		t.Errorf("Endpoint = %s", got.Endpoint)
	}
	if got.Version != "v1.2.0" {
		t.Errorf("Version = %s", got.Version)
	}
	if got.Vector.ComplexityClass != "O(n²)" {
		t.Errorf("ComplexityClass = %s", got.Vector.ComplexityClass)
	}
	if got.Vector.ComplexityExponent != 2.0 {
		t.Errorf("ComplexityExponent = %f", got.Vector.ComplexityExponent)
	}
	if got.Vector.ConcurrencyCliff != 8.0 {
		t.Errorf("ConcurrencyCliff = %f", got.Vector.ConcurrencyCliff)
	}
	if got.FittedCurveJSON != `[[1,1.0]]` {
		t.Errorf("FittedCurveJSON = %s", got.FittedCurveJSON)
	}
}

func TestListDeployments_FiltersByEndpoint(t *testing.T) {
	db := openTestDB(t)
	v := sampleVector()

	SaveDeployment(db.DB, "http://api/search", "v1", "", v, "", "", "", "", "", "run-1", "", "stress", "", "")
	SaveDeployment(db.DB, "http://api/search", "v2", "", v, "", "", "", "", "", "run-2", "", "stress", "", "")
	SaveDeployment(db.DB, "http://api/other", "v1", "", v, "", "", "", "", "", "run-3", "", "stress", "", "")

	list, err := ListDeployments(db.DB, "http://api/search")
	if err != nil {
		t.Fatalf("ListDeployments: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("expected 2 deployments for /search, got %d", len(list))
	}
	for _, d := range list {
		if d.Endpoint != "http://api/search" {
			t.Errorf("unexpected endpoint: %s", d.Endpoint)
		}
	}
}

func TestListDeployments_AllWhenEmpty(t *testing.T) {
	db := openTestDB(t)
	v := sampleVector()

	SaveDeployment(db.DB, "http://api/a", "v1", "", v, "", "", "", "", "", "run-a", "", "stress", "", "")
	SaveDeployment(db.DB, "http://api/b", "v1", "", v, "", "", "", "", "", "run-b", "", "stress", "", "")

	list, err := ListDeployments(db.DB, "")
	if err != nil {
		t.Fatalf("ListDeployments: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("expected 2 total deployments, got %d", len(list))
	}
}

func TestGetDeployment_NotFound(t *testing.T) {
	db := openTestDB(t)
	_, err := GetDeployment(db.DB, 9999)
	if err == nil {
		t.Error("expected error for missing ID")
	}
}
