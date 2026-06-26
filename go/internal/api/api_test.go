package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/SanthoshRaaj-KR/algolens/internal/fingerprint"
	"github.com/SanthoshRaaj-KR/algolens/internal/store"
	_ "modernc.org/sqlite"
)

// ── test helpers ─────────────────────────────────────────────────────────

func openMemDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db.DB
}

func newTestRouter(t *testing.T, sidecarURL string) http.Handler {
	t.Helper()
	return NewRouter(openMemDB(t), sidecarURL)
}

func postJSON(t *testing.T, router http.Handler, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	return rr
}

func getPath(t *testing.T, router http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	return rr
}

func sampleVector() fingerprint.Vector {
	return fingerprint.Vector{
		ComplexityClass:    "O(n²)",
		ComplexityExponent: 2.0,
		MemoryGrowthRate:   0.1,
		ConcurrencyCliff:   8.0,
		BreakingPoint:      512.0,
		ReadWriteRatio:     0.5,
	}
}

// ── GET /health ───────────────────────────────────────────────────────────

func TestHealth(t *testing.T) {
	rr := getPath(t, newTestRouter(t, ""), "/health")
	if rr.Code != http.StatusOK {
		t.Errorf("health: got %d, want 200", rr.Code)
	}
}

// ── POST /api/deployments ────────────────────────────────────────────────

func TestSaveDeployment(t *testing.T) {
	router := newTestRouter(t, "")
	body := saveDeploymentRequest{
		Endpoint:          "http://api/search",
		Version:           "v1.0",
		Notes:             "baseline",
		FingerprintVector: sampleVector(),
	}
	rr := postJSON(t, router, "/api/deployments", body)
	if rr.Code != http.StatusCreated {
		t.Errorf("save: got %d want 201 — body: %s", rr.Code, rr.Body.String())
	}
	var resp map[string]int64
	json.NewDecoder(rr.Body).Decode(&resp)
	if resp["id"] <= 0 {
		t.Errorf("expected positive id, got %v", resp["id"])
	}
}

func TestSaveDeployment_MissingFields(t *testing.T) {
	router := newTestRouter(t, "")
	rr := postJSON(t, router, "/api/deployments", map[string]string{"endpoint": ""})
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing fields, got %d", rr.Code)
	}
}

// ── GET /api/deployments ──────────────────────────────────────────────────

func TestListDeployments(t *testing.T) {
	db := openMemDB(t)
	v := sampleVector()
	store.SaveDeployment(db, "http://api/search", "v1", "", v, "", "")
	store.SaveDeployment(db, "http://api/search", "v2", "", v, "", "")
	store.SaveDeployment(db, "http://api/other", "v1", "", v, "", "")

	router := NewRouter(db, "")

	rr := getPath(t, router, "/api/deployments?endpoint=http://api/search")
	if rr.Code != http.StatusOK {
		t.Errorf("list: got %d", rr.Code)
	}
	var list []store.Deployment
	json.NewDecoder(rr.Body).Decode(&list)
	if len(list) != 2 {
		t.Errorf("expected 2 deployments, got %d", len(list))
	}
}

// ── GET /api/deployments/{id} ─────────────────────────────────────────────

func TestGetDeployment(t *testing.T) {
	db := openMemDB(t)
	v := sampleVector()
	id, _ := store.SaveDeployment(db, "http://api/search", "v1", "note", v, "", "")

	router := NewRouter(db, "")
	rr := getPath(t, router, "/api/deployments/"+string(rune('0'+int(id))))

	// id=1, so path is /api/deployments/1
	rr2 := getPath(t, router, "/api/deployments/1")
	if rr2.Code != http.StatusOK {
		t.Errorf("get: got %d — %s", rr2.Code, rr2.Body.String())
	}
	_ = rr
	var d store.Deployment
	json.NewDecoder(rr2.Body).Decode(&d)
	if d.Version != "v1" {
		t.Errorf("Version = %s", d.Version)
	}
}

