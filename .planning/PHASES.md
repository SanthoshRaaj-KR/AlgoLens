# AlgoLens — Phase-by-Phase Build Plan

---

## Phase 1 — Foundation & Scaffold

**Goal:** Skeleton compiles, services start, talk to each other.

### Tasks
- [ ] Init Go module (`go.mod`) — `github.com/user/algolens`
- [ ] Init Python venv + `requirements.txt` (fastapi, uvicorn, scipy, numpy)
- [ ] Scaffold React app (`vite` + TypeScript)
- [ ] Define directory structure:
  ```
  algolens/
  ├── go/
  │   ├── cmd/server/main.go
  │   ├── internal/
  │   │   ├── probe/
  │   │   ├── fingerprint/
  │   │   ├── store/
  │   │   └── api/
  ├── python/
  │   ├── main.py          ← FastAPI sidecar
  │   ├── curve_fit.py
  │   └── similarity.py
  ├── frontend/
  │   └── src/
  ├── schema.sql           ← SQLite schema
  └── AlgoLens.md
  ```
- [ ] SQLite schema: `deployments` table (id, endpoint, version, notes, timestamp, fingerprint_vector JSON)
- [ ] Go: thin HTTP client wrapper to call Python sidecar
- [ ] Python: `/health` endpoint — Go pings it at startup
- [ ] `Makefile` with `make dev` that starts Go + Python sidecar + frontend together

**Exit criterion:** `make dev` boots all three; Go hits Python `/health` and logs OK.

---

## Phase 2 — Go Probing Harness

**Goal:** Fire real HTTP requests against a target endpoint and collect raw latency samples.

### Tasks
- [ ] `ProbeConfig` struct: `{Endpoint, Method, PayloadTemplate, Variable, InputSizes []int, Concurrency []int, WarmupRounds int}`
- [ ] Single probe point: given `(n, concurrency)`, spin up `concurrency` goroutines via `sync.WaitGroup`, each fires one request with `n` substituted into the payload, sends `(latency_ns, status_code, error)` down a result channel
- [ ] Channel drain loop: collect all results, discard errors/non-200s, feed good latencies into an HDR histogram instance
- [ ] Extract p50, p95, p99 from the histogram after all goroutines complete
- [ ] Return a `ProbePoint{N int, Concurrency int, P50, P95, P99 float64}` struct
- [ ] Payload templating: support `{{n}}` substitution in JSON payload strings

**Exit criterion:** Point a `ProbeConfig` at a local test server; get back a `ProbePoint` with three latency percentiles. Verified with a unit test against a real HTTP test server (`httptest.NewServer`).

---

## Phase 3 — Concurrency Sweep Controller

**Goal:** Drive all n × concurrency combinations and return a full latency matrix.

### Tasks
- [ ] `SweepController`: iterates over `InputSizes × ConcurrencyLevels`, calls the probing harness for each combination
- [ ] Configurable parallelism: run multiple probe points concurrently (bounded by a semaphore to avoid hammering the target)
- [ ] Result aggregation: collect all `ProbePoint` results into a `SweepResult{Points []ProbePoint}` struct
- [ ] Per-combination retry with exponential backoff on connection errors (not on 4xx/5xx — those are real data)
- [ ] Probe duration estimate: given the sweep config, log estimated time before starting

**Exit criterion:** Full sweep runs against a local test server with 3 input sizes × 3 concurrency levels = 9 probe points returned correctly.

---

## Phase 4 — Python Math Sidecar

**Goal:** FastAPI service that takes raw latency data and returns curve fit + similarity scores.

### `/fit` endpoint
- [ ] Input: `{n_values: [10, 100, 1000], latencies: [p50_list]}` (use p50 for curve fitting)
- [ ] Try fitting to each complexity class using SciPy `curve_fit` (least squares):
  - O(1): `f(n) = c`
  - O(log n): `f(n) = a * log(n) + b`
  - O(n): `f(n) = a * n + b`
  - O(n log n): `f(n) = a * n * log(n) + b`
  - O(n²): `f(n) = a * n² + b`
