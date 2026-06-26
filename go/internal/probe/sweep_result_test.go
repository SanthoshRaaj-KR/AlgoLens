package probe

import (
	"testing"
	"time"
)

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
		t.Errorf("PointsForN(1): got %d points, want 2", len(pts))
	}
	for _, p := range pts {
		if p.N != 1 {
			t.Errorf("PointsForN(1) returned point with N=%d", p.N)
		}
	}
}

func TestPointsForConcurrency(t *testing.T) {
	sr := makeSweepResult()
	pts := sr.PointsForConcurrency(2)
	if len(pts) != 2 {
		t.Errorf("PointsForConcurrency(2): got %d points, want 2", len(pts))
	}
	for _, p := range pts {
		if p.Concurrency != 2 {
			t.Errorf("PointsForConcurrency(2) returned point with Concurrency=%d", p.Concurrency)
		}
	}
}

func TestP50sAtConcurrency1(t *testing.T) {
	sr := makeSweepResult()
	p50s := sr.P50sAtConcurrency1()
	if len(p50s) != 2 {
		t.Fatalf("P50sAtConcurrency1: got %d values, want 2", len(p50s))
	}
	if p50s[0] != 2.0 || p50s[1] != 5.0 {
		t.Errorf("P50sAtConcurrency1: got %v, want [2.0 5.0]", p50s)
	}
}

func TestEstimateDuration_Reasonable(t *testing.T) {
	cfg := DefaultProbeConfig("http://host/api", "GET")
	// 12 n × 4 concurrency = 48 steps, default 50ms estimate
	d := EstimateDuration(cfg, 0)
	if d < 5*time.Second || d > 5*time.Minute {
		t.Errorf("EstimateDuration = %v; expected a reasonable sweep duration", d)
	}
}

func TestEstimateDuration_ZeroInputsZeroSteps(t *testing.T) {
	cfg := DefaultProbeConfig("http://host/api", "GET")
	cfg.InputSizes = []int{}
	cfg.ConcurrencyLevels = []int{}
	d := EstimateDuration(cfg, 50)
	if d > time.Second {
		t.Errorf("EstimateDuration with no steps = %v; expected near zero", d)
	}
}
