package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProbeOnce_Success(t *testing.T) {
	// Stand up a tiny target server
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"hello":"world"}`))
	}))
	defer target.Close()

	h := &handler{}

	body := `{"method":"GET","url":"` + target.URL + `","timeout_ms":2000}`
	req := httptest.NewRequest(http.MethodPost, "/internal/probe-once", strings.NewReader(body))
	w := httptest.NewRecorder()

	h.apiProbeOnce(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp probeOnceResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode failed: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status_code 200, got %d", resp.StatusCode)
	}
	if resp.Error != "" {
		t.Errorf("unexpected error: %s", resp.Error)
	}
	if resp.LatencyMS <= 0 {
		t.Errorf("expected positive latency, got %f", resp.LatencyMS)
	}
	if !strings.Contains(resp.Body, "hello") {
		t.Errorf("unexpected body: %s", resp.Body)
	}
}

func TestProbeOnce_NetworkError(t *testing.T) {
	h := &handler{}

	body := `{"method":"GET","url":"http://127.0.0.1:19999","timeout_ms":500}`
	req := httptest.NewRequest(http.MethodPost, "/internal/probe-once", strings.NewReader(body))
	w := httptest.NewRecorder()

	h.apiProbeOnce(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 envelope even on error, got %d", w.Code)
	}

	var resp probeOnceResponse
	json.NewDecoder(w.Body).Decode(&resp)

	if resp.StatusCode != 0 {
		t.Errorf("expected status_code 0 on network error, got %d", resp.StatusCode)
	}
	if resp.Error == "" {
		t.Error("expected error string, got empty")
	}
}

func TestProbeOnce_MissingURL(t *testing.T) {
	h := &handler{}

	req := httptest.NewRequest(http.MethodPost, "/internal/probe-once", strings.NewReader(`{}`))
	w := httptest.NewRecorder()

	h.apiProbeOnce(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing URL, got %d", w.Code)
	}
}