func TestGetDeployment_NotFound(t *testing.T) {
	router := newTestRouter(t, "")
	rr := getPath(t, router, "/api/deployments/9999")
	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}

// ── GET /api/diff ─────────────────────────────────────────────────────────

func TestDiff_ComplexityRegression(t *testing.T) {
	db := openMemDB(t)
	v1 := fingerprint.Vector{ComplexityClass: "O(n)", ComplexityExponent: 1.0, ConcurrencyCliff: 16, BreakingPoint: 1024, ReadWriteRatio: 0.5}
	v2 := fingerprint.Vector{ComplexityClass: "O(n²)", ComplexityExponent: 2.0, ConcurrencyCliff: 8, BreakingPoint: 512, ReadWriteRatio: 0.5}
	store.SaveDeployment(db, "http://api/search", "v1", "", v1, "", "")
	store.SaveDeployment(db, "http://api/search", "v2", "", v2, "", "")

	router := NewRouter(db, "")
	rr := getPath(t, router, "/api/diff?a=1&b=2")
	if rr.Code != http.StatusOK {
		t.Errorf("diff: got %d — %s", rr.Code, rr.Body.String())
	}

	var resp diffResponse
	json.NewDecoder(rr.Body).Decode(&resp)
	if len(resp.Summary) == 0 {
		t.Error("expected non-empty summary")
	}
	found := false
	for _, s := range resp.Summary {
		if len(s) > 0 {
			found = true
		}
	}
	if !found {
		t.Error("summary should contain at least one message")
	}
}

// ── GET /api/timeline ─────────────────────────────────────────────────────

func TestTimeline_ChronologicalOrder(t *testing.T) {
	db := openMemDB(t)
	v := sampleVector()
	store.SaveDeployment(db, "http://api/search", "v1", "", v, "", "")
	store.SaveDeployment(db, "http://api/search", "v2", "", v, "", "")
	store.SaveDeployment(db, "http://api/search", "v3", "", v, "", "")

	router := NewRouter(db, "")
	rr := getPath(t, router, "/api/timeline?endpoint=http://api/search")
	if rr.Code != http.StatusOK {
		t.Errorf("timeline: got %d", rr.Code)
	}
	var list []store.Deployment
	json.NewDecoder(rr.Body).Decode(&list)
	if len(list) != 3 {
		t.Errorf("expected 3, got %d", len(list))
	}
	// Oldest first (chronological) — IDs should be ascending
	if list[0].ID > list[1].ID || list[1].ID > list[2].ID {
		t.Errorf("timeline not in chronological order: IDs %d %d %d", list[0].ID, list[1].ID, list[2].ID)
	}
}

func TestTimeline_MissingEndpoint(t *testing.T) {
	router := newTestRouter(t, "")
	rr := getPath(t, router, "/api/timeline")
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing endpoint, got %d", rr.Code)
	}
}

// ── buildSummary (unit test, no HTTP) ────────────────────────────────────

func TestBuildSummary_Regression(t *testing.T) {
	a := fingerprint.Vector{ComplexityClass: "O(n)", ComplexityExponent: 1.0, ConcurrencyCliff: 16, BreakingPoint: 1024}
	b := fingerprint.Vector{ComplexityClass: "O(n²)", ComplexityExponent: 2.0, ConcurrencyCliff: 8, BreakingPoint: 512}
	summary := buildSummary(a, b)
	if len(summary) < 2 {
		t.Errorf("expected >=2 summary lines for 3 regressions, got %d: %v", len(summary), summary)
	}
}

func TestBuildSummary_NoRegression(t *testing.T) {
	v := sampleVector()
	summary := buildSummary(v, v)
	if len(summary) != 1 || summary[0] != "No significant regressions detected." {
		t.Errorf("identical vectors should report no regressions, got: %v", summary)
	}
}
