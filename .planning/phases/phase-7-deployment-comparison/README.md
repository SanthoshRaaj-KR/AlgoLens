# Phase 7 — Deployment Comparison

## Status
**Partially done.** `GET /api/diff` already exists and returns field deltas + plain English summary for fingerprint vectors. This phase extends it with simulation-mode data: per-endpoint latency deltas, agent success rate comparison, and turn count comparison.

---

## Goal
Extend the existing diff endpoint to surface what changed between two simulation-mode deployments — which specific endpoint call got slower, whether success rate changed, whether it took more turns to achieve the goal.

---

## What's Already Done (Reuse)

| What | Where | How to reuse |
|---|---|---|
| `GET /api/diff?a=&b=` handler | `go/internal/api/diff.go:33` | Extend — add new fields to response, don't touch existing delta/summary logic |
| `buildDeltas(a, b Vector)` | `go/internal/api/diff.go:67` | Keep as-is for fingerprint fields |
| `buildSummary(a, b Vector)` | `go/internal/api/diff.go:99` | Keep as-is for plain English fingerprint summary |
| `GetDeployment(db, id)` | `go/internal/store/deployment.go` | Already fetches both deployments; add Summary field to Deployment struct |
| `Deployment` struct | `go/internal/store/deployment.go` | Add `Summary string` and `SessionLogs string` fields (added in Phase 2) |
| `scanDeployment()` | `go/internal/store/deployment.go` | Already scans new columns after Phase 2 |

---

## What to Build

### 1. New diff fields in response

Extend `diffResponse` struct in `go/internal/api/diff.go`:

```go
type diffResponse struct {
    DeploymentA store.Deployment `json:"deployment_a"`
    DeploymentB store.Deployment `json:"deployment_b"`
    Deltas      []fieldDelta     `json:"deltas"`           // existing
    Summary     []string         `json:"summary"`           // existing
    // NEW:
    SimDiff     *simDiff         `json:"sim_diff,omitempty"` // nil if either deployment is not simulation mode
}

type simDiff struct {
    SuccessRateDelta  float64              `json:"success_rate_delta"`   // B.success_rate - A.success_rate
    AvgTurnsDelta     float64              `json:"avg_turns_delta"`       // B.avg_turns - A.avg_turns
    AvgLatencyDelta   float64              `json:"avg_latency_delta_ms"`
    EndpointDeltas    []endpointDelta      `json:"endpoint_deltas"`
    Summary           []string             `json:"summary"`               // plain English for sim metrics
}

type endpointDelta struct {
    Endpoint      string  `json:"endpoint"`         // e.g. "POST /auth/login"
    AvgLatencyA   float64 `json:"avg_latency_a_ms"`
    AvgLatencyB   float64 `json:"avg_latency_b_ms"`
    Delta         float64 `json:"delta_ms"`          // B - A
    Direction     string  `json:"direction"`          // "up" | "down" | "same"
}
```

### 2. Parse `summary` JSONB from deployments

Add helper in `go/internal/api/diff.go`:

```go
type deploymentSummary struct {
    SuccessCount           int                `json:"success_count"`
    FailCount              int                `json:"fail_count"`
    AvgTurns               float64            `json:"avg_turns"`
    AvgLatencyMS           float64            `json:"avg_latency_ms"`
    PerEndpointAvgLatency  map[string]float64 `json:"per_endpoint_avg_latency"`
}

func parseSummary(summaryJSON string) (deploymentSummary, error) {
    // unmarshal the JSONB string stored by Phase 6
    // return zero-value struct if empty (fingerprint mode deployments have no summary)
}
```

### 3. Build sim diff

```go
func buildSimDiff(a, b store.Deployment) *simDiff {
    if a.Mode != "simulation" || b.Mode != "simulation" {
        return nil  // only compare simulation deployments
    }
    
    sumA, _ := parseSummary(a.Summary)
    sumB, _ := parseSummary(b.Summary)
    
    // Per-endpoint deltas: find all endpoints present in either A or B
    // For missing endpoints: latency = 0
    endpointDeltas := computeEndpointDeltas(sumA.PerEndpointAvgLatency, sumB.PerEndpointAvgLatency)
    
    successRateA := float64(sumA.SuccessCount) / float64(sumA.SuccessCount + sumA.FailCount)
    successRateB := float64(sumB.SuccessCount) / float64(sumB.SuccessCount + sumB.FailCount)
    
    return &simDiff{
        SuccessRateDelta: successRateB - successRateA,
        AvgTurnsDelta:    sumB.AvgTurns - sumA.AvgTurns,
        AvgLatencyDelta:  sumB.AvgLatencyMS - sumA.AvgLatencyMS,
        EndpointDeltas:   endpointDeltas,
        Summary:          buildSimSummary(successRateA, successRateB, sumA, sumB),
    }
}
```

