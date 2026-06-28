package api

import (
	"encoding/json"
	"testing"

	"github.com/SanthoshRaaj-KR/algolens/internal/store"
)

func TestBuildSimDiff_BothSimulation(t *testing.T) {
	sumA := deploymentSummary{
		SuccessCount: 4, FailCount: 1,
		AvgTurns: 3.0, AvgLatencyMS: 120.0,
		PerEndpointAvgLatency: map[string]float64{
			"POST /auth/login": 45.0,
			"POST /search":     75.0,
		},
	}
	sumB := deploymentSummary{
		SuccessCount: 3, FailCount: 2,
		AvgTurns: 5.0, AvgLatencyMS: 320.0,
		PerEndpointAvgLatency: map[string]float64{
			"POST /auth/login": 50.0,
			"POST /search":     270.0,
		},
	}
	sumAJSON, _ := json.Marshal(sumA)
	sumBJSON, _ := json.Marshal(sumB)

	da := store.Deployment{Mode: "simulation", Summary: string(sumAJSON)}
	db := store.Deployment{Mode: "simulation", Summary: string(sumBJSON)}

	sd := buildSimDiff(da, db)
	if sd == nil {
		t.Fatal("expected non-nil simDiff for two simulation deployments")
	}

	// Success rate: A=4/5=0.8, B=3/5=0.6, delta=-0.2
	if sd.SuccessRateDelta >= 0 {
		t.Errorf("expected negative success rate delta, got %f", sd.SuccessRateDelta)
	}

	// Avg turns: B.AvgTurns (5) > A.AvgTurns (3)
	if sd.AvgTurnsDelta <= 0 {
		t.Errorf("expected positive avg turns delta, got %f", sd.AvgTurnsDelta)
	}

	// Worst regression should be POST /search (delta=+195ms)
	if len(sd.EndpointDeltas) == 0 {
		t.Fatal("expected endpoint deltas")
	}
	worst := sd.EndpointDeltas[0]
	if worst.Endpoint != "POST /search" {
		t.Errorf("expected POST /search as worst, got %s", worst.Endpoint)
	}
	if worst.Delta < 190 {
		t.Errorf("expected ~195ms delta for POST /search, got %f", worst.Delta)
	}

	// Summary should mention regressions
	if len(sd.Summary) == 0 {
		t.Error("expected non-empty summary")
	}
}

func TestBuildSimDiff_NotSimulation(t *testing.T) {
	da := store.Deployment{Mode: "stress"}
	db := store.Deployment{Mode: "simulation"}
	if buildSimDiff(da, db) != nil {
		t.Error("expected nil simDiff when modes differ")
	}

	da2 := store.Deployment{Mode: "fingerprint"}
	db2 := store.Deployment{Mode: "fingerprint"}
	if buildSimDiff(da2, db2) != nil {
		t.Error("expected nil simDiff for fingerprint mode")
	}
}

func TestParseSummary_Empty(t *testing.T) {
	s, err := parseSummary("")
	if err != nil {
		t.Errorf("empty summary should not error: %v", err)
	}
	if s.SuccessCount != 0 {
		t.Error("empty summary should give zero struct")
	}
}

func TestComputeEndpointDeltas_SortedByAbsDelta(t *testing.T) {
	a := map[string]float64{"GET /pets": 50.0, "POST /pets": 100.0}
	b := map[string]float64{"GET /pets": 55.0, "POST /pets": 300.0}
	deltas := computeEndpointDeltas(a, b)
	if len(deltas) != 2 {
		t.Fatalf("expected 2 deltas, got %d", len(deltas))
	}
	if deltas[0].Endpoint != "POST /pets" {
		t.Errorf("expected POST /pets first (largest delta), got %s", deltas[0].Endpoint)
	}
}
