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
	errorRateStop = 0.5 // stop sweep if ≥50% of a step's requests fail
)

// Sweep runs the full n × concurrency matrix against cfg.Endpoint.
// It logs the estimated duration upfront, runs a global warmup, then
// iterates every (n, concurrency) combination sequentially with adaptive
// settling between steps.
//
// If a step's error rate exceeds errorRateStop the sweep stops early —
// that n is the observed breaking point.
func Sweep(cfg ProbeConfig, client *http.Client) (SweepResult, error) {
	est := EstimateDuration(cfg, 0)
	log.Printf("sweep: starting — %d n-values × %d concurrency levels = %d steps, estimated %s",
		len(cfg.InputSizes), len(cfg.ConcurrencyLevels),
		len(cfg.InputSizes)*len(cfg.ConcurrencyLevels), est.Round(time.Second))

	Warmup(cfg, client)

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

			totalRequests := cfg.SamplesPerStep
			if pt.Errors > 0 && float64(pt.Errors)/float64(totalRequests) >= errorRateStop {
				log.Printf("sweep: breaking point reached at n=%d c=%d (%.0f%% errors), stopping",
					n, c, float64(pt.Errors)/float64(totalRequests)*100)
				return result, nil
			}
		}
	}

	log.Printf("sweep: complete — %d points collected", len(result.Points))
	return result, nil
}

// probeWithRetry calls RunProbe and retries on total failure (network errors)
// with exponential backoff. Does NOT retry on non-2xx — those are real data.
func probeWithRetry(cfg ProbeConfig, n, c int, prevP99 float64, client *http.Client) (ProbePoint, error) {
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(retryBaseMS*(1<<attempt)) * time.Millisecond
			log.Printf("sweep: retry %d for n=%d c=%d after %s (err: %v)", attempt, n, c, backoff, lastErr)
			time.Sleep(backoff)
		}
		pt, err := RunProbe(cfg, n, c, prevP99, client)
		if err == nil {
			return pt, nil
		}
		lastErr = err
	}
	return ProbePoint{}, lastErr
}