- [ ] Select best fit by lowest residual (R² score)
- [ ] Return: `{complexity_class: "O(n²)", exponent: 2.0, coefficient: 0.0023, r_squared: 0.97, fitted_curve: [[n, predicted_latency], ...]}`

### `/similarity` endpoint
- [ ] Input: `{query_vector: [...], stored_vectors: [[...], ...]}`
- [ ] Compute cosine similarity between `query_vector` and each stored vector using NumPy
- [ ] Return ranked list: `[{index: int, score: float}]`

**Exit criterion:** POST a synthetic latency array that follows `O(n²)` exactly → response says `O(n²)` with R² > 0.99. Similarity endpoint returns 1.0 for identical vectors.

---

## Phase 5 — Fingerprint Vector Builder + SQLite Store

**Goal:** Go builds the fingerprint vector from sweep + fit results and persists it only on explicit user action.

### Fingerprint vector
- [ ] Go calls Python `/fit` with the sweep's p50 latencies
- [ ] Go computes remaining signals directly:
  - **Concurrency cliff**: find the concurrency level where p99 jumps > 2× relative to p99 at concurrency=1
  - **Breaking point**: extrapolate from the fitted curve where p99 crosses a configured threshold (e.g. 1000ms)
  - **Read/write ratio**: derived from response size distribution across probe points (placeholder: 0.5 for now, expand later)
- [ ] Assemble `FingerprintVector{ComplexityExponent, MemoryGrowthRate, ConcurrencyCliff, BreakingPoint, ReadWriteRatio float64}`
- [ ] `store` package: SQLite via `mattn/go-sqlite3`
  - `SaveDeployment(endpoint, version, notes string, fp FingerprintVector) (int64, error)`
  - `ListDeployments(endpoint string) ([]Deployment, error)`
  - `GetDeployment(id int64) (Deployment, error)`
- [ ] **Critical:** no auto-save. The store is only called when the user explicitly triggers "Save as Deployment" via the API.

**Exit criterion:** Run a full sweep → call `/fit` → build vector → manually call `SaveDeployment` → query SQLite → row exists with correct values.

---

## Phase 6 — Go REST API

**Goal:** Full API surface the frontend talks to.

### Endpoints
- [ ] `POST /api/probe` — runs a sweep, returns `SweepResult` + `FingerprintVector`. **Does not save to DB.**
- [ ] `POST /api/deployments` — saves the current fingerprint. Body: `{endpoint, version, notes, fingerprint_vector}`
- [ ] `GET /api/deployments?endpoint=...` — list all saved deployments for an endpoint
- [ ] `GET /api/deployments/:id` — get a single deployment
- [ ] `GET /api/diff?a=:id&b=:id` — returns both deployments + delta report (diff of all vector fields, complexity class change, plain-English summary)
- [ ] `POST /api/search` — body: `{fingerprint_vector}`, calls Python `/similarity` with all stored vectors, returns ranked results with deployment metadata
- [ ] `GET /api/timeline?endpoint=...` — returns all deployments for an endpoint sorted chronologically, formatted for the timeline chart

### Plain-English diff summary (built in Go, no AI)
- [ ] Rule-based: compare complexity class — if changed, emit "Complexity degraded from O(n log n) to O(n²)"
- [ ] Compare concurrency cliff delta — if dropped > 20%, emit "Concurrency ceiling dropped by X%"
- [ ] Compare breaking point — if dropped, emit "Breaking point fell from Xk to Yk records"

**Exit criterion:** All endpoints return correct shapes; diff endpoint correctly describes a known regression between two manually-inserted rows.

---

## Phase 7 — React Frontend Core

**Goal:** Probe config → live results working end-to-end.

