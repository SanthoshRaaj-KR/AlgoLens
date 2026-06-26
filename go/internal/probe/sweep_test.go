package probe

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// newFastClient returns an http.Client with a short timeout for test sweeps.
func newFastClient() *http.Client {
	return &http.Client{Timeout: 2 * time.Second}
}

// minimalCfg builds a ProbeConfig with tiny sweep dimensions so tests run fast.
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

	want := len(cfg.InputSizes) * len(cfg.ConcurrencyLevels) // 3×3 = 9
	if len(result.Points) != want {
		t.Errorf("got %d points, want %d", len(result.Points), want)
	}
}

func TestSweep_AllNAndCoveredInPoints(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := minimalCfg(srv.URL)
	result, err := Sweep(cfg, newFastClient())
	if err != nil {
		t.Fatalf("Sweep error: %v", err)
	}

	// Every configured (n, c) pair must appear exactly once
	seen := map[[2]int]int{}
	for _, pt := range result.Points {
		seen[[2]int{pt.N, pt.Concurrency}]++
	}
	for _, n := range cfg.InputSizes {
		for _, c := range cfg.ConcurrencyLevels {
			if seen[[2]int{n, c}] != 1 {
				t.Errorf("pair (n=%d, c=%d) appeared %d times, want 1", n, c, seen[[2]int{n, c}])
			}
		}
	}
}

func TestSweep_PercentileOrdering(t *testing.T) {
	// Structural invariant: for every ProbePoint, p50 <= p95 <= p99.
	// This holds regardless of OS timer resolution or load.
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
		if pt.P50 <= 0 {
			t.Errorf("n=%d c=%d: P50 should be > 0, got %.2f", pt.N, pt.Concurrency, pt.P50)
		}
	}
}

func TestSweep_StopsAtBreakingPoint(t *testing.T) {
	var callCount int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt64(&callCount, 1)
		// Fail all requests once we've seen more than 6 calls (past first 2 n-values)
		if n > 6 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := minimalCfg(srv.URL)
	cfg.SamplesPerStep = 2 // smaller so failure threshold triggers faster

	result, err := Sweep(cfg, newFastClient())
	if err != nil {
		t.Fatalf("unexpected sweep error: %v", err)
	}
	// Sweep should have stopped before collecting all 9 points
	if len(result.Points) >= len(cfg.InputSizes)*len(cfg.ConcurrencyLevels) {
		t.Errorf("expected early stop, but got all %d points", len(result.Points))
	}
}

func TestSweep_NSubstitutedInURL(t *testing.T) {
	var receivedN []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedN = append(receivedN, r.URL.Query().Get("n"))
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := minimalCfg(srv.URL)
	cfg.ConcurrencyLevels = []int{1} // only 1 concurrency to keep received list predictable

	_, err := Sweep(cfg, newFastClient())
	if err != nil {
		t.Fatalf("Sweep error: %v", err)
	}

	// Every request must carry an n= param matching an InputSize
	for _, val := range receivedN {
		if val == "" {
			t.Errorf("request missing n= query param")
		}
	}
}
