package fingerprint

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/SanthoshRaaj-KR/algolens/internal/probe"
)

type fitRequest struct {
	NValues   []float64 `json:"n_values"`
	Latencies []float64 `json:"latencies"`
}

// FitResult holds the response from the Python /fit endpoint.
type FitResult struct {
	ComplexityClass string      `json:"complexity_class"`
	Exponent        float64     `json:"exponent"`
	Coefficient     float64     `json:"coefficient"`
	RSquared        float64     `json:"r_squared"`
	FittedCurve     [][2]float64 `json:"fitted_curve"`
}

// CallFit posts p50 latencies at concurrency=1 to the Python sidecar and
// returns the curve-fitting result.
func CallFit(sidecarURL string, client *http.Client, sr probe.SweepResult) (FitResult, error) {
	pts := sr.PointsForConcurrency(1)
	if len(pts) < 2 {
		return FitResult{}, fmt.Errorf("need at least 2 probe points at concurrency=1, got %d", len(pts))
	}

	nValues := make([]float64, len(pts))
	latencies := make([]float64, len(pts))
	for i, pt := range pts {
		nValues[i] = float64(pt.N)
		latencies[i] = pt.P50
	}

	body, err := json.Marshal(fitRequest{NValues: nValues, Latencies: latencies})
	if err != nil {
		return FitResult{}, err
	}

	resp, err := client.Post(sidecarURL+"/fit", "application/json", bytes.NewReader(body))
	if err != nil {
		return FitResult{}, fmt.Errorf("sidecar /fit: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return FitResult{}, fmt.Errorf("sidecar /fit returned %d", resp.StatusCode)
	}

	var result FitResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return FitResult{}, fmt.Errorf("decode /fit response: %w", err)
	}
	return result, nil
}

// Build assembles a complete FingerprintVector from a sweep result and the
// Python sidecar's curve-fit output. This is the single entry point for
// Phase 5 — call it after Sweep() completes.
func Build(sr probe.SweepResult, sidecarURL string, client *http.Client) (Vector, FitResult, error) {
	fit, err := CallFit(sidecarURL, client, sr)
	if err != nil {
		return Vector{}, FitResult{}, err
	}

	v := Vector{
		ComplexityClass:    fit.ComplexityClass,
		ComplexityExponent: fit.Exponent,
		MemoryGrowthRate:   MemoryGrowthRate(sr),
		ConcurrencyCliff:   ConcurrencyCliff(sr),
		BreakingPoint:      BreakingPointN(sr),
		ReadWriteRatio:     0.5, // placeholder
	}
	return v, fit, nil
}
