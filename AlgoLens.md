# AlgoLens — API Behavior Testing Platform

> Unit tests catch wrong answers. Load tests catch slow systems. AlgoLens catches what both miss — how your API actually behaves under real pressure, across deployments, with intelligent simulated users.

---

## The Problem

Every engineering team tests their code. Nobody tests how their API *behaves*.

- **Unit tests** — does the function return the right value?
- **Integration tests** — do the services talk to each other?
- **Load tests** — can the system handle traffic?

None of these answer:
- What happens when 50 users hit this endpoint at the same time?
- Did the behavior change after last week's deploy?
- Can this endpoint handle a real multi-turn conversation flow?
- What complexity class is this endpoint — O(n) or O(n²)?

AlgoLens answers all of these. One tool, four modes.

---

## The Four Modes

### Mode 1 — Stress / Concurrency Test

The simplest mode. No AI. Pure measurement.

User provides:
- Endpoint URL
- HTTP method
- Headers and API key
- Request body (static)
- Number of concurrent requests to ramp through

AlgoLens hits the endpoint with progressively increasing concurrency, plots the latency curve live, and finds exactly where the server breaks. Output: p50/p95/p99 per concurrency level, error rate curve, the breaking point.

**Who uses it:** Any developer who wants to know how many concurrent users their endpoint can handle before it degrades.

---

### Mode 2 — Agentic Simulation

The headline feature. Claude simulates real users interacting with your API.

User provides:
- Swagger / OpenAPI spec URL or file
- Base URL and API key / auth headers
- A goal in plain English ("test the full chat flow", "run a checkout simulation")
- Number of agents (N)

**Pre-run validation**: before anything fires, AlgoLens checks that all required fields are present, the spec is reachable, and the auth header is valid. Catches mistakes before spending API cost.

**The Planning Phase** (what makes this different):

Before any agent fires a single request, all N agents collectively plan:
- Each agent is assigned a non-overlapping slice of the input space
- Each agent picks a distinct persona (power user, casual user, adversarial tester, first-time user)
- Each agent defines its action plan — what endpoints to call, in what order, what to do with the responses
- Plans are locked and shown to the user before execution begins

This prevents two agents from doing the same thing, ensures the full input space is covered, and makes the results comparable across agents.

**The Execution Phase**:

All N agents run concurrently. Each agent is a Claude conversation loop:
1. Claude reads the Swagger spec to understand every available endpoint
2. Claude fires a request using the `call_endpoint` tool (method, URL, headers, body)
3. Go executes the actual HTTP request and returns `{status, body, latency_ms}`
4. Claude reads the response, decides what to do next
5. Repeat until the goal is achieved or the session hits a limit

All N agent sessions stream live to the frontend via SSE. The user sees N panels simultaneously, with a dropdown to focus on any single one. Every request, every response, every piece of Claude's reasoning is visible in real time.

Results are stored in Postgres for comparison across deployments.

---

### Mode 3 — Deployment Comparison

Every run in AlgoLens can be saved with a user-defined name and tag (e.g. "v2.3.1", "post-refactor", "pre-launch").

Pick any two saved deployments. AlgoLens shows:
- Side-by-side latency curves
- Delta in every metric (concurrency cliff, breaking point, error rate, complexity class)
- Plain English summary of what changed and in which direction
- Per-step latency heatmap across agents (which endpoint call got slower?)

**Use case:** You deploy a change on Friday. You run the same simulation scenario on the new deploy. You compare it against last Wednesday's run. You see exactly what got faster, what got slower, and whether the breaking point shifted.

---

### Mode 4 — Similarity Search

Given the fingerprint of your most recent run, find which stored deployment it most closely resembles.

AlgoLens stores each deployment as a fingerprint vector:
```
[complexity_exponent, memory_growth_rate, concurrency_cliff, breaking_point, error_rate]
```

It computes cosine similarity between the current vector and every stored deployment, returns ranked results with similarity scores and deployment tags.

**Use case:** Something feels off with the new deploy. Similarity search says it's 94% similar to "v1.8.2 — the one we rolled back in November." That's a flag worth investigating.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      React Frontend                      │
│  4 mode panels | live SSE agent streams | deployment UI  │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP + SSE
          ┌─────────────────┼──────────────────┐
          │                 │                  │
┌─────────▼──────┐  ┌───────▼────────┐  ┌─────▼──────────┐
│   Go Server    │  │  Python Server  │  │    Postgres     │
│                │  │  (FastAPI)      │  │                 │
│ Probe engine   │  │                 │  │ deployments     │
│ HTTP firing    │  │ MCP server      │  │ sessions (JSONB)│
│ HDR histograms │  │ Claude agent    │  │ stress results  │
│ p50/p95/p99    │  │ orchestration   │  │   (JSONB)       │
│ SSE relay      │  │ Swagger parsing │  │                 │
│                │  │ Curve fitting   │  └────────────────┘
│                │  │ Similarity math │
└────────────────┘  └────────────────┘
                           │
                    Anthropic API
                    (Claude agent loop)
