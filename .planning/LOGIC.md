# AlgoLens — Core Algorithm & Logic Reference

This document is the authoritative explanation of every piece of math and
decision logic used in AlgoLens. Read this before touching Phase 2–5 code.

---

## 1. The Central Idea

AlgoLens answers one question:

> **"How does this endpoint's latency grow as its input size grows?"**

That growth shape *is* the algorithmic complexity class of the code running
behind the endpoint — measured from the outside, without source access.

We do this by:
1. Sending requests with increasing "input sizes" (n = 1, 2, 4, 8 … 2048)
2. Recording the latency at each n
3. Fitting candidate mathematical curves to the (n, latency) data
4. Picking the curve that fits best → that's the complexity class

---

## 2. What "n" Means

n is a **problem-size parameter** substituted into the request. The user
configures a payload template like:

```
POST /api/search   body: {"limit": {{n}}}
GET  /api/sort?size={{n}}
```

AlgoLens replaces `{{n}}` with 1, 2, 4, 8 … at each sweep step.

This makes n represent whatever the endpoint treats as its "work unit" —
number of records, list length, page size, tree depth, etc.

---

## 3. The Sweep Design

### 3a. Exponential (geometric) progression

We do NOT use a linear sweep (1, 2, 3, 4 …). We use a **geometric sweep**:

```
n = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]
```

Why geometric?

- An O(n²) endpoint at n=1 takes 0.001ms. At n=1024 it takes ~1000ms.
  A linear sweep spends 90% of its steps in the flat region where nothing
  interesting happens.
- A geometric sweep spreads samples evenly across the *shape* of the curve,
  giving curve-fitting enough dynamic range to distinguish O(n) from O(n²).
- It also naturally tests multiple orders of magnitude, which is where
  complexity differences become visible.

### 3b. Samples per step

At each n we fire **k requests** (default k = 5) and take the **p50
(median)** for curve fitting. We also record p95 and p99 for concurrency
cliff and breaking point analysis.

Why median and not mean?
- Outliers from GC pauses, OS scheduling, or cold caches skew the mean.
- The median is robust: 1 bad sample out of 5 doesn't move it.

### 3c. Warmup

The first W requests (default W = 3) at n=1 are discarded. They catch:
- JIT warm-up in the target runtime
- Connection pool initialization
- OS-level socket overhead

### 3d. Settling delay — adaptive, not fixed

**The problem with a fixed delay:**
A flat 200ms is wrong in both directions.
- Too short for a slow endpoint: if p99 at n=256 was 800ms, there are still
  in-flight requests, queued threads, and TCP TIME_WAIT sockets when we
  start n=512. We measure the tail of the previous step, not the start of
  the new one → **false high latency** at high n → curve looks steeper than
  it is → wrong complexity class reported.
- Too long for a fast endpoint: if p99=2ms, waiting 200ms per step adds
  minutes to a sweep for no reason.

**The fix — adaptive settling:**

After each step completes, wait:
```
settle_ms = max(MIN_SETTLE_MS, SETTLE_MULTIPLIER × p99_of_last_step)
```

Defaults:
- `MIN_SETTLE_MS = 300` — floor so fast endpoints still get breathing room
- `SETTLE_MULTIPLIER = 3` — 3× the worst-case response time of the last step

Examples:
| Last step p99 | Settle wait |
|---|---|
| 2ms (fast API) | 300ms (floor wins) |
| 100ms | 300ms (floor wins) |
| 200ms | 600ms (multiplier wins) |
| 1000ms | 3000ms (3s drain) |
| 3000ms (saturated) | 9000ms (9s drain) |

This ensures that by the time we fire the first request of the next step,
the server has had at least 3× its own worst response time to drain queues,
complete lingering work, and let GC run.

**Per-step warmup requests:**

In addition to the settling delay, the first `STEP_WARMUP = 2` requests at
each new n value are discarded (not counted in the k samples). This covers:
- CPU frequency scaling recovering after a quiet settle period
- OS scheduler re-warming the process
- Any caching effects specific to this n value

So the full per-step protocol is:
```
1. Settle:  sleep(max(MIN_SETTLE_MS, 3 × p99_prev))
2. Warmup:  fire 2 requests, discard results
3. Sample:  fire k=5 requests, record all latencies
4. Extract: p50 → curve fitting; p95, p99 → cliff/breaking-point detection
```

**What this prevents:**

