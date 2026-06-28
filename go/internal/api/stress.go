package api

import (
	"encoding/json"
	"math"
	"net/http"
	"time"

	"github.com/SanthoshRaaj-KR/algolens/internal/probe"
)

type stressRequest struct {
	Endpoint         string            `json:"endpoint"`
	Method           string            `json:"method"`
	Headers          map[string]string `json:"headers"`
	Body             string            `json:"body"`
	ConcurrencySteps []int             `json:"concurrency_steps"`
	TimeoutMS        int               `json:"timeout_ms"`
}

func (h *handler) apiStress(w http.ResponseWriter, r *http.Request) {
	var req stressRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if req.Endpoint == "" {
		writeError(w, http.StatusBadRequest, "endpoint is required")
		return
	}
	if len(req.ConcurrencySteps) == 0 {
		writeError(w, http.StatusBadRequest, "concurrency_steps must not be empty")
		return
	}

	method := req.Method
	if method == "" {
		method = http.MethodGet
	}
	timeoutMS := req.TimeoutMS
	if timeoutMS <= 0 {
		timeoutMS = 5000
	}

	// Set SSE headers before any write — after this point errors go via sseError
	sseSetHeaders(w)

	cfg := probe.ProbeConfig{
		Endpoint:          req.Endpoint,
		Method:            method,
		PayloadTemplate:   req.Body, // static body, no {{n}} substitution
		Headers:           req.Headers,
		Variable:          "n",
		InputSizes:        []int{1},
		ConcurrencyLevels: []int{1},
		SamplesPerStep:    1,
		TimeoutMS:         timeoutMS,
	}

	client := &http.Client{Timeout: time.Duration(timeoutMS+500) * time.Millisecond}
	ctx := r.Context()

	var prevP99 float64
	stepsCompleted := 0

	for _, c := range req.ConcurrencySteps {
		// Stop immediately if client disconnected
		select {
		case <-ctx.Done():
			return
		default:
		}

		// Adaptive settling between steps: max(300ms, 3 × previous P99)
		if stepsCompleted > 0 {
			waitMS := 3.0 * prevP99
			if waitMS < 300 {
				waitMS = 300
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Duration(waitMS) * time.Millisecond):
			}
		}

		pt, err := probe.ProbeStep(cfg, 1, c, client)
		if err != nil {
			sseError(w, err.Error())
			return
		}

		errorRate := float64(pt.Errors) / float64(c)

		if err := sseWrite(w, map[string]any{
			"type":        "step",
			"concurrency": c,
			"p50":         stressRound2(pt.P50),
			"p95":         stressRound2(pt.P95),
			"p99":         stressRound2(pt.P99),
			"error_rate":  stressRound3(errorRate),
			"errors":      pt.Errors,
			"total":       c,
		}); err != nil {
			return
		}

		prevP99 = pt.P99
		stepsCompleted++

		// Breaking point: ≥50% of requests failed at this concurrency level
		if errorRate >= 0.5 {
			_ = sseWrite(w, map[string]any{
				"type":        "breaking_point",
				"concurrency": c,
				"error_rate":  stressRound3(errorRate),
			})
			return
		}
	}

	_ = sseWrite(w, map[string]any{
		"type":            "done",
		"steps_completed": stepsCompleted,
	})
}

func stressRound2(f float64) float64 { return math.Round(f*100) / 100 }
func stressRound3(f float64) float64 { return math.Round(f*1000) / 1000 }
