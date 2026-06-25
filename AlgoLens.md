# AlgoLens — Behavioral Complexity Fingerprinting for HTTP Endpoints

> Unit tests catch wrong answers. Load tests catch slow systems. AlgoLens catches the thing in between — when your code is still correct, still passing tests, but its algorithmic behavior silently degraded between deployments.

---

## The Problem

Every engineering team has three layers of safety:

- **Unit tests** — does the code return the right answer?
- **Integration tests** — do the services talk to each other correctly?
- **Load tests** — can the system handle traffic?

**None of these catch algorithmic regression.**

A developer refactors a search function. All 47 unit tests pass. Staging looks fine. Deploys to prod. Three days later at 3am, load spikes, the endpoint crawls, PagerDuty fires. Postmortem says *"the refactor introduced an O(n²) loop."*

Nobody caught it — because no tool was watching the **shape** of the behavior. Only the outcome.

### The Three Real-World Scenarios This Hits

**Scenario 1 — The Innocent Refactor**
Dev cleans up a database query. Accidentally changes a single indexed lookup into a full table scan. O(1) → O(n). Passes all tests. AlgoLens fingerprint comparison immediately flags: *"this endpoint's complexity class changed after this deployment."*

**Scenario 2 — The Third Party Regression**
You depend on an external API. They push an update silently. Your code didn't change. But their endpoint's fingerprint changed — it used to scale linearly, now it doesn't. You know before your users do.

**Scenario 3 — The Gradual Degradation**
Nobody refactored anything. But over 6 months, data volume grew 10x. An endpoint that was fine at 1k records is now being called with 50k. The fingerprint drift over time shows exactly when it crossed from acceptable to dangerous.

---

## The Core Idea

Algorithms leave behavioral fingerprints.

When you run an endpoint against increasing input sizes and concurrency levels, the way its latency and memory scale **is** a fingerprint. An O(n²) endpoint doesn't just feel slow — it produces a specific curve shape that is mathematically distinct from O(n log n) or O(n).

**AlgoLens captures that curve, stores it per deployment, and compares it across versions.**

The question is never "is it slow right now." The question is: **"did the shape change?"**

---

## Workflow

### Step 1 — Point AlgoLens at an Endpoint

The user provides:
```
endpoint:  POST /api/search
payload:   { "query": "...", "limit": <n> }
variable:  limit (this is what scales)
range:     n = [10, 50, 100, 500, 1000, 5000, 10000]
concurrency levels: [1, 10, 50, 100, 200]
```

AlgoLens hits the endpoint across all combinations of input size and concurrency. This is the **probing sweep.**

### Step 2 — Extract the Fingerprint

From the sweep results, AlgoLens extracts:

```
latency curve:        O(n²)         ← fitted from time vs input size
memory growth:        linear         ← from response size + allocation signals
concurrency cliff:    ~150 req/s    ← where latency starts spiking non-linearly
breaking point:       ~8k records   ← extrapolated from curve fit
syscall pattern:      read-heavy    ← from response time distribution shape
```

This vector is the **behavioral fingerprint** of the endpoint at this moment.

### Step 3 — Mark as a New Deployment (Manual Trigger)

> **Critical design decision:** AlgoLens does not auto-store every run.

Every time you probe an endpoint, the result is shown to you in the UI. It is **not** stored in the database automatically.

When you are ready — after a real deployment, a significant refactor, or a version release — you explicitly click **"Save as Deployment"** in the UI and tag it:

```
deployment:   v2.3.1
date:         2026-06-25
endpoint:     POST /api/search
notes:        refactored search indexing logic
```

Only at this point does the fingerprint get written to the database. This keeps the history clean — one fingerprint per deployment, not one per run.

### Step 4 — Compare Across Deployments

Once you have two or more saved deployments, AlgoLens can:

- **Diff two specific versions** — side by side curve comparison, delta in complexity class, shift in breaking point
- **Find the closest deployment to current behavior** — using vector similarity search across all stored fingerprints, identify which past version this endpoint is behaving most like
- **Show drift over time** — plot the fingerprint vector across all deployments chronologically, surface when and where behavior shifted

### Step 5 — Surface the Insight

The UI presents:

```
ALERT: Behavioral regression detected

  v2.3.0  →  v2.3.1

  Complexity:      O(n log n)  →  O(n²)       ⚠️ degraded
  Concurrency cliff: 300 req/s  →  150 req/s   ⚠️ halved
  Breaking point:  15k records →  8k records   ⚠️ dropped

  Closest historical match: v1.8.2 (92% similar)
  That version was rolled back on 2025-11-14 for performance issues.
```

---

## Features

### 1. Behavioral Probing Engine
- Hits the endpoint with configurable input sizes and concurrency levels
- Supports REST endpoints (POST/GET with variable payload)
- Extracts latency percentiles (p50, p95, p99) at each probe point
- Fits the curve to known complexity classes using least-squares regression