```

### Responsibility Split

| Layer | Responsibility | Technology |
|---|---|---|
| Go | HTTP probing only — fire requests, collect latency, p50/p95/p99 | Go + HDR histogram |
| Python | All intelligence — Claude MCP, agent orchestration, Swagger parsing, curve fitting, similarity | FastAPI + Anthropic SDK |
| React | UI — 4 mode panels, live SSE agent panels, deployment management | Next.js + Recharts |
| Postgres | All storage — structured metrics + JSONB for session logs and stress results | PostgreSQL |

### Why Go only for probing

Go fires HTTP requests faster and with better goroutine control than Python. For accurate latency measurement at high concurrency, you want Go's lightweight goroutines, not Python's GIL-constrained threads. Every nanosecond of probe overhead contaminates the measurement.

### Why Python for the AI layer

The Anthropic SDK, MCP protocol, SciPy curve fitting, and NumPy cosine similarity are all first-class in Python. No reason to reimplement any of this in Go.

### Why Postgres for everything

Postgres JSONB handles arbitrary document storage (agent session logs, variable API responses) with the same performance as MongoDB, without running a second database. Structured data (deployment tags, fingerprint vectors) lives in normal columns alongside JSONB columns for the flexible stuff.

---

## The Agent Planning Phase — Why It Matters

Without a planning phase, N agents all do the same thing. They pick the same inputs, follow the same flow, and produce N copies of the same data point. Useless for comparing behavior across the input space.

With a planning phase, before a single request fires, all N agents agree on:

**Input distribution**: Agent 1 handles small payloads, Agent 2 handles medium, Agent 3 handles large, Agent 4 handles edge cases. Full coverage, no overlap.

**Persona assignment**: Agent 1 is a power user who sends complex requests. Agent 2 is a first-time user who sends minimal fields. Agent 3 is adversarial — tries unexpected values. Agent 4 is a casual user who makes mistakes.

**Action plans**: Each agent defines the sequence of endpoint calls it will make, what it will extract from each response, and what counts as "done." This is locked before execution so the latency data is clean — no agent changes strategy mid-run.

The result: 6 agents produce 6 distinct, non-overlapping test scenarios. The aggregate picture is a complete behavioral map of the endpoint, not 6 copies of the same request.

---

## Data Flow — Agentic Simulation

```
User input:
  Swagger spec URL, base URL, auth headers, goal, N agents

          ↓
Pre-run validation (Python)
  - Spec reachable?
  - Auth header valid?
  - All required fields present?
  → Block and report if anything missing

          ↓
Planning Phase (Python → Claude)
  - Claude reads full Swagger spec
  - Generates N distinct agent plans
  - User reviews plans before execution starts

          ↓
Execution Phase (N goroutines in Go + N Claude loops in Python)
  For each agent concurrently:
    Claude decides → Go fires HTTP → result back to Claude → repeat
    Every event streams via SSE to frontend

          ↓
Results stored in Postgres (JSONB)
  - Full conversation log per agent
  - Latency per endpoint call
  - Success/failure per session

          ↓
Fingerprint vector built (Python)
  - Complexity class from curve fit
  - Concurrency cliff, breaking point
  - Stored as deployment (user names it)
```

---

## What Gets Stored Per Deployment

```
deployments table:
  id              BIGSERIAL
  name            TEXT          ← user-defined, e.g. "v2.3.1-post-refactor"
  tag             TEXT          ← optional label
  mode            TEXT          ← "stress" | "simulation" | "fingerprint"
  endpoint        TEXT
  created_at      TIMESTAMPTZ
  fingerprint     JSONB         ← vector for similarity search
  sweep_result    JSONB         ← raw latency curve
  session_logs    JSONB         ← full agent conversations (simulation mode only)
  summary         JSONB         ← success rate, avg turns, avg latency
  notes           TEXT
```

---

## Resume Framing

> *"Built AlgoLens — an API behavior testing platform. Mode 1: concurrent stress testing with live latency curve plotting and breaking point detection. Mode 2: agentic simulation where N Claude agents (via MCP + Anthropic API) collectively plan input distribution and personas before executing parallel multi-turn API sessions, all streamed live via SSE. Mode 3: deployment diff comparing behavioral fingerprints across tagged versions. Mode 4: cosine similarity reverse search identifying which past deployment the current behavior most closely matches. Stack: Go for the HTTP probe engine, Python FastAPI for Claude orchestration and curve fitting, Next.js frontend, Postgres with JSONB for session storage."*

---

## One-Line Summary

> **AlgoLens puts real intelligence behind your API tests — from raw stress curves to multi-agent simulations that behave like actual users, with full deployment history to track exactly when and where behavior changed.**
