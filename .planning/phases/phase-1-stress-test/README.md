# Phase 1 — Stress / Concurrency Test

## Status
**Not started.** All the underlying machinery exists — this phase is primarily about wiring it up differently and adding SSE output.

---

## Goal
Expose a new endpoint that ramps concurrency on a static HTTP request and streams each result live via SSE — no `{{n}}` substitution, no complexity math, just raw pressure testing.

---

## What's Already Done (Reuse)

| What | Where | How to reuse |
|---|---|---|
| `ProbeStep(cfg, n, concurrency, client)` | `go/internal/probe/probe.go:36` | Call directly with `n=0` and a static body — it fires `concurrency` goroutines and returns p50/p95/p99. No changes needed to this function. |
| `settle(prevP99MS)` | `go/internal/probe/sweep.go:85` | Reuse the adaptive settling logic between concurrency steps. |
| `http.Client` creation with timeout | `go/internal/api/handlers.go:82` | Same pattern for creating the HTTP client. |
| `writeJSON` / `writeError` helpers | `go/internal/api/handlers.go:15-18` | Reuse for non-streaming error responses. |
| CORS middleware | `go/internal/api/router.go:38` | Already applied to all routes. |

**What NOT to reuse**: `Sweep()` from `sweep.go` — it iterates `n × concurrency` pairs for complexity analysis. This phase only needs one fixed payload iterated across concurrency levels.

---

## What to Build

1. **SSE helper** (`go/internal/api/sse.go`)
   - `func sseWrite(w http.ResponseWriter, eventType string, data any) error` — marshals data as JSON, writes `data: {json}\n\n` to the response writer, flushes immediately
   - `func sseSetHeaders(w http.ResponseWriter)` — sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
   - `func sseError(w http.ResponseWriter, msg string)` — emits `data: {"type":"error","message":"..."}\n\n` and flushes

2. **Stress handler** (`go/internal/api/stress.go`)
   - Route: `POST /api/stress`
   - Request body:
     ```json
     {
       "endpoint": "https://api.example.com/search",
       "method": "POST",
       "headers": {"Authorization": "Bearer ..."},
       "body": "{\"query\": \"test\"}",
       "concurrency_steps": [1, 5, 10, 25, 50, 100],
       "timeout_ms": 5000
     }
     ```
   - Validates: endpoint not empty, at least one concurrency step
   - Sets SSE headers immediately on connection
   - For each concurrency level:
     1. Build a `ProbeConfig` with static body (no `{{n}}`), single InputSize `[1]`, one ConcurrencyLevel
     2. Call `ProbeStep(cfg, 1, concurrencyLevel, client)`
     3. Emit SSE event: `{"type":"step","concurrency":10,"p50":45.2,"p95":112.0,"p99":203.4,"error_rate":0.02,"errors":1,"total":10}`
     4. If `errors/total >= 0.5`: emit `{"type":"breaking_point","concurrency":10,"error_rate":0.61}` and stop
     5. Call `settle(pt.P99)` before next step
   - On completion: emit `{"type":"done","steps_completed":5}`
   - On client disconnect (context cancelled): stop the loop cleanly

3. **Wire new routes** (`go/internal/api/router.go`)
   - Add `POST /api/stress` → `h.apiStress`
   - No changes to CORS middleware needed

---

## Files to Create / Modify

| File | Action | What changes |
|---|---|---|
| `go/internal/api/sse.go` | **Create** | SSE helper functions |
| `go/internal/api/stress.go` | **Create** | `apiStress` handler |
| `go/internal/api/router.go` | **Modify** | Add `mux.HandleFunc("POST /api/stress", h.apiStress)` |

Nothing in the `probe` package changes.

---

## SSE Event Schema

```
# One event per concurrency step:
data: {"type":"step","concurrency":10,"p50":45.2,"p95":112.0,"p99":203.4,"error_rate":0.02,"errors":1,"total":10}

# Breaking point detected:
data: {"type":"breaking_point","concurrency":50,"error_rate":0.61}

# All steps complete:
data: {"type":"done","steps_completed":5}

# Any error:
data: {"type":"error","message":"endpoint unreachable"}
```

---

## How It Connects

- **Receives from**: Nothing (this is the first new feature, standalone)
- **Hands to Phase 2**: Nothing directly. Phase 2 adds a `name` field to deployments — after Phase 2, the stress test results can be saved with a name.
- **Hands to Phase 8**: The frontend stress test page consumes `POST /api/stress` and reads its SSE stream.

---

## Key Decisions

**Why SSE and not blocking HTTP?** A stress test at 6 concurrency levels takes 6+ seconds. Blocking the HTTP connection until all steps finish gives the user zero feedback. SSE streams each result as it completes — the user sees the latency curve build live.

**Why reuse ProbeStep instead of writing new HTTP logic?** ProbeStep already handles goroutine fan-out, HDR histogram, error counting, and nanosecond timing correctly. Duplicating it would introduce measurement bugs.

**Why `settle()` between concurrency steps?** Same reason as the sweep — prevents in-flight requests from the previous step bleeding into the next measurement. Without it, you measure the tail of the previous concurrency level, not the beginning of the next.

---

## Exit Criterion

Point `POST /api/stress` at the test server (`go/test/server/main.go` running on `:9000`, `/linear` endpoint) with `concurrency_steps: [1, 5, 10]`. Verify:
1. SSE events arrive in the terminal one by one (not all at once at the end)
2. Each event has valid `p50`, `p95`, `p99` values
3. Breaking point detection: point it at a server that errors at high concurrency, confirm the `breaking_point` event fires and the loop stops