### 2. Fingerprint Extraction
- Time complexity class (O(1), O(log n), O(n), O(n log n), O(n²))
- Memory growth rate
- Concurrency cliff detection
- Breaking point extrapolation
- Read/write pattern from response distribution

### 3. Deployment-Scoped Storage
- Fingerprints are **only stored on explicit user action** ("Save as Deployment")
- Each saved fingerprint is tagged with version, date, and optional notes
- One fingerprint per deployment — clean, intentional history

### 4. Version Diff
- Select any two saved deployments
- Side-by-side curve overlay
- Delta report: what changed, by how much, in which direction
- Plain English summary of the regression or improvement

### 5. Closest Release Finder (Reverse Search)
- Given the current fingerprint, search all stored deployment fingerprints using **cosine similarity** on the fingerprint vector
- Returns the top 3 closest historical versions ranked by similarity score
- Useful for: *"this behavior looks familiar — which version did we see this before?"*
- Especially powerful when a regression matches a previously rolled-back deployment

### 6. Drift Timeline
- Chronological plot of fingerprint vectors across all saved deployments
- Visual indicator of when complexity class changed
- Highlights the exact deployment where drift began

---

## How the Reverse Search Works

Each fingerprint is stored as a vector:

```
[
  complexity_exponent,      # 1.0 = O(n), 2.0 = O(n²), 0.0 = O(1)
  memory_growth_rate,       # slope of memory vs input size
  concurrency_cliff,        # req/s at which latency spikes
  breaking_point,           # input size at which p99 > threshold
  read_write_ratio          # 0.0 = write-heavy, 1.0 = read-heavy
]
```

When you want to find the closest historical version to a current fingerprint, AlgoLens computes **cosine similarity** between the current vector and all stored vectors.

```
similarity(A, B) = (A · B) / (|A| × |B|)
```

Returns ranked results:

```
1. v1.8.2  —  92% similar  (rolled back Nov 2025)
2. v2.1.0  —  87% similar  (stable for 3 months)
3. v2.0.4  —  71% similar
```

This is the **reverse search** — you don't search by name or date. You search by behavior.

---

## Tech Stack

### Go — Hot Path
Everything performance-sensitive runs in Go.

| Component | Technology | Detail |
|---|---|---|
| Probing Harness | Go | goroutines + `sync.WaitGroup` + channels for result collection |
| Latency Collection | Go (HDR Histogram) | p50/p95/p99 via `hdrhistogram` library |
| Concurrency Sweep Controller | Go | drives all n × concurrency combinations in parallel |
| Fingerprint Vector Builder | Go | normalizes all signals into the fixed-length vector |
| REST API | Go (net/http / Chi) | serves the frontend, orchestrates probing and storage |

### Python — Math Layer Only
Pure computation, no I/O in the hot path. Called by Go as a **FastAPI sidecar** over localhost HTTP.

| Component | Technology | Detail |
|---|---|---|
| Curve Fitter | SciPy (least squares) | fits latency matrix → complexity class + exponent |
| Reverse Search | NumPy | cosine similarity across all stored fingerprint vectors |

### Storage & Frontend

| Component | Technology | Purpose |
|---|---|---|
| Fingerprint Store | SQLite (upgradeable to PostgreSQL) | stores deployment-scoped fingerprint vectors |
| UI | React | probe config, deployment tagging, diff view, timeline |
| Visualization | Recharts | curve overlays, drift timeline, similarity scores |

---

## What You Actually Build

- [ ] Probing harness — hits endpoint at n × concurrency combinations, collects p50/p95/p99
- [ ] Curve fitter — least squares regression to extract complexity class and coefficients
- [ ] Fingerprint vector builder — normalizes all signals into a fixed-length vector
- [ ] Deployment store — save fingerprint only on explicit user action with version tag
- [ ] Cosine similarity search — finds closest historical deployment to current fingerprint
- [ ] Version diff view — side by side curve overlay + delta report
- [ ] Drift timeline — chronological plot of fingerprint evolution across deployments
- [ ] Plain English explainer — translates the diff into a human-readable regression summary

---

## Resume Framing

> *"Built AlgoLens — a behavioral complexity fingerprinting tool for HTTP endpoints. Probes endpoints across input sizes and concurrency levels, fits latency curves to complexity classes (O(n), O(n²), etc.), and stores fingerprints per deployment. Uses cosine similarity reverse search to identify which historical deployment a current behavioral profile most closely matches. Surfaces algorithmic regressions that unit tests and load tests cannot catch."*

---

## The One-Line Summary

> **AlgoLens fingerprints how your endpoints scale, stores one snapshot per deployment, and tells you exactly when and where the algorithmic behavior changed — before your users do.**
