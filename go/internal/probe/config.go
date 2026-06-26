package probe

import (
	"fmt"
	"strings"
)

// ProbeConfig describes a single endpoint to sweep.
type ProbeConfig struct {
	Endpoint        string // URL with optional {{n}} placeholder, e.g. "http://host/search?limit={{n}}"
	Method          string // HTTP method: GET, POST, etc.
	PayloadTemplate string // JSON body with optional {{n}} placeholder; empty for GET
	Variable        string // name of the substitution variable (always "n" for now)
	InputSizes      []int  // geometric sweep values, e.g. [1,2,4,8,16,...]
	ConcurrencyLevels []int // concurrency values to sweep, e.g. [1,2,4,8]
	WarmupRounds    int    // global warmup requests fired before the sweep (discarded)
	SamplesPerStep  int    // k requests recorded per (n, concurrency) step
	StepWarmup      int    // per-step warmup requests discarded before sampling
	TimeoutMS       int    // per-request timeout in milliseconds
}

// DefaultProbeConfig returns a ProbeConfig with sensible defaults.
func DefaultProbeConfig(endpoint, method string) ProbeConfig {
	return ProbeConfig{
		Endpoint:          endpoint,
		Method:            method,
		Variable:          "n",
		InputSizes:        []int{1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048},
		ConcurrencyLevels: []int{1, 2, 4, 8},
		WarmupRounds:      3,
		SamplesPerStep:    5,
		StepWarmup:        2,
		TimeoutMS:         5000,
	}
}

// substituteN replaces every occurrence of {{n}} in s with the decimal
// representation of n.
func substituteN(s string, n int) string {
	return strings.ReplaceAll(s, "{{n}}", fmt.Sprintf("%d", n))
}

// resolvedURL returns the endpoint URL with {{n}} substituted.
func (c *ProbeConfig) resolvedURL(n int) string {
	return substituteN(c.Endpoint, n)
}

// resolvedPayload returns the payload body with {{n}} substituted.
// Returns an empty string if no PayloadTemplate is set.
func (c *ProbeConfig) resolvedPayload(n int) string {
	if c.PayloadTemplate == "" {
		return ""
	}
	return substituteN(c.PayloadTemplate, n)
}
