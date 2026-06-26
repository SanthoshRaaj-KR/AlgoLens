package probe

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestWarmup_FiresWarmupRounds(t *testing.T) {
	var hits int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&hits, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := DefaultProbeConfig(srv.URL+"/api", "GET")
	cfg.WarmupRounds = 3

	Warmup(cfg, newTestClient())

	// Each warmup round calls ProbeStep with concurrency=1 and SamplesPerStep requests
	// but ProbeStep itself fires concurrency (1) requests — so we expect exactly 3 hits
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

	Warmup(cfg, newTestClient())

	if atomic.LoadInt64(&hits) != 0 {
		t.Errorf("expected 0 hits for WarmupRounds=0, got %d", hits)
	}
}
