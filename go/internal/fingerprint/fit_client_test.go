package fingerprint

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/SanthoshRaaj-KR/algolens/internal/probe"
)

func mockSidecar(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/fit" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		resp := FitResult{
			ComplexityClass: "O(n²)",
			Exponent:        2.0,
			Coefficient:     0.001,
			RSquared:        0.99,
			FittedCurve:     [][2]float64{{1, 1.0}, {4, 1.016}, {16, 1.256}},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
}

func sweepWith3Points() probe.SweepResult {
	cfg := probe.DefaultProbeConfig("http://host/api?n={{n}}", "GET")
	cfg.SamplesPerStep = 5
	return probe.SweepResult{
		Config: cfg,
		Points: []probe.ProbePoint{
			{N: 1, Concurrency: 1, P50: 1.0, P95: 1.5, P99: 2.0},
			{N: 4, Concurrency: 1, P50: 1.016, P95: 1.5, P99: 2.0},
			{N: 16, Concurrency: 1, P50: 1.256, P95: 2.0, P99: 3.0},
			{N: 1, Concurrency: 2, P50: 1.1, P95: 1.6, P99: 2.5},
			{N: 4, Concurrency: 2, P50: 1.2, P95: 1.7, P99: 2.8},
			{N: 16, Concurrency: 2, P50: 1.5, P95: 2.5, P99: 5.5}, // p99 > 2× c=1
		},
	}
}

func TestCallFit_ReturnsComplexityClass(t *testing.T) {
	srv := mockSidecar(t)
	defer srv.Close()

	sr := sweepWith3Points()
	fit, err := CallFit(srv.URL, &http.Client{}, sr)
	if err != nil {
		t.Fatalf("CallFit error: %v", err)
	}
	if fit.ComplexityClass != "O(n²)" {
		t.Errorf("expected O(n²), got %s", fit.ComplexityClass)
	}
	if fit.RSquared < 0.9 {
		t.Errorf("r_squared should be >= 0.9, got %f", fit.RSquared)
	}
}

func TestCallFit_ErrorOnTooFewPoints(t *testing.T) {
	srv := mockSidecar(t)
	defer srv.Close()

	sr := probe.SweepResult{
		Config: probe.DefaultProbeConfig("http://host", "GET"),
		Points: []probe.ProbePoint{
			{N: 1, Concurrency: 1, P50: 5.0},
		},
	}
	_, err := CallFit(srv.URL, &http.Client{}, sr)
	if err == nil {
		t.Error("expected error with only 1 probe point")
	}
}

func TestBuild_AssemblesVector(t *testing.T) {
	srv := mockSidecar(t)
	defer srv.Close()

	sr := sweepWith3Points()
	v, fit, err := Build(sr, srv.URL, &http.Client{})
	if err != nil {
		t.Fatalf("Build error: %v", err)
	}

	if v.ComplexityClass != "O(n²)" {
		t.Errorf("ComplexityClass = %s; want O(n²)", v.ComplexityClass)
	}
	if v.ComplexityExponent != 2.0 {
		t.Errorf("ComplexityExponent = %f; want 2.0", v.ComplexityExponent)
	}
	if v.ReadWriteRatio != 0.5 {
		t.Errorf("ReadWriteRatio = %f; want 0.5", v.ReadWriteRatio)
	}
	if v.MemoryGrowthRate < 0 || v.MemoryGrowthRate > 1 {
		t.Errorf("MemoryGrowthRate %f out of [0,1]", v.MemoryGrowthRate)
	}
	if fit.ComplexityClass == "" {
		t.Error("FitResult should be non-empty")
	}
}
