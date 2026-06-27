# AlgoLens — Detailed Codebase Reference

Every file explained in depth — what it does, every concept it uses, why those
choices were made, and how it connects to everything else.

---

## How to read this document

Start at the top and read in order if you are new. If you know the basics,
use the section headings to jump to a specific file. Every concept that appears
in the code is explained the first time it shows up.

---

## Repository layout

```
Algo Lens/
├── go/                     Go backend — HTTP probing, SQLite, REST API
│   ├── cmd/server/         Entry point (main.go)
│   ├── internal/
│   │   ├── probe/          Measures latency (the measurement engine)
│   │   ├── fingerprint/    Builds the 6-number fingerprint vector
│   │   ├── store/          SQLite read/write
│   │   └── api/            HTTP handlers and routing
│   └── test/server/        Fake HTTP server with known complexity for testing
├── python/                 Python sidecar — curve fitting, similarity math
├── test/                   End-to-end demo script
├── .planning/              Design docs (LOGIC.md, PHASES.md)
├── RUNNING.md              Start commands and port-conflict fixes
└── CODEBASE.md             This file
```

---

## Why two separate processes (Go + Python)?

AlgoLens splits work between Go and Python for a specific reason.

**Go** is excellent at: spawning thousands of goroutines, making concurrent HTTP
requests, timing them accurately, and running a low-latency HTTP server.

**Python** has `scipy` and `numpy`, which are the gold standard for scientific
computing. Specifically, `scipy.optimize.curve_fit` does nonlinear least-squares
fitting — finding the best parameters for a mathematical function that fits a
dataset. There is no Go library that does this reliably.

So the split is: Go does all the timing and HTTP work, Python does all the math.
They communicate via HTTP (the Go server calls the Python sidecar's API).

---

# Go Server

---

## `go/cmd/server/main.go` — Entry point

This file is the program's start. It does four things in order and stops if
any one fails:

**1. Poll the Python sidecar**

```go
for i := 0; i < 30; i++ {
    resp, err := http.Get("http://localhost:8001/health")
    if err == nil && resp.StatusCode == 200 { break }
    time.Sleep(1 * time.Second)
}
```

The Go server cannot work without Python (it calls `/fit` during every probe).
Rather than fail immediately if Python takes a few seconds to start, it polls
`/health` once per second for up to 30 seconds. This is called a **readiness
check** — waiting for a dependency to become ready before proceeding.

**2. Open SQLite**

```go
db, err := store.Open("algolens.db")
```

This creates the database file if it does not exist, runs the schema migration
(creates the `deployments` table), and enables WAL mode. The `db` returned is
a `*store.DB` wrapper (not a raw `*sql.DB`) — explained in `store.go`.

**3. Wire the router**

```go
handler := api.NewRouter(db.DB, "http://localhost:8001")
```

`db.DB` unwraps the store wrapper to pass the raw `*sql.DB` that the `api`
package needs. `"http://localhost:8001"` is the sidecar URL — the API handlers
use this to call Python.

**4. Listen**

```go
http.ListenAndServe(":8080", handler)
```

Starts the HTTP server on port 8080. `ListenAndServe` blocks forever (until
the process is killed). If the port is already in use, it returns an error
immediately.

---

## `go/internal/probe/config.go` — Probe configuration

### What it does

Defines `ProbeConfig` — the complete description of a sweep job. Every other
probe file receives a `ProbeConfig` and reads from it. Nothing mutates it after
creation.

### Concepts used

**`ProbeConfig` struct:**

```go
type ProbeConfig struct {
    Endpoint          string    // e.g. "http://localhost:9000/api?n={{n}}"
    Method            string    // "GET" or "POST"
    PayloadTemplate   string    // JSON body with {{n}} placeholder
    Variable          string    // name of the variable (unused in v1, reserved)
    InputSizes        []int     // e.g. [1, 2, 4, 8, 16, 32]
    ConcurrencyLevels []int     // e.g. [1, 2, 4]
    WarmupRounds      int       // discarded requests before sweep starts
    SamplesPerStep    int       // measured requests per (n, concurrency) pair
    StepWarmup        int       // discarded requests after each settle
    TimeoutMS         int       // per-request timeout in milliseconds
}
```

**`{{n}}` substitution — `substituteN()`:**

Instead of building a new URL every time, the endpoint template stores the
placeholder `{{n}}`. The function `substituteN(s, n)` does a simple
`strings.ReplaceAll(s, "{{n}}", strconv.Itoa(n))` to produce the actual URL
for each step. This is called **template substitution** — a common pattern
when you need to parameterise strings without a full template engine.

**`DefaultProbeConfig()`:**

Returns a `ProbeConfig` with sensible starting values (5 samples, 2 warmup
rounds, 1000ms timeout, etc.) so users do not have to fill every field.
This is the **default factory pattern** — one place that owns the defaults
so they are consistent everywhere.

**`resolvedURL(n int)` and `resolvedPayload(n int)`:**

These are receiver methods on `ProbeConfig`. They call `substituteN` on the
endpoint and payload template respectively. A **receiver method** in Go is a
function associated with a type — `(c *ProbeConfig) resolvedURL(n)` means "call
this on a ProbeConfig value".

---

## `go/internal/probe/probe.go` — Single probe step

### What it does

`ProbeStep()` fires a fixed number of concurrent requests at a single
(n, concurrency) combination and returns one `ProbePoint` with P50/P95/P99.
This is the lowest-level measurement primitive — everything else calls this.

### Concepts used

**`ProbePoint` struct:**

```go
type ProbePoint struct {
    N, Concurrency int
    P50, P95, P99  float64   // milliseconds
    Errors         int       // count of non-2xx or network error responses
}
```

**HDR Histogram (`hdrhistogram-go`):**

A regular histogram divides a range into fixed-width buckets. The problem:
if you want to track latencies from 1 microsecond to 60 seconds, you either
need millions of buckets (wasteful) or wide buckets that lose precision.

An **HDR (High Dynamic Range) Histogram** uses a clever trick: it stores values
with a fixed relative precision (e.g., 1% accuracy) across an extremely wide
range. This means:
- Values near 1µs get tight buckets (very precise)
- Values near 60s also get precise-enough buckets
- Memory usage stays small regardless of range
- Insert is O(1), percentile extraction is O(log n)

```go
hist := hdrhistogram.New(1, 60_000_000_000, 3)
// min=1µs, max=60s (in nanoseconds), 3 significant figures
```

We use this because a single sweep might see latencies from 0.1ms (fast
endpoint) to 5000ms (overloaded endpoint). HDR handles both without
configuration changes.

**`sync.WaitGroup` — coordinating goroutines:**

A `WaitGroup` is a counter that blocks until it reaches zero.

```go
var wg sync.WaitGroup
for i := 0; i < concurrency; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        // fire one request
    }()
}
wg.Wait()  // blocks here until all goroutines call Done()
```

This is the standard Go pattern for "fire N goroutines, wait for all to finish".
Without WaitGroup, the main goroutine would return before the sub-goroutines
finished measuring.

**`sync.Mutex` — protecting shared state:**

Multiple goroutines write to the same histogram concurrently. Without a lock,
two goroutines could corrupt the histogram's internal data simultaneously (a
**race condition**).

