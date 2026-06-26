package probe

import (
	"net/http"
	"time"
)

// RunProbe executes a full probe against a single (n, concurrency) pair,
// including global warmup (if not already done) and per-step warmup.
//
// It is the primitive that Phase 3's sweep controller calls in a loop.
// prevP99MS is the p99 of the previous step in milliseconds, used to
// compute the adaptive settling delay. Pass 0 for the very first step.
func RunProbe(cfg ProbeConfig, n, concurrency int, prevP99MS float64, client *http.Client) (ProbePoint, error) {
	settle(prevP99MS)
	stepWarmup(cfg, n, client)
	return ProbeStep(cfg, n, concurrency, client)
}

// settle sleeps for max(minSettleMS, settleMultiplier × prevP99MS).
// See LOGIC.md §3d for the full rationale.
func settle(prevP99MS float64) {
	const (
		minSettleMS      = 300.0
		settleMultiplier = 3.0
	)
	waitMS := settleMultiplier * prevP99MS
	if waitMS < minSettleMS {
		waitMS = minSettleMS
	}
	time.Sleep(time.Duration(waitMS) * time.Millisecond)
}

// stepWarmup fires cfg.StepWarmup discarded requests at n before recording.
// Covers CPU frequency scaling re-warm after the settle period.
func stepWarmup(cfg ProbeConfig, n int, client *http.Client) {
	for i := 0; i < cfg.StepWarmup; i++ {
		ProbeStep(cfg, n, 1, client) //nolint:errcheck
	}
}