### Components
- [ ] `ProbeConfigForm` — endpoint URL, method, payload template with `{{n}}` placeholder, input sizes (comma-separated), concurrency levels (comma-separated), warmup toggle
- [ ] `RunProbeButton` — calls `POST /api/probe`, shows loading state
- [ ] `SweepResultsPanel` — shows the latency matrix as a table (rows = input size, cols = concurrency, cells = p50/p95/p99)
- [ ] `ComplexityBadge` — displays the fitted complexity class with color coding (green = O(n) or better, yellow = O(n log n), red = O(n²))
- [ ] `FingerprintVectorCard` — shows all 5 vector components with labels
- [ ] `SaveDeploymentModal` — version tag input, notes textarea, "Save" button that calls `POST /api/deployments`
- [ ] State: probe results held in component state (not persisted) until user saves

**Exit criterion:** Run a probe from the UI, see the latency matrix and complexity class, save as a deployment — row appears in the DB.

---

## Phase 8 — Version Diff View

**Goal:** Select two deployments and see what changed.

### Components
- [ ] `DeploymentSelector` — two dropdowns filtered by endpoint, shows version + date
- [ ] `CurveOverlayChart` (Recharts) — plots both fitted curves on the same chart; different colors for v1 and v2; x-axis = input size, y-axis = latency (ms)
- [ ] `DeltaReport` — table of all fingerprint fields with: v1 value, v2 value, delta, direction indicator (↑ ↓ =)
- [ ] `PlainEnglishSummary` — renders the plain-English diff string from the API
- [ ] Highlight regressions in red, improvements in green, neutral in grey

**Exit criterion:** Select two saved deployments with intentionally different fingerprints; chart shows two distinct curves; delta report correctly identifies the changed fields.

---

## Phase 9 — Reverse Search + Drift Timeline

**Goal:** "Which past version does this look like?" + chronological drift chart.

### Reverse Search
- [ ] `SearchPanel` — runs a probe (or uses cached probe result), sends fingerprint vector to `POST /api/search`
- [ ] `SimilarityResultsList` — ranked list: version tag, date, similarity score (%), any saved notes; top result highlighted
- [ ] Score color coding: > 90% = strong match (red warning), 70–90% = moderate, < 70% = weak

### Drift Timeline
- [ ] `DriftTimeline` (Recharts) — line chart with time on x-axis, one line per fingerprint dimension (complexity exponent, concurrency cliff, breaking point)
- [ ] Complexity class changes marked as vertical annotations on the chart
- [ ] Hover tooltip shows full deployment details

**Exit criterion:** With 4+ saved deployments, timeline shows correct chronological evolution; similarity search correctly ranks a near-duplicate vector as the top hit.

---

## Phase 10 — Integration & Polish

**Goal:** Everything works together; no rough edges.

### Tasks
- [ ] Error handling: API errors surface as toasts in the frontend (not silent failures)
- [ ] Loading skeletons for all async operations
- [ ] Graceful sidecar failure: if Python sidecar is down, Go API returns 503 with a clear message
- [ ] `make dev` starts everything in order (sidecar first, then Go waits for sidecar health, then frontend)
- [ ] Input validation: URL format, non-empty payload, at least 3 input sizes (needed for curve fitting to be meaningful)
- [ ] SQLite WAL mode enabled (prevents read/write contention)
- [ ] README with quickstart (5 commands to run the full stack)
- [ ] End-to-end smoke test: script that probes a local test server, saves two deployments with different behavior, diffs them, runs similarity search

**Exit criterion:** Follow the README on a clean machine → full E2E smoke test passes.

---

## Build Order Summary

```
Phase 1  →  Foundation & Scaffold
Phase 2  →  Go Probing Harness (single probe point)
Phase 3  →  Go Concurrency Sweep (n × concurrency driver)
Phase 4  →  Python Math Sidecar (curve fit + similarity)
Phase 5  →  Fingerprint Vector Builder + SQLite Store
Phase 6  →  Go REST API (all endpoints)
Phase 7  →  React Core (probe → results → save)
Phase 8  →  Version Diff View
Phase 9  →  Reverse Search + Drift Timeline
Phase 10 →  Integration & Polish
```

Each phase has a clear exit criterion. No phase starts until the previous one passes its criterion.