```go
var mu sync.Mutex
// inside each goroutine:
mu.Lock()
hist.RecordValue(latency_ns)
mu.Unlock()
```

A **Mutex (Mutual Exclusion lock)** ensures only one goroutine runs the
protected block at a time.

**Measuring time:**

```go
start := time.Now()
resp, err := client.Do(req)
elapsed := time.Since(start).Nanoseconds()
```

`time.Now()` captures a timestamp. `time.Since(start)` subtracts it from now,
giving a `time.Duration`. `.Nanoseconds()` converts to int64 nanoseconds — the
unit HDR histogram expects.

**Non-2xx handling:**

HTTP status codes 400–599 indicate errors. We count them separately (`Errors++`)
rather than recording their latency. The latency of an error response is not
meaningful — it could be fast because the server rejected early, or slow because
it timed out. Including them would distort the curve.

**Converting nanoseconds to milliseconds:**

```go
func nsToMS(ns int64) float64 { return float64(ns) / 1e6 }
```

The histogram stores nanoseconds (what `time.Since` gives). The rest of the
system works in milliseconds (what humans understand). 1ms = 1,000,000ns = 1e6ns.

**`hist.ValueAtQuantile(50)`:**

This asks the histogram "what value is at the 50th percentile?" — i.e., the
median. The histogram computes this in O(log n) by scanning its internal bucket
array.

---

## `go/internal/probe/sweep.go` — The sweep orchestrator

This is the largest and most complex file in the probe package. It contains
the full sweep loop plus all the timing-safety logic.

### What it does

`Sweep()` drives the outer loop across every (n, concurrency) pair. Between
each step it runs three sub-steps: settle, per-step warmup, then measure.
It stops early if an error threshold is hit.

### Concepts used

**The sweep loop:**

```go
for _, n := range cfg.InputSizes {
    for _, c := range cfg.ConcurrencyLevels {
        pt, err := probeWithRetry(cfg, n, c, prevP99, client)
        result.Points = append(result.Points, pt)
        prevP99 = pt.P99
    }
}
```

The outer loop iterates over input sizes (n), the inner over concurrency levels
(c). For each pair, it calls `probeWithRetry` and appends the result. `prevP99`
carries the worst-case response time of the last step into the next one.

**`settle(prevP99MS float64)` — adaptive delay:**

```go
waitMS := 3.0 * prevP99MS
if waitMS < 300.0 { waitMS = 300.0 }
time.Sleep(time.Duration(waitMS) * time.Millisecond)
```

Why this exists: if the previous step had requests still completing (especially
at high concurrency), firing the next step immediately would measure leftover
work from the previous step, not the new step. This is called **bleed-through
noise**. By waiting `3 × prevP99`, we give the server at least 3 full
worst-case response cycles to drain all queues.