### 4. Plain English sim summary

```go
func buildSimSummary(srA, srB float64, a, b deploymentSummary) []string {
    var lines []string
    
    if srB < srA - 0.05 {
        lines = append(lines, fmt.Sprintf(
            "Agent success rate dropped %.0f%% → %.0f%% — more sessions are failing to complete the goal.",
            srA*100, srB*100))
    }
    if b.AvgTurns > a.AvgTurns * 1.2 {
        lines = append(lines, fmt.Sprintf(
            "Average turns increased %.1f → %.1f — agents are taking more steps to complete the goal.",
            a.AvgTurns, b.AvgTurns))
    }
    // Find the endpoint with the largest latency increase
    // Emit: "POST /search latency increased by 234ms (+67%)"
    
    if len(lines) == 0 {
        lines = append(lines, "No significant regressions in simulation metrics.")
    }
    return lines
}
```

---

## Files to Create / Modify

| File | Action | What changes |
|---|---|---|
| `go/internal/api/diff.go` | **Modify** | Add `SimDiff` to `diffResponse`, add `parseSummary()`, `buildSimDiff()`, `buildSimSummary()`, `computeEndpointDeltas()` |
| `go/internal/store/deployment.go` | **Modify** | Add `Summary string` and `Mode string` fields to `Deployment` struct (if Phase 2 didn't already add them to the scan) |

---

## Response Shape (complete)

```json
{
  "deployment_a": { "id": 1, "name": "v1.0-baseline", "mode": "simulation", ... },
  "deployment_b": { "id": 2, "name": "v1.1-refactored", "mode": "simulation", ... },
  "deltas": [
    { "field": "complexity_exponent", "a": 1.0, "b": 1.2, "delta": 0.2, "direction": "up" }
  ],
  "summary": ["Complexity exponent slightly increased — monitor at scale."],
  "sim_diff": {
    "success_rate_delta": -0.15,
    "avg_turns_delta": 1.3,
    "avg_latency_delta_ms": 87.4,
    "endpoint_deltas": [
      { "endpoint": "POST /auth/login", "avg_latency_a_ms": 45, "avg_latency_b_ms": 48, "delta_ms": 3, "direction": "up" },
      { "endpoint": "POST /search", "avg_latency_a_ms": 120, "avg_latency_b_ms": 354, "delta_ms": 234, "direction": "up" }
    ],
    "summary": [
      "Agent success rate dropped 90% → 75% — more sessions are failing to complete the goal.",
      "POST /search latency increased by 234ms (+195%) — primary regression source."
    ]
  }
}
```

---

## How It Connects

- **Receives from Phase 2**: `summary` JSONB column exists in `Deployment` struct
- **Receives from Phase 6**: `summary` is populated by the agent runner with `per_endpoint_avg_latency`
- **Produced for Phase 8**: Frontend diff page reads `sim_diff` to show the bottleneck heatmap and simulation summary

---

## Key Decisions

**Why `sim_diff` is nil for fingerprint-mode deployments?** Fingerprint mode has no concept of "success rate" or "turns". Mixing the two would produce meaningless numbers. `sim_diff: null` in the response is the signal to the frontend to not render those sections.

**Why compute endpoint deltas even for endpoints only in A or B (not both)?** If an endpoint appears in A but not B, it means B's agents never called it. That's meaningful — the route might have been removed or the agents failed before reaching it. Show it with `avg_latency_b: 0` and `direction: "down"`.

---

## Exit Criterion

1. Save two simulation-mode deployments with different `summary` JSONB values (manually constructed)
2. `GET /api/diff?a=1&b=2` → response includes `sim_diff` with non-null values
3. `sim_diff.endpoint_deltas` correctly identifies the endpoint with the largest latency change
4. `GET /api/diff` on two fingerprint-mode deployments → `sim_diff` is null (not present)
5. `GET /api/diff` on one simulation + one fingerprint → `sim_diff` is null
