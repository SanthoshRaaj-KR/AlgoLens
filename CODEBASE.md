# AlgoLens — Codebase Map

What every file does and why it exists.

---

## Top-level layout

```
Algo Lens/
├── go/              Go API server (the main backend)
├── python/          Python sidecar (math-heavy work: curve fitting, similarity)
├── test/            End-to-end demo script
├── .planning/       Design docs, logic reference, phase plan
├── RUNNING.md       How to start everything
└── CODEBASE.md      This file
```

---

## Go server — `go/`

The Go server does three things: probe HTTP endpoints, persist results to SQLite,
and expose a REST API for the frontend (and for you to call manually).

### Entry point

| File | What it does |
|---|---|
| `cmd/server/main.go` | Starts the server. Polls `localhost:8001/health` until the Python sidecar is ready (up to 30s), then opens SQLite, wires all routes, and listens on `:8080`. Nothing else. |

### `internal/probe/` — measuring latency

This package is the engine that sweeps an endpoint and collects raw timing data.
It knows nothing about databases or APIs — just HTTP and timing.

| File | What it does |
|---|---|
| `config.go` | Defines `ProbeConfig` — the full description of a probe job: endpoint URL, HTTP method, list of input sizes, concurrency levels, warmup settings, sample count, timeout. Also has `substituteN()` which replaces `{{n}}` in the URL/payload with the actual number. |
| `probe.go` | `ProbeStep()` — fires N concurrent goroutines at an endpoint, records every response time into an HDR histogram (handles extreme ranges in O(1) time), then extracts P50/P95/P99 from it. One call = one data point at one (n, concurrency) pair. |
| `sweep.go` | Orchestrates the full sweep. Contains: `Sweep()` (the outer loop over all n × concurrency combinations), `warmup()` (discarded warm-up requests before measuring), `settle()` (sleep between steps so the server recovers), `stepWarmup()` (discarded requests after each settle), `probeWithRetry()` (retries on network failure). Stops early if error rate hits 50%. |
| `sweep_result.go` | `SweepResult` struct — holds all the collected data points. Helper methods: `PointsForN()`, `PointsForConcurrency()`, `P50sAtConcurrency1()` (the array sent to Python for curve fitting), `EstimateDuration()` (rough time estimate before starting). |

### `internal/fingerprint/` — building the vector

Takes a completed `SweepResult` and computes the 6-number fingerprint vector that
characterises the endpoint's behaviour.

| File | What it does |
|---|---|
| `fingerprint.go` | Defines `Vector` (6 fields). Computes three signals directly from the sweep data: `ConcurrencyCliff()` (first concurrency level where P99 doubles — detects thread pool saturation), `MemoryGrowthRate()` (normalised slope of latency growth at concurrency=1 — proxy for memory pressure), `BreakingPoint()` (first n where ≥50% of requests fail). |
| `fit_client.go` | `CallFit()` — sends the P50 latency array to Python `/fit` and gets back the complexity class + R² + fitted curve. `Build()` — calls `CallFit()` and all three signal detectors, assembles the full `Vector`. This is the only file that talks to Python. |

### `internal/store/` — persistence

SQLite storage. One table: `deployments`. Each row is one saved probe result.

| File | What it does |
|---|---|
| `store.go` | `Open()` — opens the SQLite DB (using `modernc.org/sqlite`, a pure-Go driver — no C compiler needed on Windows), enables WAL mode (prevents read/write conflicts), runs the schema migration to create the `deployments` table if it doesn't exist. Returns a `*DB` wrapper around `*sql.DB`. |
| `deployment.go` | Three functions: `SaveDeployment()` (INSERT one row), `GetDeployment()` (fetch by ID), `ListDeployments()` (fetch all for an endpoint, newest first). Also contains `scanDeployment()` which maps a SQL row back into a `Deployment` struct. |

### `internal/api/` — REST API

Thin HTTP layer. Takes requests, calls the right packages, returns JSON.