The 300ms floor ensures even fast endpoints (p99=2ms) get a breathing room.
Without it, fast endpoints would get 6ms settle which is too short — OS
scheduling could still have threads from the previous step mid-context-switch.

**`warmup(cfg, client)` — global warmup:**

Fires `WarmupRounds` discarded requests before any timed measurement. This
covers:
- **JIT warm-up** in the target runtime (Java HotSpot, Node.js V8, Python
  PyPy all compile hot paths after the first few calls)
- **Connection pool initialisation** — the first request opens a TCP connection;
  subsequent ones reuse it. The first request's latency includes TCP handshake
  overhead which is not part of algorithmic complexity.
- **OS socket overhead** — the kernel needs to set up socket buffers on first
  use.

Without warmup, n=1 (the first real measurement) is artificially slow, making
the curve look like it drops sharply at low n — which could cause O(n) to be
misclassified as O(log n).

**`stepWarmup(cfg, n, client)` — per-step warmup:**

After `settle()` sleeps, the CPU frequency may have scaled down (modern CPUs
reduce clock speed when idle to save power). The first request after a settle
period is slower than steady-state because the CPU is ramping back up. Firing
`StepWarmup` discarded requests re-warms the CPU scaling before we start
counting.

**`probeWithRetry()` — exponential backoff:**

```go
for attempt := 0; attempt < 3; attempt++ {
    pt, err := runProbe(...)
    if err == nil { return pt, nil }
    backoff := 200ms * (1 << attempt)  // 200ms, 400ms, 800ms
    time.Sleep(backoff)
}
```

`1 << attempt` is a bit-shift — doubles the wait time each retry (200, 400, 800ms).
This is **exponential backoff**, the standard approach for transient network
failures. We only retry on complete network failures (connection refused, timeout).
Non-2xx responses are NOT retried — a 500 error is real data (breaking point).

**Early stopping — breaking point detection:**

```go
if float64(pt.Errors)/float64(cfg.SamplesPerStep) >= 0.5 {
    return result, nil  // stop the sweep
}
```

If 50% or more of requests at a given step fail, we stop. Further measurements
would not be meaningful — the endpoint is already overloaded. The n at which
this happened is the **breaking point**.

**`log.Printf` throughout:**

Every major event is logged (sweep start, estimated duration, each retry, early
stop, completion). This gives you visibility into what the sweep is doing during
a long run. Logs go to stdout and are visible in the terminal where `go run` runs.

---

## `go/internal/probe/sweep_result.go` — Sweep data container

### What it does

Holds the output of a sweep (`SweepResult`) and provides helper methods to
slice the data different ways.

### Concepts used

**`SweepResult` struct:**

```go
type SweepResult struct {
    Config ProbeConfig    // the config that produced this result
    Points []ProbePoint   // all measured data points, in sweep order
}
```

Storing the config alongside the results ensures that anyone reading the result
later knows exactly how it was produced — same n values, same concurrency
levels, same sample count.

**Receiver methods — slicing the data:**

```go
func (sr *SweepResult) PointsForN(n int) []ProbePoint
func (sr *SweepResult) PointsForConcurrency(c int) []ProbePoint
func (sr *SweepResult) P50sAtConcurrency1() []float64
```

`PointsForN(4)` returns all probe points where N==4 (all concurrency levels at
input size 4). `P50sAtConcurrency1()` returns the p50 latencies across all n
values when concurrency==1 — this is the specific array sent to Python for curve
fitting. We use concurrency=1 because we want pure algorithmic cost, not the
effect of thread contention.

**`EstimateDuration()`:**

Before the sweep starts, this estimates total wall-clock time so you know how
long to wait. It adds: warmup time + settle floor per step + step warmup time
+ sample time. The estimate is conservative (uses the floor settle, not adaptive
settle) so it underestimates for slow endpoints — but it gives a useful ballpark.

---

## `go/internal/fingerprint/fingerprint.go` — Signal detectors

### What it does

Contains the `Vector` struct (the 6-number fingerprint) and three functions that
compute signals directly from the sweep data — without calling Python.

### Concepts used

**`Vector` struct:**

```go
type Vector struct {
    ComplexityClass    string   // "O(n)", "O(n²)" etc.
    ComplexityExponent float64  // continuous number, e.g. 1.73
    MemoryGrowthRate   float64  // 0–1 heuristic
    ConcurrencyCliff   float64  // concurrency level where p99 doubled; 0 = not detected
    BreakingPoint      float64  // n where ≥50% errors; 0 = not reached
    ReadWriteRatio     float64  // placeholder 0.5 in v1
}
```

This vector is the single number that represents the entire behavioural
fingerprint of an endpoint. It is stored in SQLite and used for similarity search.

**`ConcurrencyCliff(sr probe.SweepResult) float64`:**

Groups all ProbePoints by concurrency level. For each level, computes the median
p99 across all n values. Then walks consecutive pairs:

```
if median_p99[c+1] > 2.0 × median_p99[c]:
    cliff = c+1
    break
```

