package probe

import (
	"fmt"
	"log"
	"net/http"
	"time"
)

const (
	maxRetries    = 3
	retryBaseMS   = 200
	errorRateStop = 0.5

	minSettleMS      = 300.0
	settleMultiplier = 3.0
)

// Sweep runs the full n × concurrency matrix against cfg.Endpoint.
// Logs estimated duration upfront, runs global warmup, then iterates every
// (n, concurrency) pair sequentially with adaptive settling between steps.
// Stops early when a step's error rate reaches errorRateStop.
func Sweep(cfg ProbeConfig, client *http.Client) (SweepResult, error) {
	est := EstimateDuration(cfg, 0)
	log.Printf("sweep: starting — %d n-values × %d concurrency levels = %d steps, estimated %s",
		len(cfg.InputSizes), len(cfg.ConcurrencyLevels),
		len(cfg.InputSizes)*len(cfg.ConcurrencyLevels), est.Round(time.Second))

	warmup(cfg, client)

	result := SweepResult{Config: cfg}
	var prevP99 float64

	for _, n := range cfg.InputSizes {
		for _, c := range cfg.ConcurrencyLevels {
			pt, err := probeWithRetry(cfg, n, c, prevP99, client)
			if err != nil {
				return result, fmt.Errorf("step n=%d c=%d failed after retries: %w", n, c, err)
			}

			result.Points = append(result.Points, pt)
			prevP99 = pt.P99

			total := cfg.SamplesPerStep
			if pt.Errors > 0 && float64(pt.Errors)/float64(total) >= errorRateStop {
				log.Printf("sweep: breaking point at n=%d c=%d (%.0f%% errors), stopping",
					n, c, float64(pt.Errors)/float64(total)*100)
				return result, nil
			}
		}
	}

	log.Printf("sweep: complete — %d points collected", len(result.Points))
	return result, nil
}

// probeWithRetry retries on total network failure with exponential backoff.
// Does NOT retry non-2xx — those are real data points.
func probeWithRetry(cfg ProbeConfig, n, c int, prevP99 float64, client *http.Client) (ProbePoint, error) {
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(retryBaseMS*(1<<attempt)) * time.Millisecond
			log.Printf("sweep: retry %d for n=%d c=%d after %s", attempt, n, c, backoff)
			time.Sleep(backoff)
		}
		pt, err := runProbe(cfg, n, c, prevP99, client)
		if err == nil {
			return pt, nil
		}
		lastErr = err
	}
	return ProbePoint{}, lastErr
}

// runProbe: adaptive settle → per-step warmup → timed ProbeStep.
func runProbe(cfg ProbeConfig, n, concurrency int, prevP99MS float64, client *http.Client) (ProbePoint, error) {
	settle(prevP99MS)
	stepWarmup(cfg, n, client)
	return ProbeStep(cfg, n, concurrency, client)
}

// settle sleeps max(minSettleMS, settleMultiplier × prevP99MS).
// Gives the server time to drain in-flight requests before the next step.
func settle(prevP99MS float64) {
	waitMS := settleMultiplier * prevP99MS
	if waitMS < minSettleMS {
		waitMS = minSettleMS
	}
	time.Sleep(time.Duration(waitMS) * time.Millisecond)
}

// stepWarmup fires discarded requests to re-warm CPU scaling after settle.
func stepWarmup(cfg ProbeConfig, n int, client *http.Client) {
	for i := 0; i < cfg.StepWarmup; i++ {
		ProbeStep(cfg, n, 1, client) //nolint:errcheck
	}
}

// warmup fires WarmupRounds discarded requests at the smallest n before any
// timed measurements, priming JIT, connection pools, and socket overhead.
func warmup(cfg ProbeConfig, client *http.Client) {
	if cfg.WarmupRounds <= 0 || len(cfg.InputSizes) == 0 {
		return
	}
	n := cfg.InputSizes[0]
	for i := 0; i < cfg.WarmupRounds; i++ {
		ProbeStep(cfg, n, 1, client) //nolint:errcheck
	}
}