| File | What it does |
|---|---|
| `router.go` | Wires all 7 routes using Go 1.22's built-in `ServeMux` (supports `{id}` path params). Wraps everything with a CORS middleware so the React frontend can call it. |
| `handlers.go` | `POST /api/probe` — runs a full sweep + builds the fingerprint vector, returns the result without saving. `POST /api/deployments` — saves a fingerprint to SQLite. `GET /api/deployments?endpoint=` — list all for an endpoint. `GET /api/deployments/{id}` — fetch one by ID. |
| `diff.go` | `GET /api/diff?a=:id&b=:id` — loads two deployments, computes field-level deltas (exponent went up/down, cliff dropped, breaking point fell), generates a plain-English summary ("Complexity degraded from O(n) to O(n²)"). `GET /api/timeline` — same list as deployments but reversed to chronological order. `POST /api/search` — sends all stored fingerprint vectors to Python `/similarity`, gets back cosine similarity scores, maps them back to deployments. |

### `test/server/` — test endpoint with known behaviour

| File | What it does |
|---|---|
| `test/server/main.go` | A minimal HTTP server on `:9000` with three endpoints that simulate known complexity classes. `/constant?n=X` sleeps 10ms always (O(1)). `/linear?n=X` sleeps n ms (O(n)). `/quadratic?n=X` sleeps 2ms + n²×200µs (O(n²)). Used by the demo script to verify AlgoLens classifies them correctly. |

---

## Python sidecar — `python/`

The sidecar exists because numpy/scipy have no Go equivalent. It is a FastAPI app
on port 8001. The Go server polls `/health` on startup and talks to it for two things.

| File | What it does |
|---|---|
| `main.py` | Entry point. Mounts the two routers and exposes `GET /health`. |
| `curve_fit.py` | `POST /fit` — receives an array of (n, latency) pairs, fits 6 candidate functions (O(1) through O(n³)) using scipy's `curve_fit`, picks the best by R² with a tie-break rule (if a simpler model is within R²=0.02, prefer it). Has a flatness pre-check: if max/min latency < 1.5×, returns O(1) immediately (prevents noisy flat data from being misclassified as O(n log n)). |
| `similarity.py` | `POST /similarity` — receives a query vector and a list of stored vectors, returns cosine similarity scores sorted descending. Handles the zero-vector edge case (score=0). |
| `test_sidecar.py` | 13 pytest tests covering both endpoints: O(1)/O(n)/O(n²)/O(log n)/O(n log n) detection, tie-breaking, identical/ranked/zero-vector similarity cases. |

---

## Planning docs — `.planning/`

| File | What it does |
|---|---|
| `LOGIC.md` | Full algorithm reference. Covers sweep design (geometric input sizes, why), warmup rationale, adaptive settling formula, noise sources table, curve fitting math (R² formula), concurrency cliff algorithm, breaking point definition, memory growth rate heuristic, cosine similarity formula, end-to-end data flow, key design decisions, known limitations. Read this before changing any measurement logic. |
| `PHASES.md` | 10-phase build plan. Phases 1–6 are complete. 7–10 are React frontend, diff view, timeline chart, and polish. |

---

## Test / demo — `test/`

| File | What it does |
|---|---|
| `demo.ps1` | End-to-end demo script (PowerShell). Verifies all three services are up, probes `/constant` (expects O(1)) and `/quadratic` (expects O(n²)), saves both as deployments, diffs them (should show regression), prints the timeline, runs a similarity search. Run it to verify the whole stack works. |

---

## Why two processes (Go + Python)?

Go is fast and simple for HTTP handling, concurrency, and database work.
Python has scipy and numpy, which do the nonlinear curve fitting and vector math.
There is no mature Go equivalent for `scipy.optimize.curve_fit`. Splitting on this
boundary keeps each service doing what its ecosystem is best at.

---

## Data flow (one probe request, end to end)

```
User calls POST /api/probe
        │
        ▼
api/handlers.go
  builds ProbeConfig from request JSON
        │
        ▼
probe.Sweep()                              ← Go, pure HTTP timing
  for each (n, concurrency):
    settle()                               wait for server to recover
    stepWarmup()                           discard 2 warm-up requests
    ProbeStep()                            fire N goroutines, record to HDR histogram
    extract P50 / P95 / P99
        │
        ▼
fingerprint.Build()
  CallFit()  ──── POST /fit ────►  Python curve_fit.py
                                    fits O(1)…O(n³), picks best
             ◄── complexity class, R², fitted curve ────
  ConcurrencyCliff()                 from sweep data
  MemoryGrowthRate()                 from sweep data
  BreakingPoint()                    from sweep data
        │
        ▼
return SweepResult + Vector + FitResult to user
(nothing saved until user calls POST /api/deployments)
```