We look at p99 (not p50) because a concurrency cliff manifests in the tail
first. When a thread pool fills up, most requests still complete quickly (p50
stays flat) but the unlucky ones that queue up spike enormously. p50 would miss
the cliff; p99 catches it.

We use the median across all n values because we want the cliff at a particular
concurrency to be representative of the endpoint's behaviour, not a spike at
one particular n value.

**`MemoryGrowthRate(sr probe.SweepResult) float64`:**

Computes the average rate of latency increase per unit of n, at concurrency=1:

```
rate = mean( (latency[i+1] - latency[i]) / (n[i+1] - n[i]) )
     normalised to [0, 1] by clamping to a max expected slope
```

This is a **heuristic** (an educated guess, not a measurement). We cannot see
the server's memory directly. But if memory is growing — say, because the
server is building a list that grows with n — it will eventually start GC pauses
and the latency will accelerate. Accelerating latency shows up as an increasing
slope in the p50 curve. That slope is the memory growth rate proxy.

**`BreakingPointN(sr probe.SweepResult) float64`:**

Walks through the sweep points in order and returns the first n where
`Errors/SamplesPerStep >= 0.5`. Returns 0 if no such n was reached (the endpoint
survived the full sweep).

---

## `go/internal/fingerprint/fit_client.go` — Talking to Python

### What it does

`CallFit()` sends the P50 latency array to Python's `/fit` endpoint and decodes
the response. `Build()` combines `CallFit()` with all three signal detectors to
produce the full `Vector`.

### Concepts used

**`FitResult` struct:**

```go
type FitResult struct {
    ComplexityClass string
    Exponent        float64
    Coefficient     float64
    RSquared        float64
    FittedCurve     [][2]float64  // [[n, predicted_ms], ...]
}
```

`FittedCurve` is the set of predicted (n, latency) pairs from the winning model.
This is what gets drawn as the curve line in the frontend chart.

**JSON encoding/decoding:**

```go
body, _ := json.Marshal(payload)
resp, _ := http.Post(sidecarURL+"/fit", "application/json", bytes.NewReader(body))
json.NewDecoder(resp.Body).Decode(&result)
```

`json.Marshal` converts a Go struct to a JSON byte slice. `json.NewDecoder`
wraps the response body in a streaming decoder. `Decode(&result)` reads the
JSON and fills in the struct fields, matching by JSON field names (which are
specified with `json:"..."` struct tags).

**`Build()` — assembling everything:**

```go
func Build(sr probe.SweepResult, sidecarURL string, client *http.Client) (Vector, FitResult, error) {
    fitResult, err := CallFit(sidecarURL, client, sr)
    v := Vector{
        ComplexityClass:    fitResult.ComplexityClass,
        ComplexityExponent: fitResult.Exponent,
        MemoryGrowthRate:   MemoryGrowthRate(sr),
        ConcurrencyCliff:   ConcurrencyCliff(sr),
        BreakingPoint:      BreakingPointN(sr),
        ReadWriteRatio:     0.5,  // placeholder
    }
    return v, fitResult, nil
}
```

This is the single assembly point for the full fingerprint. It calls Python
for the complexity class (which requires scipy) and computes the remaining
signals in Go (which only require arithmetic on the sweep data).

---

## `go/internal/store/store.go` — Database setup

### What it does

Opens the SQLite database, enables WAL mode, and runs the schema migration.
Returns a `*DB` wrapper that the rest of the system uses.

### Concepts used

**`modernc.org/sqlite` — pure Go SQLite driver:**

The original plan used `mattn/go-sqlite3`, which wraps the C SQLite library.
Using C code in Go requires **CGO** (C-Go interop) and a C compiler (GCC).
On Windows without MinGW/GCC installed, this fails.

`modernc.org/sqlite` is a different driver — it is a **transpiled** version of
the SQLite C source code, mechanically converted to Go. It has zero C dependencies
and works on any platform that Go supports. The only change needed is the
driver name: `"sqlite"` instead of `"sqlite3"`.

**WAL mode (Write-Ahead Logging):**

```go
db.Exec("PRAGMA journal_mode=WAL")
```

SQLite's default journal mode is **DELETE** — writers lock the entire database
file, blocking readers. This means a write and a read cannot happen at the same
time.

WAL mode changes this: writers write to a separate log file rather than the main
database. Readers read from the main database file and merge in the log as
needed. The result: **readers and writers can run concurrently without blocking
each other**. For a web server handling simultaneous requests, this matters.

**`type DB struct{ *sql.DB }` — the wrapper:**

```go
type DB struct {
    *sql.DB
}

func Open(path string) (*DB, error) {
    sqlDB, err := sql.Open("sqlite", path+"?_journal_mode=WAL")
    return &DB{sqlDB}, err
}
```

Why not return `*sql.DB` directly? The `store` package needs to add extra
behaviour (like running migrations on open). By wrapping `*sql.DB` in a custom
`DB` struct, we can add methods to it while still having access to all the
original `*sql.DB` methods through **embedding** (Go's form of composition —
embedding a type gives you all its methods directly).

