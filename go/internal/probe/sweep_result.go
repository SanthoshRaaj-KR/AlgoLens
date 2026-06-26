package probe

import "time"

// SweepResult holds all ProbePoints collected across an n × concurrency sweep.
type SweepResult struct {
	Config ProbeConfig
	Points []ProbePoint
}

// PointsForN returns all ProbePoints recorded at a given input size.
func (sr *SweepResult) PointsForN(n int) []ProbePoint {
	var out []ProbePoint
	for _, p := range sr.Points {
		if p.N == n {
			out = append(out, p)
		}
	}
	return out
}

// PointsForConcurrency returns all ProbePoints recorded at a given concurrency.
func (sr *SweepResult) PointsForConcurrency(c int) []ProbePoint {
	var out []ProbePoint
	for _, p := range sr.Points {
		if p.Concurrency == c {
			out = append(out, p)
		}
	}
	return out
}

// P50sAtConcurrency1 returns the ordered p50 latencies (ms) at concurrency=1,
// one per InputSize. Used as the primary input to curve fitting.
func (sr *SweepResult) P50sAtConcurrency1() []float64 {
	var out []float64
	for _, p := range sr.Points {
		if p.Concurrency == 1 {
			out = append(out, p.P50)
		}
	}
	return out
}

// EstimateDuration estimates the total wall-clock time for a sweep, using a
// conservative per-step latency assumption of estimatedStepMS.
// Pass 0 to use the built-in default of 50ms.
func EstimateDuration(cfg ProbeConfig, estimatedStepMS float64) time.Duration {
	if estimatedStepMS <= 0 {
		estimatedStepMS = 50
	}

	numSteps := len(cfg.InputSizes) * len(cfg.ConcurrencyLevels)

	// Global warmup
	warmupMS := float64(cfg.WarmupRounds) * estimatedStepMS

	// Per step: settle floor + per-step warmup + samples
	settleMS := float64(numSteps) * 300 // min settle floor per step
	stepWarmupMS := float64(numSteps) * float64(cfg.StepWarmup) * estimatedStepMS
	sampleMS := float64(numSteps) * float64(cfg.SamplesPerStep) * estimatedStepMS

	totalMS := warmupMS + settleMS + stepWarmupMS + sampleMS
	return time.Duration(totalMS) * time.Millisecond
}
