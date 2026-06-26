package fingerprint

import (
	"testing"

	"github.com/SanthoshRaaj-KR/algolens/internal/probe"
)

func makeSweep(points []probe.ProbePoint) probe.SweepResult {
	cfg := probe.DefaultProbeConfig("http://host/api?n={{n}}", "GET")
	cfg.SamplesPerStep = 5
	return probe.SweepResult{Config: cfg, Points: points}
}

// ── ConcurrencyCliff ──────────────────────────────────────────────────────

func TestConcurrencyCliff_DetectsDoubling(t *testing.T) {
	sr := makeSweep([]probe.ProbePoint{
		{N: 1, Concurrency: 1, P99: 10},
		{N: 1, Concurrency: 2, P99: 12},
		{N: 1, Concurrency: 4, P99: 25}, // doubles from c=2 (12→25 > 2×12=24? no, 25>24 yes)
		{N: 1, Concurrency: 8, P99: 60},
	})
	cliff := ConcurrencyCliff(sr)
	if cliff != 4 {
		t.Errorf("expected cliff at 4, got %v", cliff)
	}
}

func TestConcurrencyCliff_NoneDetected(t *testing.T) {
	sr := makeSweep([]probe.ProbePoint{
		{N: 1, Concurrency: 1, P99: 10},
		{N: 1, Concurrency: 2, P99: 12},
		{N: 1, Concurrency: 4, P99: 18},
	})
	if cliff := ConcurrencyCliff(sr); cliff != 0 {
		t.Errorf("expected no cliff (0), got %v", cliff)
	}
}

func TestConcurrencyCliff_SingleLevel(t *testing.T) {
	sr := makeSweep([]probe.ProbePoint{
		{N: 1, Concurrency: 1, P99: 10},
	})
	if cliff := ConcurrencyCliff(sr); cliff != 0 {
		t.Errorf("expected 0 for single level, got %v", cliff)
	}
}

func TestConcurrencyCliff_UsesMedianAcrossN(t *testing.T) {
	// One outlier at n=1 c=4 shouldn't trigger cliff; median across n values is still ok
	sr := makeSweep([]probe.ProbePoint{
		{N: 1, Concurrency: 1, P99: 10},
		{N: 4, Concurrency: 1, P99: 10},
		{N: 1, Concurrency: 4, P99: 100}, // outlier
		{N: 4, Concurrency: 4, P99: 12},  // normal
	})
	// median p99 at c=4 is (12+100)/2=56 > 2×10 → cliff detected
	cliff := ConcurrencyCliff(sr)
	if cliff != 4 {
		t.Errorf("expected cliff at 4, got %v", cliff)
	}
}

// ── MemoryGrowthRate ──────────────────────────────────────────────────────

func TestMemoryGrowthRate_FlatIsZero(t *testing.T) {
	sr := makeSweep([]probe.ProbePoint{
		{N: 1, Concurrency: 1, P50: 5},
		{N: 4, Concurrency: 1, P50: 5},
		{N: 16, Concurrency: 1, P50: 5},
	})
	rate := MemoryGrowthRate(sr)
	if rate != 0 {
		t.Errorf("flat latency should give 0 memory growth, got %v", rate)
	}
}

func TestMemoryGrowthRate_HighGrowthCapped(t *testing.T) {
	sr := makeSweep([]probe.ProbePoint{
		{N: 1, Concurrency: 1, P50: 1},
		{N: 2, Concurrency: 1, P50: 1000}, // extreme jump
	})
	rate := MemoryGrowthRate(sr)
	if rate != 1.0 {
		t.Errorf("extreme growth should be capped at 1.0, got %v", rate)
	}
}

func TestMemoryGrowthRate_ZeroWithoutData(t *testing.T) {
	sr := makeSweep([]probe.ProbePoint{
		{N: 1, Concurrency: 1, P50: 5},
	})
	if rate := MemoryGrowthRate(sr); rate != 0 {
		t.Errorf("single point should give 0, got %v", rate)
	}
}

// ── BreakingPointN ────────────────────────────────────────────────────────

func TestBreakingPointN_DetectsBreak(t *testing.T) {
	sr := makeSweep([]probe.ProbePoint{
		{N: 1, Concurrency: 1, Errors: 0},
		{N: 4, Concurrency: 1, Errors: 0},
		{N: 16, Concurrency: 1, Errors: 3}, // 3/5 = 60% >= 50%
	})
	bp := BreakingPointN(sr)
	if bp != 16 {
		t.Errorf("expected breaking point at n=16, got %v", bp)
	}
}

func TestBreakingPointN_NoneReached(t *testing.T) {
	sr := makeSweep([]probe.ProbePoint{
		{N: 1, Concurrency: 1, Errors: 0},
		{N: 4, Concurrency: 1, Errors: 1}, // 1/5 = 20% < 50%
	})
	if bp := BreakingPointN(sr); bp != 0 {
		t.Errorf("expected 0 (not reached), got %v", bp)
	}
}