The `main.go` then passes `db.DB` (the inner `*sql.DB`) to the API layer, which
only needs raw SQL access, not the store wrapper.

**Schema migration — `migrate()`:**

```go
db.Exec(`CREATE TABLE IF NOT EXISTS deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL,
    version TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    complexity_class TEXT,
    complexity_exponent REAL,
    memory_growth_rate REAL,
    concurrency_cliff REAL,
    breaking_point REAL,
    read_write_ratio REAL,
    fitted_curve TEXT,     -- JSON blob
    sweep_result TEXT      -- JSON blob
)`)
```

`IF NOT EXISTS` means this is safe to run on every startup — if the table
already exists, the command does nothing. `INTEGER PRIMARY KEY AUTOINCREMENT`
means SQLite assigns a unique incrementing ID to each row automatically.
`REAL` is SQLite's float64. `TEXT` stores strings, including JSON blobs.

---

## `go/internal/store/deployment.go` — Reading and writing deployments

### What it does

Three functions that read/write the `deployments` table. All three take a
`*sql.DB`, not the `*DB` wrapper — they are pure SQL functions.

### Concepts used

**`SaveDeployment()` — INSERT:**

```go
res, err := db.Exec(`INSERT INTO deployments (...) VALUES (?, ?, ...)`, args...)
id, err := res.LastInsertId()
```

The `?` placeholders are **parameterised queries** — Go fills in the actual
values after passing them to SQLite separately. This prevents SQL injection:
a user-provided string like `"); DROP TABLE deployments;--` is treated as a
literal value, not SQL code.

`LastInsertId()` returns the auto-assigned `id` of the row just inserted —
this is what the API sends back to the caller as `{"id": 3}`.

**`GetDeployment()` — SELECT by ID:**

```go
row := db.QueryRow(`SELECT ... FROM deployments WHERE id = ?`, id)
return scanDeployment(row)
```

`QueryRow` is for queries that return exactly one row. `Scan` reads the columns
in order into Go variables.

**`ListDeployments()` — SELECT all for an endpoint:**

```go
rows, err := db.Query(`SELECT ... ORDER BY created_at DESC, id DESC`)
for rows.Next() {
    d, _ := scanDeployment(rows)
    out = append(out, d)
}
```

`id DESC` as a tiebreaker matters: SQLite stores timestamps at second precision.
If two rows are saved in the same second (common in tests), `created_at DESC`
alone doesn't determine order — SQLite would return them in arbitrary order.
Adding `id DESC` as tiebreaker ensures deterministic, consistent ordering.

**`scanDeployment()` — mapping SQL rows to Go structs:**

```go
func scanDeployment(s scanner) (Deployment, error) {
    var notes, fittedCurve sql.NullString
    err := s.Scan(&d.ID, ..., &notes, &fittedCurve, ...)
    d.Notes = notes.String
    ...
}
```

`sql.NullString` handles nullable text columns — if the column is NULL in
SQLite, `.Valid` is false and `.String` is empty. If you used a plain `string`,
`Scan` would fail on NULL values. The `scanner` interface accepts both
`*sql.Row` (single row) and `*sql.Rows` (multiple rows), so `scanDeployment`
works for both `GetDeployment` and `ListDeployments`.

**`time.Parse` for created_at:**

SQLite returns datetime as the string `"2026-06-27 12:39:25"`. We parse it
back to a `time.Time` with `time.Parse("2006-01-02 15:04:05", value)`.
Go uses the specific reference time `Mon Jan 2 15:04:05 MST 2006` as its
format template — every field in the format is the reference time's value,
not a placeholder letter like `YYYY`.

---

## `go/internal/api/router.go` — Route wiring

### What it does

Creates the HTTP router and connects each URL pattern to a handler function.
Wraps everything with CORS middleware.

### Concepts used

**Go 1.22 `ServeMux` with path parameters:**

Before Go 1.22, the standard `http.ServeMux` did not support URL parameters
like `/api/deployments/{id}`. You needed a third-party router (gorilla/mux,
chi, echo). Go 1.22 added this natively:

```go
mux.HandleFunc("GET /api/deployments/{id}", h.getDeployment)
```

Inside the handler, `r.PathValue("id")` retrieves the value that matched `{id}`.

**CORS middleware:**

The React frontend runs on a different port (5173) than the Go API (8080).
Browsers enforce the **Same-Origin Policy** — by default, JavaScript cannot
make requests to a different origin (host + port). This is a security feature
that prevents one website from reading another's data.

**CORS (Cross-Origin Resource Sharing)** is the browser mechanism that lets a
server say "I allow requests from these other origins". Our middleware adds the
headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

The `OPTIONS` method is the browser's **preflight request** — before making a
POST, the browser first asks "do you allow this?". Our middleware handles
`OPTIONS` requests and returns 200, telling the browser to proceed.

---

## `go/internal/api/handlers.go` — Core API handlers

### What it does

