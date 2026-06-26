package probe

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestSettle_MinFloor(t *testing.T) {
	// prevP99=0 → should sleep minSettleMS (300ms)
	start := time.Now()
	settle(0)
	elapsed := time.Since(start)
	if elapsed < 280*time.Millisecond {
		t.Errorf("settle(0) slept %v; want >= 300ms", elapsed)
	}
}

func TestSettle_Multiplier(t *testing.T) {
	// prevP99=200ms → 3×200=600ms > 300ms floor
	start := time.Now()
	settle(200)
	elapsed := time.Since(start)
	if elapsed < 550*time.Millisecond {
		t.Errorf("settle(200) slept %v; want >= 600ms", elapsed)
	}
}

func TestRunProbe_ReturnsProbePoint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := DefaultProbeConfig(srv.URL+"/api?n={{n}}", "GET")
	cfg.StepWarmup = 0 // skip step warmup to keep test fast

	// prevP99=0 → 300ms settle; acceptable in a test
	pt, err := RunProbe(cfg, 4, 2, 0, newTestClient())
	if err != nil {
		t.Fatalf("RunProbe error: %v", err)
	}
	if pt.N != 4 || pt.Concurrency != 2 {
		t.Errorf("unexpected ProbePoint: n=%d concurrency=%d", pt.N, pt.Concurrency)
	}
	if pt.P50 <= 0 {
		t.Errorf("P50 should be > 0, got %f", pt.P50)
	}
}

func TestStepWarmup_CorrectCount(t *testing.T) {
	var hits int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&hits, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := DefaultProbeConfig(srv.URL+"/api", "GET")
	cfg.StepWarmup = 2

	stepWarmup(cfg, 1, newTestClient())

	if atomic.LoadInt64(&hits) != 2 {
		t.Errorf("expected 2 step-warmup hits, got %d", hits)
	}
}