| Without adaptive settling | With adaptive settling |
|---|---|
| High-n steps bleed into each other | Each step starts clean |
| Latency curve artificially steep | Curve reflects true algorithmic growth |
| Concurrency cliff detected too early | Cliff detected at true saturation point |
| Breaking point underestimated | Breaking point accurate |

---

## 3e. Noise Sources and Mitigations (full list)

| Noise source | Effect on data | Mitigation |
|---|---|---|
| Cold JIT / connection pool | n=1 latency artificially high | Global warmup (3 req) before sweep starts |
| Previous step bleed-through | High-n latency artificially high | Adaptive settling delay |
| GC pause at sample time | 1–2 outlier samples per step | p50 (median) discards outliers |
| OS scheduler jitter | Random ±1ms spikes | k=5 samples; p50 absorbs |
| Network round-trip | Constant offset on all readings | Doesn't affect curve shape; only shifts intercept |
| Server-side caching | Latency drops as n grows | Cannot prevent externally; document as a known limitation |
| CPU frequency scaling | Slower after idle settle period | Per-step warmup (2 discarded requests) |
| TCP TIME_WAIT sockets | Connection refused at high concurrency | Settle multiplier gives TIME_WAIT (60s) time to clear between steps |

---

## 4. Curve Fitting — The Math

After the sweep we have a list of `(n_i, latency_i)` pairs. We try fitting
each candidate function and pick the one that fits best.

### 4a. Candidate functions

| Class      | Function form               | Note |
|------------|-----------------------------|------|
| O(1)       | `f(n) = c`                  | Constant — latency flat |
| O(log n)   | `f(n) = a·log(n) + b`       | Natural log |
| O(n)       | `f(n) = a·n + b`            | Linear |
| O(n log n) | `f(n) = a·n·log(n) + b`     | Linearithmic |
| O(n²)      | `f(n) = a·n² + b`           | Quadratic |
| O(n³)      | `f(n) = a·n³ + b`           | Cubic (rarely seen but possible) |

We use **scipy.optimize.curve_fit** which does nonlinear least-squares
fitting. It finds the parameters (a, b, c …) that minimise:

```
sum( (latency_i - f(n_i))² )
```

### 4b. R² (coefficient of determination)

After fitting, we compute R² to measure goodness of fit:

```
SS_res = sum( (latency_i - f(n_i))² )    ← residual sum of squares
SS_tot = sum( (latency_i - mean(latency))² )  ← total variance

R² = 1 - (SS_res / SS_tot)
```

R² = 1.0 means perfect fit. R² = 0 means the model explains nothing.

The complexity class with the **highest R²** wins.

### 4c. Tie-breaking rule

If two classes have R² within 0.02 of each other, prefer the **simpler**
(lower-order) class. Occam's razor: if O(n) and O(n log n) fit equally well,
report O(n) — the more conservative finding.

### 4d. Complexity exponent

For the winning class we also report a **complexity exponent** derived from
a generic power-law fit:

```
f(n) = a · n^exponent + b
```

This gives a continuous number (e.g., 1.73) rather than just a label. An
exponent of 1.73 means "worse than O(n), not quite O(n²)" — useful for
tracking drift even when the class label stays the same.

---

## 5. Concurrency Cliff Detection

The concurrency sweep drives the same n across **increasing concurrency
levels** (1, 2, 4, 8, 16, 32 …).

A **concurrency cliff** is the level where p99 latency jumps sharply —
indicating the server hit a hard limit: thread pool full, connection pool
exhausted, lock contention, or I/O queue saturated.

Detection rule:
```
for each consecutive pair (c_i, c_{i+1}):
    if p99[c_{i+1}] > 2.0 × p99[c_i]:
        cliff = c_{i+1}
        break
```

The cliff value stored in the DB is the **concurrency level** at which this
jump occurs. A higher cliff is better (the server handles more concurrent
load before degrading).

---

## 6. Breaking Point Detection

The **breaking point** is the input size n at which the endpoint either:
- Returns a non-2xx status code, OR
- Exceeds the configured timeout threshold (default 5000ms)

We detect it directly during the sweep — when a step produces ≥ 50% error
or timeout rate, we record that n as the breaking point and stop sweeping
further.

We also **extrapolate** a predicted breaking point from the fitted curve:
```
solve f(n) = timeout_threshold  →  n_break
```

Both actual (observed) and predicted breaking points are stored.

---

## 7. Memory Growth Rate

We cannot directly observe server memory from outside. We approximate it
from the **slope of latency growth between steps**:

```
memory_growth_rate = mean( (latency[i+1] - latency[i]) / (n[i+1] - n[i]) )
                     normalised to a 0–1 scale
```