Implements four endpoints: run a probe, save a deployment, list deployments,
get one deployment.

### Concepts used

**`handler` struct:**

```go
type handler struct {
    db         *sql.DB
    sidecarURL string
    client     *http.Client
}
```

By grouping shared state (the DB connection, the sidecar URL, the HTTP client)
into a struct, all handlers can access these without global variables. This is
the **dependency injection** pattern — dependencies are passed in, not looked up.

**`POST /api/probe` — the main endpoint:**

This is the most important handler. When called:
1. Decodes the JSON request body into a `ProbeConfig`
2. Calls `probe.Sweep()` to run the full latency matrix
3. Calls `fingerprint.Build()` to produce the Vector and FitResult
4. Returns all of it as JSON — does NOT save to the DB

The separation of "probe" (measure only) from "deployments" (save) is intentional.
You might run a probe 10 times experimenting with config before deciding to save
one as a deployment. Auto-saving every probe would pollute the DB.

**`json.NewDecoder(r.Body).Decode(&req)`:**

`r.Body` is an `io.Reader` — a stream of bytes. `json.NewDecoder` wraps it in
a streaming JSON decoder. `Decode(&req)` reads the stream and fills in the
struct. This is memory-efficient for large bodies because it does not read the
entire body into memory before parsing.

**`writeJSON(w, code, v)`:**

A helper that sets `Content-Type: application/json`, writes the status code,
and marshals `v` to JSON. All handlers use this instead of calling `json.Marshal`
+ `w.Write` directly — consistency and less repetition.

**`writeError(w, code, msg)`:**

Returns `{"error": "msg"}` with the given HTTP status code. Using a standard
error shape means the frontend always knows what field to read.

---

## `go/internal/api/diff.go` — Diff, timeline, and search

### What it does

Three endpoints that work with saved deployments: compare two of them, get the
history of one endpoint, and search for similar ones.

### Concepts used

**`GET /api/diff?a=:id&b=:id` — comparing two deployments:**

Loads both deployments, then calls `buildDeltas()` and `buildSummary()`.

`buildDeltas()` produces a table of per-field differences:
```
complexity_exponent: 1.0 → 2.0  (up)
memory_growth_rate:  0.0 → 0.97 (up)
concurrency_cliff:   0.0 → 0.0  (same)
```

`buildSummary()` applies rule-based logic to produce plain-English sentences:
- If class changed AND exponent went up → "Complexity degraded from X to Y"
- If cliff dropped >20% → "Concurrency ceiling dropped by X%"
- If breaking point fell → "Breaking point fell from n=X to n=Y"
- If none of the above → "No significant regressions detected."

This is called **rule-based expert system** — a set of if/else rules that
encode domain knowledge. No AI needed — the rules are straightforward.

**`GET /api/timeline` — chronological history:**

`ListDeployments` returns newest-first (most useful for list views). The timeline
wants oldest-first (for a time chart). Rather than a second SQL query, we
reverse the slice in-place:

```go
for i, j := 0, len(list)-1; i < j; i, j = i+1, j-1 {
    list[i], list[j] = list[j], list[i]
}
```

This is an O(n) in-place reversal with no extra memory allocation.

**`POST /api/search` — cosine similarity:**

1. Loads all deployments from SQLite
2. Converts each `Vector` to a `[]float64` slice with `vectorToSlice()`
3. POSTs to Python `/similarity` with the query vector and all stored vectors
4. Gets back scores + indices, maps indices back to deployments
5. Returns the deployments sorted by score descending

```go
type similarityResult struct {
    store.Deployment        // embedded — no "deployment" wrapper in the JSON
    Score float64 `json:"score"`
}
```

Embedding `store.Deployment` without a field name means all of Deployment's
fields appear directly in the JSON output — `{"ID": 1, "Version": "v1.0", ...,
"score": 0.97}`. There is no nested `"deployment"` key.

**`vectorToSlice(v Vector) []float64`:**

The Python similarity endpoint needs vectors as plain float slices, not Go
structs. This converts the 5 numeric fields (excluding the string `ComplexityClass`)
into `[]float64{exponent, growthRate, cliff, breakingPoint, rwRatio}`.

---

## `go/test/server/main.go` — Controlled test server

### What it does

A minimal HTTP server on port 9000 with three endpoints that simulate known
complexity classes. Used only to verify AlgoLens works — not part of the
production system.

### Endpoints and their sleep formulas

**`/constant?n=X` — O(1):**
```go
time.Sleep(10 * time.Millisecond)
```
Always sleeps exactly 10ms regardless of n. The 10ms is chosen to be well above
the Windows OS timer noise floor (~2ms jitter). If we slept 1ms, the 2ms noise
would dominate and the curve would look like it grows slightly — misclassified
as O(n) or O(log n).

**`/linear?n=X` — O(n):**
```go
sleep := time.Duration(n) * time.Millisecond  // capped at 500ms
```
n=1 → 1ms, n=32 → 32ms. Linear growth is clearly visible.

