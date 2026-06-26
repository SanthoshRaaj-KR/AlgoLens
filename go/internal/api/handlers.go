package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/SanthoshRaaj-KR/algolens/internal/fingerprint"
	"github.com/SanthoshRaaj-KR/algolens/internal/probe"
	"github.com/SanthoshRaaj-KR/algolens/internal/store"
)

// writeJSON serialises v as JSON and writes it with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// writeError writes a JSON error envelope.
func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// ── POST /api/probe ───────────────────────────────────────────────────────

type probeRequest struct {
	Endpoint          string  `json:"endpoint"`
	Method            string  `json:"method"`
	PayloadTemplate   string  `json:"payload_template"`
	InputSizes        []int   `json:"input_sizes"`
	ConcurrencyLevels []int   `json:"concurrency_levels"`
	WarmupRounds      int     `json:"warmup_rounds"`
	SamplesPerStep    int     `json:"samples_per_step"`
	TimeoutMS         int     `json:"timeout_ms"`
}

type probeResponse struct {
	SweepPoints       []probe.ProbePoint    `json:"sweep_points"`
	FingerprintVector fingerprint.Vector    `json:"fingerprint_vector"`
	FitResult         fingerprint.FitResult `json:"fit_result"`
	EstimatedDuration string               `json:"estimated_duration"`
}

func (h *handler) apiProbe(w http.ResponseWriter, r *http.Request) {
	var req probeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if req.Endpoint == "" {
		writeError(w, http.StatusBadRequest, "endpoint is required")
		return
	}

	method := req.Method
	if method == "" {
		method = http.MethodGet
	}

	cfg := probe.DefaultProbeConfig(req.Endpoint, method)
	cfg.PayloadTemplate = req.PayloadTemplate
	if len(req.InputSizes) > 0 {
		cfg.InputSizes = req.InputSizes
	}
	if len(req.ConcurrencyLevels) > 0 {
		cfg.ConcurrencyLevels = req.ConcurrencyLevels
	}
	if req.WarmupRounds > 0 {
		cfg.WarmupRounds = req.WarmupRounds
	}
	if req.SamplesPerStep > 0 {
		cfg.SamplesPerStep = req.SamplesPerStep
	}
	if req.TimeoutMS > 0 {
		cfg.TimeoutMS = req.TimeoutMS
	}

	client := &http.Client{Timeout: time.Duration(cfg.TimeoutMS+500) * time.Millisecond}

	est := probe.EstimateDuration(cfg, 0)

	sr, err := probe.Sweep(cfg, client)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "sweep failed: "+err.Error())
		return
	}

	v, fit, err := fingerprint.Build(sr, h.sidecarURL, client)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "fingerprint build failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, probeResponse{
		SweepPoints:       sr.Points,
		FingerprintVector: v,
		FitResult:         fit,
		EstimatedDuration: est.Round(time.Second).String(),
	})
}

// ── POST /api/deployments ─────────────────────────────────────────────────

type saveDeploymentRequest struct {
	Endpoint          string             `json:"endpoint"`
	Version           string             `json:"version"`
	Notes             string             `json:"notes"`
	FingerprintVector fingerprint.Vector `json:"fingerprint_vector"`
	FittedCurveJSON   string             `json:"fitted_curve"`
	SweepResultJSON   string             `json:"sweep_result"`
}

func (h *handler) apiSaveDeployment(w http.ResponseWriter, r *http.Request) {
	var req saveDeploymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if req.Endpoint == "" || req.Version == "" {
		writeError(w, http.StatusBadRequest, "endpoint and version are required")
		return
	}

	id, err := store.SaveDeployment(h.db, req.Endpoint, req.Version, req.Notes, req.FingerprintVector, req.FittedCurveJSON, req.SweepResultJSON)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "save failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

// ── GET /api/deployments ──────────────────────────────────────────────────

func (h *handler) apiListDeployments(w http.ResponseWriter, r *http.Request) {
	endpoint := r.URL.Query().Get("endpoint")
	list, err := store.ListDeployments(h.db, endpoint)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if list == nil {
		list = []store.Deployment{}
	}
	writeJSON(w, http.StatusOK, list)
}

// ── GET /api/deployments/{id} ─────────────────────────────────────────────

func (h *handler) apiGetDeployment(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	d, err := store.GetDeployment(h.db, id)
	if err != nil {
		writeError(w, http.StatusNotFound, "deployment not found")
		return
	}
	writeJSON(w, http.StatusOK, d)
}
