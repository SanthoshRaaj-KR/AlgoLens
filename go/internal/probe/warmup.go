package probe

import (
	"net/http"
)

// Warmup fires cfg.WarmupRounds requests at the smallest input size and
// discards all results. This primes JIT compilation, connection pools,
// and OS-level socket overhead before any timed measurements begin.
func Warmup(cfg ProbeConfig, client *http.Client) {
	if cfg.WarmupRounds <= 0 || len(cfg.InputSizes) == 0 {
		return
	}
	n := cfg.InputSizes[0]
	for i := 0; i < cfg.WarmupRounds; i++ {
		// Ignore errors — warmup requests are best-effort
		ProbeStep(cfg, n, 1, client) //nolint:errcheck
	}
}
