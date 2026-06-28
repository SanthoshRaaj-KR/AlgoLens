package probe

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	hdrhistogram "github.com/HdrHistogram/hdrhistogram-go"
)

// ProbePoint holds the latency percentiles for a single (n, concurrency) step.
type ProbePoint struct {
	N           int
	Concurrency int
	P50         float64 // milliseconds
	P95         float64
	P99         float64
	Errors      int // count of failed/non-2xx requests in this step
}

type result struct {
	latencyNS int64
	err       error
}

// ProbeStep fires one (n, concurrency) step: concurrency goroutines each
// send one request with n substituted, collects latencies, returns a
// ProbePoint with p50/p95/p99 in milliseconds.
//
// Errors and non-2xx responses are counted but excluded from the histogram
// so they don't corrupt the latency distribution.
func ProbeStep(cfg ProbeConfig, n, concurrency int, client *http.Client) (ProbePoint, error) {
	results := make(chan result, concurrency)
	var wg sync.WaitGroup

	url := cfg.resolvedURL(n)
	body := cfg.resolvedPayload(n)

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			start := time.Now()

			ctx, cancel := context.WithTimeout(
				context.Background(),
				time.Duration(cfg.TimeoutMS)*time.Millisecond,
			)
			defer cancel()

			var bodyReader io.Reader
			if body != "" {
				bodyReader = strings.NewReader(body)
			}

			req, err := http.NewRequestWithContext(ctx, cfg.Method, url, bodyReader)
			if err != nil {
				results <- result{err: err}
				return
			}
			if body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			for k, v := range cfg.Headers {
				req.Header.Set(k, v)
			}

			resp, err := client.Do(req)
			elapsed := time.Since(start).Nanoseconds()

			if err != nil {
				results <- result{err: err}
				return
			}
			resp.Body.Close()

			if resp.StatusCode < 200 || resp.StatusCode >= 300 {
				results <- result{err: fmt.Errorf("status %d", resp.StatusCode)}
				return
			}

			results <- result{latencyNS: elapsed}
		}()
	}

	wg.Wait()
	close(results)

	// HDR histogram: range 1µs–60s, 3 significant figures
	hist := hdrhistogram.New(1_000, 60_000_000_000, 3)
	errCount := 0

	for r := range results {
		if r.err != nil {
			errCount++
			continue
		}
		hist.RecordValue(r.latencyNS)
	}

	if hist.TotalCount() == 0 {
		return ProbePoint{}, fmt.Errorf("all %d requests failed at n=%d concurrency=%d", concurrency, n, concurrency)
	}

	nsToMS := func(ns int64) float64 { return float64(ns) / 1e6 }

	return ProbePoint{
		N:           n,
		Concurrency: concurrency,
		P50:         nsToMS(hist.ValueAtQuantile(50)),
		P95:         nsToMS(hist.ValueAtQuantile(95)),
		P99:         nsToMS(hist.ValueAtQuantile(99)),
		Errors:      errCount,
	}, nil
}