**`/quadratic?n=X` — O(n²):**
```go
sleep := 2*time.Millisecond + time.Duration(n*n*200)*time.Microsecond
```
The 2ms base ensures even n=1 is above noise. The n²×200µs term gives:
n=1→2.2ms, n=2→2.8ms, n=4→5.2ms, n=8→14.8ms, n=16→52.2ms, n=32→204.8ms.
This 94× range from n=1 to n=32 is unmistakably quadratic.

---

# Python Sidecar

---

## `python/main.py` — Sidecar entry point

Mounts the two routers (`fit_router` from `curve_fit.py`, `sim_router` from
`similarity.py`) and adds `GET /health`. There is no logic here — just wiring.

**FastAPI:** A Python web framework that generates OpenAPI docs automatically and
validates request/response types using Python type annotations. Much faster than
Flask for high-throughput JSON APIs because it uses async I/O.

---

## `python/curve_fit.py` — Complexity classification

### What it does

Receives an array of (n, latency) pairs and returns the complexity class that
best fits the data.

### Concepts used

**Flatness pre-check (added to fix O(1) misclassification):**

```python
if min(y) > 0 and max(y) / min(y) < 1.5:
    return FitResponse(complexity_class="O(1)", r_squared=1.0, ...)
```

If the max latency is less than 1.5× the min, the signal is constant —
regardless of what R² values the curve fitter would compute. This is necessary
because R² for O(1) is always ≈0 for flat data (the model explains zero variance
because there is zero trend to explain), while more complex models can "explain"
the tiny noise fluctuations, getting spuriously high R². The flatness check
short-circuits before any fitting happens.

**The six candidate models:**

```python
_MODELS = [
    ("O(1)",       lambda n, c:    np.full_like(n, c),              0.0, 0),
    ("O(log n)",   lambda n, a, b: a*np.log(np.maximum(n,1))+b,    0.5, 1),
    ("O(n)",       lambda n, a, b: a*n+b,                           1.0, 2),
    ("O(n log n)", lambda n, a, b: a*n*np.log(np.maximum(n,1))+b,  1.5, 3),
    ("O(n²)",      lambda n, a, b: a*n**2+b,                        2.0, 4),
    ("O(n³)",      lambda n, a, b: a*n**3+b,                        3.0, 5),
]
```

Each tuple is (name, function, exponent, complexity_order). `complexity_order`
is used for tie-breaking — lower order = simpler = preferred when R² is close.
`np.maximum(n, 1)` prevents `log(0)` at n=0.

**`scipy.optimize.curve_fit`:**

This is the core math function. It takes a model function `f(n, *params)` and
data arrays `(n_values, latencies)` and uses **Levenberg-Marquardt nonlinear
least squares** to find the parameter values (a, b, c) that minimise the sum
of squared residuals. In plain English: it numerically searches for the best
fit parameters.

```python
popt, _ = scipy_curve_fit(fn, n, y, maxfev=10000)
pred = fn(n, *popt)
```

`popt` is the optimised parameters. `pred` is the predicted latency at each n
using those parameters. `maxfev=10000` sets the maximum number of function
evaluations before giving up.

**R² — coefficient of determination:**

```python
ss_res = np.sum((y_true - y_pred) ** 2)   # sum of squared errors
ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)  # total variance
r2 = 1 - ss_res / ss_tot
```

R²=1.0: the model perfectly predicts every point.
R²=0.0: the model is no better than just predicting the mean every time.
R²<0: the model is actively worse than predicting the mean (terrible fit).

**Tie-breaking — Occam's Razor:**

```python
candidates.sort(key=lambda c: (-c[0], c[1]))  # sort by R² desc, order asc

for r2, order, name, pred, popt in candidates[1:]:
    if best_r2 - r2 <= 0.02 and order < best_order:
        # simpler model within 0.02 R² — prefer it
        best = (r2, order, name, ...)
        break
```

If O(n) achieves R²=0.97 and O(n log n) achieves R²=0.98, they are within
0.02 of each other. We prefer O(n) — the simpler conclusion. This prevents
over-reporting complexity (calling something O(n²) when O(n) fits nearly
as well).

---

## `python/similarity.py` — Vector similarity

### What it does

Takes a query vector and a list of stored vectors, returns cosine similarity
scores ranked highest first.

### Concepts used

**Cosine similarity:**

```python
def cosine_similarity(a, b):
    dot = np.dot(a, b)          # sum of element-wise products
    norm_a = np.linalg.norm(a)  # sqrt(sum of squares) = vector length
    norm_b = np.linalg.norm(b)
    return dot / (norm_a * norm_b)
```

Why cosine instead of Euclidean distance?

Euclidean distance measures the absolute distance between two points in space.
If one endpoint has `breaking_point=100` and another has `breaking_point=50000`,
the Euclidean distance between them is enormous — dominated entirely by the
breaking_point dimension regardless of what the other 4 dimensions say.

Cosine similarity measures the **angle** between two vectors, not their
lengths. Two vectors pointing in the same direction score 1.0 even if one is
much longer than the other. This makes it **scale-invariant** — an endpoint
with exponent=2.0, cliff=8 is considered identical in shape to an endpoint
with exponent=2.0, cliff=8 (same direction), even if their absolute values
differ.