High memory growth rate → latency keeps accelerating → GC pressure or
heap growth is compounding. This is a heuristic, not a direct measurement,
and is labelled as such in the output.

---

## 8. Similarity Search — Cosine Similarity

Each stored deployment has a **fingerprint vector** of 5 dimensions:

```
[complexity_exponent, memory_growth_rate, concurrency_cliff,
 breaking_point, read_write_ratio]
```

To find "which past deployment does this new result look like?", we compute
**cosine similarity** between the new vector and every stored vector:

```
cosine_similarity(A, B) = (A · B) / (||A|| × ||B||)
```

Where:
- `A · B` is the dot product (sum of element-wise products)
- `||A||` is the L2 norm (sqrt of sum of squares)

Result is in [0, 1]. 1 = identical direction, 0 = orthogonal.

We use cosine (not Euclidean) because the dimensions have different scales
(exponent ≈ 1–3, breaking_point ≈ 100–100000). Cosine measures *shape*
similarity regardless of magnitude.

All 5 dimensions are **normalised to [0, 1]** before comparison using the
min/max values across all stored deployments — otherwise breaking_point
would dominate.

---

## 9. Data Flow End-to-End

```
User configures:
  endpoint URL, method, payload template {{n}},
  input sizes, concurrency levels, warmup, samples

             ┌─────────────────────────────────┐
             │         Go: Probe Harness        │
             │  (Phase 2)                        │
             │  Per (n, concurrency):            │
             │  - k goroutines fire requests     │
             │  - collect latency_ns per goroutine│
             │  - HDR histogram → p50, p95, p99  │
             └──────────────┬──────────────────┘
                            │  []ProbePoint
             ┌──────────────▼──────────────────┐
             │       Go: Sweep Controller        │
             │  (Phase 3)                        │
             │  Drives all n × concurrency       │
             │  combinations with semaphore      │
             │  Returns SweepResult              │
             └──────────────┬──────────────────┘
                            │  SweepResult (p50 array)
             ┌──────────────▼──────────────────┐
             │      Python: /fit endpoint        │
             │  (Phase 4)                        │
             │  scipy curve_fit × 6 candidates  │
             │  R² selection + tie-breaking      │
             │  Returns complexity class + curve │
             └──────────────┬──────────────────┘
                            │  FitResult
             ┌──────────────▼──────────────────┐
             │   Go: Fingerprint Vector Builder  │
             │  (Phase 5)                        │
             │  Concurrency cliff from p99 data  │
             │  Breaking point from sweep        │
             │  Memory growth rate heuristic     │
             │  Assembles FingerprintVector      │
             └──────────────┬──────────────────┘
                            │
             ┌──────────────▼──────────────────┐
             │         SQLite Store              │
             │  (Phase 5, user-triggered)        │
             │  SaveDeployment only on explicit  │
             │  user action — never auto-saved   │
             └─────────────────────────────────┘
```

---

## 10. Key Design Decisions & Why

| Decision | Reason |
|----------|--------|
| Geometric sweep, not linear | Exposes curve shape across orders of magnitude |
| p50 for curve fitting | Robust to outliers; p95/p99 for cliff/breaking point only |
| Cosine similarity, not Euclidean | Dimensions have incompatible scales |
| Normalise before cosine | breaking_point otherwise dominates all other dims |
| Tie-break to simpler class | Conservative reporting; avoids false "regression" alerts |
| No auto-save | User must explicitly label a deployment; prevents noise in DB |
| Sidecar for math | scipy/numpy in Python >> doing nonlinear least-squares in Go |
| HDR histogram in Go | O(1) insert, O(log n) percentile, negligible memory |

---

## 11. Limitations (Known & Accepted)

- **n must be a single scalar** in the payload. Multi-dimensional inputs
  (e.g., width × height) are not supported in v1.
- **External latency only.** Network round-trip is included. In local
  dev this is ~0.1ms and negligible; against a remote endpoint it adds a
  constant offset that shifts all values equally (doesn't affect the curve
  shape).
- **Server must be stateless per request.** If the server accumulates state
  across requests (e.g., a growing cache), latency will trend downward as n
  grows — the sweep will misclassify this as O(1) or sub-linear.
- **Memory growth rate is a heuristic.** It is derived from latency
  acceleration, not direct memory measurement. Treat it as a signal, not
  a measurement.
- **Minimum 4 distinct n values required** for curve fitting to be
  meaningful (scipy needs more data points than free parameters).
