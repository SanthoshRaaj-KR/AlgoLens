package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/SanthoshRaaj-KR/algolens/internal/fingerprint"
	"github.com/SanthoshRaaj-KR/algolens/internal/store"
)

// ── GET /api/diff?a=:id&b=:id ─────────────────────────────────────────────

type fieldDelta struct {
	Field     string  `json:"field"`
	A         float64 `json:"a"`
	B         float64 `json:"b"`
	Delta     float64 `json:"delta"`      // b - a
	Direction string  `json:"direction"`  // "up" | "down" | "same"
}

type diffResponse struct {
	DeploymentA store.Deployment `json:"deployment_a"`
	DeploymentB store.Deployment `json:"deployment_b"`
	Deltas      []fieldDelta     `json:"deltas"`
	Summary     []string         `json:"summary"` // plain-English sentences
}

func (h *handler) apiDiff(w http.ResponseWriter, r *http.Request) {
	aID, err := strconv.ParseInt(r.URL.Query().Get("a"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid a")
		return
	}
	bID, err := strconv.ParseInt(r.URL.Query().Get("b"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid b")
		return
	}

	da, err := store.GetDeployment(h.db, aID)
	if err != nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("deployment %d not found", aID))
		return
	}
	db, err := store.GetDeployment(h.db, bID)
	if err != nil {
		writeError(w, http.StatusNotFound, fmt.Sprintf("deployment %d not found", bID))
		return
	}

	deltas := buildDeltas(da.Vector, db.Vector)
	summary := buildSummary(da.Vector, db.Vector)

	writeJSON(w, http.StatusOK, diffResponse{
		DeploymentA: da,
		DeploymentB: db,
		Deltas:      deltas,
		Summary:     summary,
	})
}

func buildDeltas(a, b fingerprint.Vector) []fieldDelta {
	type entry struct {
		name string
		av   float64
		bv   float64
	}
	fields := []entry{
		{"complexity_exponent", a.ComplexityExponent, b.ComplexityExponent},
		{"memory_growth_rate", a.MemoryGrowthRate, b.MemoryGrowthRate},
		{"concurrency_cliff", a.ConcurrencyCliff, b.ConcurrencyCliff},
		{"breaking_point", a.BreakingPoint, b.BreakingPoint},
		{"read_write_ratio", a.ReadWriteRatio, b.ReadWriteRatio},
	}

	dir := func(d float64) string {
		if math.Abs(d) < 1e-9 {
			return "same"
		}
		if d > 0 {
			return "up"
		}
		return "down"
	}

	out := make([]fieldDelta, len(fields))
	for i, f := range fields {
		d := f.bv - f.av
		out[i] = fieldDelta{Field: f.name, A: f.av, B: f.bv, Delta: d, Direction: dir(d)}
	}
	return out
}

func buildSummary(a, b fingerprint.Vector) []string {
	var lines []string

	if a.ComplexityClass != b.ComplexityClass {
		if b.ComplexityExponent > a.ComplexityExponent {
			lines = append(lines, fmt.Sprintf(
				"Complexity degraded from %s to %s — algorithm is now less scalable.",
				a.ComplexityClass, b.ComplexityClass))
		} else {
			lines = append(lines, fmt.Sprintf(
				"Complexity improved from %s to %s.",
				a.ComplexityClass, b.ComplexityClass))
		}
	}

	if a.ConcurrencyCliff > 0 && b.ConcurrencyCliff > 0 {
		drop := (a.ConcurrencyCliff - b.ConcurrencyCliff) / a.ConcurrencyCliff
		if drop > 0.20 {
			lines = append(lines, fmt.Sprintf(
				"Concurrency ceiling dropped by %.0f%% (from %g to %g concurrent requests).",
				drop*100, a.ConcurrencyCliff, b.ConcurrencyCliff))
		} else if drop < -0.20 {
			lines = append(lines, fmt.Sprintf(
				"Concurrency ceiling improved by %.0f%% (from %g to %g concurrent requests).",
				-drop*100, a.ConcurrencyCliff, b.ConcurrencyCliff))
		}
	}

	if a.BreakingPoint > 0 && b.BreakingPoint > 0 && b.BreakingPoint < a.BreakingPoint {
		lines = append(lines, fmt.Sprintf(
			"Breaking point fell from n=%.0f to n=%.0f — endpoint handles less load before failing.",
			a.BreakingPoint, b.BreakingPoint))
	}

	if len(lines) == 0 {
		lines = append(lines, "No significant regressions detected.")
	}
	return lines
}

// ── GET /api/timeline?endpoint=:url ──────────────────────────────────────

func (h *handler) apiTimeline(w http.ResponseWriter, r *http.Request) {
	endpoint := r.URL.Query().Get("endpoint")
	if endpoint == "" {
		writeError(w, http.StatusBadRequest, "endpoint query param required")
		return
	}
	list, err := store.ListDeployments(h.db, endpoint)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// ListDeployments returns newest-first; reverse for chronological order
	for i, j := 0, len(list)-1; i < j; i, j = i+1, j-1 {
		list[i], list[j] = list[j], list[i]
	}
	if list == nil {
		list = []store.Deployment{}
	}
	writeJSON(w, http.StatusOK, list)
}

// ── POST /api/search ──────────────────────────────────────────────────────

type searchRequest struct {
	FingerprintVector fingerprint.Vector `json:"fingerprint_vector"`
}

type similarityResult struct {
	store.Deployment
	Score float64 `json:"score"`
}

type simPayload struct {
	QueryVector    []float64   `json:"query_vector"`
	StoredVectors  [][]float64 `json:"stored_vectors"`
}

type simResult struct {
	Index int     `json:"index"`
	Score float64 `json:"score"`
}

func (h *handler) apiSearch(w http.ResponseWriter, r *http.Request) {
	var req searchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}

	all, err := store.ListDeployments(h.db, "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(all) == 0 {
		writeJSON(w, http.StatusOK, []similarityResult{})
		return
	}

	stored := make([][]float64, len(all))
	for i, d := range all {
		stored[i] = vectorToSlice(d.Vector)
	}

	payload := simPayload{
		QueryVector:   vectorToSlice(req.FingerprintVector),
		StoredVectors: stored,
	}
	body, _ := json.Marshal(payload)

	resp, err := http.Post(h.sidecarURL+"/similarity", "application/json", bytes.NewReader(body))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "sidecar /similarity: "+err.Error())
		return
	}
	defer resp.Body.Close()

	var simResults []simResult
	if err := json.NewDecoder(resp.Body).Decode(&simResults); err != nil {
		writeError(w, http.StatusInternalServerError, "decode similarity response: "+err.Error())
		return
	}

	out := make([]similarityResult, 0, len(simResults))
	for _, sr := range simResults {
		out = append(out, similarityResult{
			Deployment: all[sr.Index],
			Score:      sr.Score,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

func vectorToSlice(v fingerprint.Vector) []float64 {
	return []float64{
		v.ComplexityExponent,
		v.MemoryGrowthRate,
		v.ConcurrencyCliff,
		v.BreakingPoint,
		v.ReadWriteRatio,
	}
}

// plainEnglishList joins items as a comma-separated string.
func plainEnglishList(items []string) string {
	return strings.Join(items, " ")
}