**Zero-vector guard:**

```python
if norm_a == 0 or norm_b == 0:
    return 0.0
```

A zero vector has no direction — the cosine is undefined (division by zero).
We return 0.0 in this case, meaning "no similarity".

**Returning ranked results:**

```python
results = [(i, cosine_similarity(query, stored)) for i, stored in enumerate(stored_vectors)]
results.sort(key=lambda x: x[1], reverse=True)
return [{"index": i, "score": score} for i, score in results]
```

The index returned is the position in the `stored_vectors` array. The Go
server uses this index to look up the corresponding deployment from the list
it sent.

---

## `python/test_sidecar.py` — Python tests

### What it does

13 pytest tests that verify both sidecar endpoints work correctly. Uses
`fastapi.testclient.TestClient` — an in-process HTTP client that calls the
FastAPI app without starting a real server, so tests run in milliseconds.

### What each group tests

**Curve fitting (7 tests):**
- `test_fit_detects_o1` — flat latency array → O(1)
- `test_fit_detects_on` — linear growth → O(n)
- `test_fit_detects_on2` — quadratic growth → O(n²)
- `test_fit_detects_ologn` — logarithmic growth → O(log n)
- `test_fit_detects_onlogn` — linearithmic growth → O(n log n), but accepts O(n)
  because the tie-break rule prefers simpler (O(n log n) and O(n) fit similarly
  on small n ranges)
- `test_fit_tiebreak_prefers_simpler` — given two nearly-equal fits, returns the
  simpler one
- `test_fit_returns_fitted_curve` — response includes predicted curve points

**Similarity (4 tests):**
- `test_similarity_identical_vectors` — same vector against itself → score=1.0
- `test_similarity_ranking` — known rankings verified in order
- `test_similarity_zero_vector_scores_zero` — zero vector → score=0.0 (not NaN)
- `test_similarity_index_preserved` — the index in the result matches the position
  in the input list

---

## `test/demo.ps1` — End-to-end demo

### What it does

PowerShell script that exercises the full stack in one run. It:
1. Checks all three services are up (health checks)
2. Probes `/constant` (should detect O(1))
3. Saves it as deployment v1
4. Probes `/quadratic` (should detect O(n²))
5. Saves it as deployment v2
6. Diffs v1 vs v2 (should say "Complexity degraded from O(1) to O(n²)")
7. Shows the timeline (both in chronological order)
8. Runs a similarity search (v2 should score ~1.0, v1 should score low)

### Why PowerShell

The development machine is Windows. PowerShell's `Invoke-RestMethod` natively
handles JSON — it automatically deserialises the response so you can access
fields with dot notation (`$result.fit_result.complexity_class`). Bash/curl on
Windows would require `jq` for JSON parsing.

**Why `ConvertTo-Json @{...}` instead of a raw string:**

PowerShell hashtables (`@{...}`) are the native way to build JSON payloads.
`ConvertTo-Json` serialises them correctly including nested objects and arrays.
Using raw JSON strings is error-prone (easy to have mismatched quotes or braces).

---

## `.planning/LOGIC.md` — Algorithm reference

The authoritative document for all the math and measurement decisions. If you
change anything in the probe package or Python sidecar, read this first. It
covers: geometric sweep rationale, adaptive settling formula with worked examples,
the full noise source table, curve fitting math, concurrency cliff algorithm,
breaking point definition, memory growth rate heuristic, and cosine similarity
formula with normalisation.

## `.planning/PHASES.md` — Build roadmap

10-phase plan. Each phase has a list of tasks and an exit criterion (a
verifiable test that proves the phase is done). Phases 1–6 are complete.
Phases 7–10 are the React frontend, diff view, drift timeline, and polish.

---

# Key Connections Between Files

```
demo.ps1
  → POST /api/probe
      → probe.Sweep()                (probe/sweep.go)
          → probe.ProbeStep()        (probe/probe.go)   ← fires real HTTP requests
          ← []ProbePoint
      → fingerprint.Build()          (fingerprint/fit_client.go)
          → Python POST /fit         (python/curve_fit.py)
          ← FitResult (class, R²)
          → fingerprint.ConcurrencyCliff()   (fingerprint/fingerprint.go)
          → fingerprint.MemoryGrowthRate()
          → fingerprint.BreakingPointN()
          ← Vector (6 numbers)
      ← SweepResult + Vector + FitResult → JSON response

  → POST /api/deployments
      → store.SaveDeployment()       (store/deployment.go)
          → SQLite INSERT            (store/store.go opened the DB)

  → GET /api/diff?a=1&b=2
      → store.GetDeployment() × 2   (store/deployment.go)
      → buildDeltas(), buildSummary()  (api/diff.go)

  → POST /api/search
      → store.ListDeployments()      (store/deployment.go)
      → Python POST /similarity      (python/similarity.py)
      ← ranked results
```
