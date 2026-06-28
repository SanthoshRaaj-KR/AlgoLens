package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

type probeOnceRequest struct {
	Method    string            `json:"method"`
	URL       string            `json:"url"`
	Headers   map[string]string `json:"headers"`
	Body      string            `json:"body"`
	TimeoutMS int               `json:"timeout_ms"`
}

type probeOnceResponse struct {
	StatusCode int     `json:"status_code"`
	Body       string  `json:"body"`
	LatencyMS  float64 `json:"latency_ms"`
	Error      string  `json:"error"`
}

// apiProbeOnce fires exactly one HTTP request and returns the result.
// Called by the Python agent layer — not exposed to the internet.
func (h *handler) apiProbeOnce(w http.ResponseWriter, r *http.Request) {
	var req probeOnceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, probeOnceResponse{Error: "invalid JSON: " + err.Error()})
		return
	}
	if req.URL == "" {
		writeJSON(w, http.StatusBadRequest, probeOnceResponse{Error: "url is required"})
		return
	}

	method := req.Method
	if method == "" {
		method = http.MethodGet
	}
	timeoutMS := req.TimeoutMS
	if timeoutMS <= 0 {
		timeoutMS = 10000
	}

	client := &http.Client{Timeout: time.Duration(timeoutMS) * time.Millisecond}

	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = strings.NewReader(req.Body)
	}

	httpReq, err := http.NewRequest(method, req.URL, bodyReader)
	if err != nil {
		writeJSON(w, http.StatusOK, probeOnceResponse{Error: "bad request: " + err.Error()})
		return
	}

	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}
	if req.Body != "" && httpReq.Header.Get("Content-Type") == "" {
		httpReq.Header.Set("Content-Type", "application/json")
	}

	start := time.Now()
	resp, err := client.Do(httpReq)
	latencyMS := float64(time.Since(start).Microseconds()) / 1000.0

	if err != nil {
		writeJSON(w, http.StatusOK, probeOnceResponse{
			LatencyMS: latencyMS,
			Error:     err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	writeJSON(w, http.StatusOK, probeOnceResponse{
		StatusCode: resp.StatusCode,
		Body:       string(respBody),
		LatencyMS:  latencyMS,
	})
}
