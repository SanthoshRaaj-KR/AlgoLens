package probe

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func newTestClient() *http.Client {
	return &http.Client{Timeout: 5 * time.Second}
}

func TestProbeStep_GET(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	cfg := DefaultProbeConfig(srv.URL+"/api?size={{n}}", "GET")

	pt, err := ProbeStep(cfg, 8, 1, newTestClient())
	if err != nil {
		t.Fatalf("ProbeStep error: %v", err)
	}

	if pt.N != 8 {
		t.Errorf("N = %d; want 8", pt.N)
	}
	if pt.Concurrency != 1 {
		t.Errorf("Concurrency = %d; want 1", pt.Concurrency)
	}
	if pt.P50 <= 0 {
		t.Errorf("P50 should be > 0, got %f", pt.P50)
	}
	if pt.P95 < pt.P50 {
		t.Errorf("P95 (%f) should be >= P50 (%f)", pt.P95, pt.P50)
	}
	if pt.P99 < pt.P95 {
		t.Errorf("P99 (%f) should be >= P95 (%f)", pt.P99, pt.P95)
	}
	if pt.Errors != 0 {
		t.Errorf("expected 0 errors, got %d", pt.Errors)
	}
}

func TestProbeStep_POST(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("expected Content-Type application/json")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := DefaultProbeConfig(srv.URL+"/api", "POST")
	cfg.PayloadTemplate = `{"limit":{{n}}}`

	pt, err := ProbeStep(cfg, 16, 2, newTestClient())
	if err != nil {
		t.Fatalf("ProbeStep error: %v", err)
	}
	if pt.Concurrency != 2 {
		t.Errorf("Concurrency = %d; want 2", pt.Concurrency)
	}
}

func TestProbeStep_AllErrorsReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	cfg := DefaultProbeConfig(srv.URL+"/api", "GET")
	_, err := ProbeStep(cfg, 1, 1, newTestClient())
	if err == nil {
		t.Error("expected error when all requests return 500, got nil")
	}
}

func TestProbeStep_ErrorsCountedNotInHistogram(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		// First request fails, rest succeed
		if calls == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := DefaultProbeConfig(srv.URL+"/api", "GET")

	// concurrency=4: 1 will fail, 3 will succeed
	pt, err := ProbeStep(cfg, 1, 4, newTestClient())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pt.Errors != 1 {
		t.Errorf("expected 1 error, got %d", pt.Errors)
	}
	if pt.P50 <= 0 {
		t.Errorf("P50 should be > 0 despite 1 error")
	}
}
