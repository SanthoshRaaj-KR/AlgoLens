package probe

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func newFastClient() *http.Client { return &http.Client{Timeout: 2 * time.Second} }

func minimalCfg(url string) ProbeConfig {
	cfg := DefaultProbeConfig(url+"?n={{n}}", "GET")
	cfg.InputSizes = []int{1, 4, 16}
	cfg.ConcurrencyLevels = []int{1, 2, 4}
	cfg.WarmupRounds = 0
	cfg.SamplesPerStep = 3
	cfg.StepWarmup = 0
	cfg.TimeoutMS = 1000
	return cfg
}

// ── settle ────────────────────────────────────────────────────────────────

func TestSettle_MinFloor(t *testing.T) {
	start := time.Now()
	settle(0)
	if time.Since(start) < 280*time.Millisecond {
		t.Errorf("settle(0) slept less than 300ms")
	}
}

func TestSettle_Multiplier(t *testing.T) {
	start := time.Now()
	settle(200)
	if time.Since(start) < 550*time.Millisecond {
		t.Errorf("settle(200) slept less than 600ms")
	}
}

// ── warmup ────────────────────────────────────────────────────────────────

func TestWarmup_FiresWarmupRounds(t *testing.T) {
	var hits int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&hits, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := DefaultProbeConfig(srv.URL+"/api", "GET")
	cfg.WarmupRounds = 3
	warmup(cfg, newFastClient())

	if atomic.LoadInt64(&hits) != 3 {
		t.Errorf("expected 3 warmup hits, got %d", hits)
	}
}

func TestWarmup_ZeroRoundsNoRequests(t *testing.T) {
	var hits int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&hits, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := DefaultProbeConfig(srv.URL+"/api", "GET")
	cfg.WarmupRounds = 0
	warmup(cfg, newFastClient())

	if atomic.LoadInt64(&hits) != 0 {
		t.Errorf("expected 0 hits, got %d", hits)
	}
}

// ── stepWarmup ───────────────────────────────────────────────────────────

func TestStepWarmup_CorrectCount(t *testing.T) {
	var hits int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&hits, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := DefaultProbeConfig(srv.URL+"/api", "GET")
	cfg.StepWarmup = 2
	stepWarmup(cfg, 1, newFastClient())

	if atomic.LoadInt64(&hits) != 2 {
		t.Errorf("expected 2 step-warmup hits, got %d", hits)
	}
}

// ── runProbe ──────────────────────────────────────────────────────────────

func TestRunProbe_ReturnsProbePoint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := DefaultProbeConfig(srv.URL+"/api?n={{n}}", "GET")
	cfg.StepWarmup = 0
	pt, err := runProbe(cfg, 4, 2, 0, newFastClient())
	if err != nil {
		t.Fatalf("runProbe error: %v", err)
	}
	if pt.N != 4 || pt.Concurrency != 2 {
		t.Errorf("unexpected ProbePoint: n=%d c=%d", pt.N, pt.Concurrency)
	}
	if pt.P50 <= 0 {
		t.Errorf("P50 should be > 0, got %f", pt.P50)
	}
}

// ── SweepResult helpers ───────────────────────────────────────────────────

func makeSweepResult() SweepResult {
	cfg := DefaultProbeConfig("http://host/api?n={{n}}", "GET")
	return SweepResult{
		Config: cfg,
		Points: []ProbePoint{
			{N: 1, Concurrency: 1, P50: 2.0, P95: 3.0, P99: 4.0},
			{N: 1, Concurrency: 2, P50: 2.1, P95: 3.1, P99: 4.1},
			{N: 4, Concurrency: 1, P50: 5.0, P95: 6.0, P99: 7.0},
			{N: 4, Concurrency: 2, P50: 5.1, P95: 6.1, P99: 7.1},
		},
	}
}

func TestPointsForN(t *testing.T) {
	sr := makeSweepResult()
	pts := sr.PointsForN(1)
	if len(pts) != 2 {
		t.Errorf("PointsForN(1): got %d, want 2", len(pts))
	}
}

func TestPointsForConcurrency(t *testing.T) {
	sr := makeSweepResult()
	pts := sr.PointsForConcurrency(2)
	if len(pts) != 2 {
		t.Errorf("PointsForConcurrency(2): got %d, want 2", len(pts))
	}
}

func TestP50sAtConcurrency1(t *testing.T) {
	sr := makeSweepResult()
	p50s := sr.P50sAtConcurrency1()
	if len(p50s) != 2 || p50s[0] != 2.0 || p50s[1] != 5.0 {
		t.Errorf("P50sAtConcurrency1: got %v, want [2.0 5.0]", p50s)
	}
}

func TestEstimateDuration_Reasonable(t *testing.T) {
	cfg := DefaultProbeConfig("http://host/api", "GET")
	d := EstimateDuration(cfg, 0)
	if d < 5*time.Second || d > 5*time.Minute {
		t.Errorf("EstimateDuration = %v; not in reasonable range", d)
	}
}

// ── Sweep ─────────────────────────────────────────────────────────────────

func TestSweep_CorrectPointCount(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := minimalCfg(srv.URL)
	result, err := Sweep(cfg, newFastClient())
	if err != nil {
		t.Fatalf("Sweep error: %v", err)
	}
	want := len(cfg.InputSizes) * len(cfg.ConcurrencyLevels)
	if len(result.Points) != want {
		t.Errorf("got %d points, want %d", len(result.Points), want)
	}
}

func TestSweep_AllPairsPresent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := minimalCfg(srv.URL)
	result, _ := Sweep(cfg, newFastClient())

	seen := map[[2]int]int{}
	for _, pt := range result.Points {
		seen[[2]int{pt.N, pt.Concurrency}]++
	}
	for _, n := range cfg.InputSizes {
		for _, c := range cfg.ConcurrencyLevels {
			if seen[[2]int{n, c}] != 1 {
				t.Errorf("pair (n=%d,c=%d) appeared %d times, want 1", n, c, seen[[2]int{n, c}])
			}
		}
	}
}

func TestSweep_PercentileOrdering(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := minimalCfg(srv.URL)
	cfg.SamplesPerStep = 5
	result, err := Sweep(cfg, newFastClient())
	if err != nil {
		t.Fatalf("Sweep error: %v", err)
	}
	for _, pt := range result.Points {
		if pt.P50 > pt.P95 {
			t.Errorf("n=%d c=%d: P50 (%.2f) > P95 (%.2f)", pt.N, pt.Concurrency, pt.P50, pt.P95)
		}
		if pt.P95 > pt.P99 {
			t.Errorf("n=%d c=%d: P95 (%.2f) > P99 (%.2f)", pt.N, pt.Concurrency, pt.P95, pt.P99)
		}
	}
}

func TestSweep_StopsAtBreakingPoint(t *testing.T) {
	var calls int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt64(&calls, 1) > 6 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := minimalCfg(srv.URL)
	cfg.SamplesPerStep = 2
	result, err := Sweep(cfg, newFastClient())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Points) >= len(cfg.InputSizes)*len(cfg.ConcurrencyLevels) {
		t.Error("sweep should have stopped early at breaking point")
	}
}

func TestSweep_NSubstitutedInURL(t *testing.T) {
	var received []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received = append(received, r.URL.Query().Get("n"))
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := minimalCfg(srv.URL)
	cfg.ConcurrencyLevels = []int{1}
	Sweep(cfg, newFastClient())

	for _, v := range received {
		if v == "" {
			t.Error("request missing n= param")
		}
	}
}
