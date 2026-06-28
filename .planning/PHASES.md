# AlgoLens — Phase-by-Phase Build Plan

---

## What Already Exists (Do Not Rebuild)

The following is already built and working:
- Go probe engine: `ProbeStep`, `Sweep`, `ProbeConfig`, adaptive settling, HDR histogram
- Python sidecar: `/fit` (curve fitting), `/similarity` (cosine search)
- Go REST API: `POST /api/probe`, `POST /api/deployments`, `GET /api/diff`, `GET /api/timeline`, `POST /api/search`
- Postgres store with `deployments` table
- React frontend (basic UI exists, needs revamp)

Every phase below builds on top of this. Nothing already working gets removed.

---

## Phase 1 — Stress / Concurrency Test (Go + SSE)

**Goal:** Hit one endpoint, ramp concurrency, plot the curve live. No AI.

### What to build
- New Go route: `POST /api/stress`
  - Input: `{endpoint, method, headers, body, concurrency_steps: [1,5,10,25,50,100], timeout_ms}`
  - No `{{n}}` substitution. Static body, real headers, real API key.
  - Loops through each concurrency level: fires that many goroutines simultaneously, collects p50/p95/p99 and error rate
  - Streams each completed step as an SSE event before moving to the next
- New Go route: `GET /api/stress/stream` (SSE endpoint)
  - Client connects, receives one JSON event per completed concurrency step:
    `{concurrency, p50, p95, p99, error_rate, errors, total}`
  - Closes stream when all steps complete or breaking point hit
- Breaking point detection: when error_rate >= 0.5 at any step, emit a `breaking_point` event and stop
- Reuse existing `ProbeStep` — strip out `{{n}}` substitution, pass static body directly

### Exit criterion
Point it at a local test server, run a stress test with 5 concurrency steps, see SSE events arrive in the terminal one by one, verify breaking point detection fires when error rate crosses 50%.

---

## Phase 2 — Deployment Storage Revamp

**Goal:** Every saved run has a user-defined name, tag, and mode label. Supports all 4 modes.

### What to build
- Migrate `deployments` table: add columns `name TEXT`, `tag TEXT`, `mode TEXT`, `session_logs JSONB`, `summary JSONB`
- Update `SaveDeployment` in Go store to accept these new fields
- Update `POST /api/deployments` handler to accept and store them
- `GET /api/deployments` returns the new fields
- Enforce: `name` is required. No unnamed deployments.

### Exit criterion
Save two deployments with different names and modes via the API. Query them back. Both have name, tag, mode, created_at correctly stored.

---

## Phase 3 — Python MCP Server Scaffold

**Goal:** Python FastAPI server gains an MCP endpoint and can talk to Claude with tool use.

### What to build
- New Python module: `agent/mcp.py`
  - Defines one Claude tool: `call_endpoint(method, url, headers, body) → {status, body, latency_ms}`
  - The tool implementation calls the Go probe engine at `http://localhost:8080/internal/probe-once`
- New Go internal route: `POST /internal/probe-once`
  - Fires exactly one HTTP request to the given URL with given method/headers/body
  - Returns `{status_code, body, latency_ms, error}`
  - Not exposed via CORS — internal only, Python calls it
- New Python module: `agent/session.py`
  - `run_session(spec, goal, plan, session_id)` — runs one Claude conversation loop using the MCP tool
  - Claude reads the spec + plan, calls `call_endpoint` repeatedly until goal achieved or turn limit hit
  - Yields SSE events: `{session_id, type: "request"|"response"|"reasoning"|"done", data}`
- Anthropic SDK wired up: reads `ANTHROPIC_API_KEY` from `.env`

### Exit criterion
Send a manually crafted plan to `run_session`, watch Claude call `call_endpoint` at least once against a local server, receive SSE events in the terminal.

---

## Phase 4 — Swagger Spec Ingestion

**Goal:** Python parses a Swagger/OpenAPI spec and gives Claude a clean API map.

### What to build
- New Python module: `agent/spec.py`
  - `load_spec(url_or_path)` — fetches spec from URL or reads from file, returns parsed dict
  - `summarise_spec(spec)` — extracts: list of endpoints, method per endpoint, required params, response shapes, auth requirements
  - Returns a structured summary Claude can read as a system prompt context block
- New Python route: `POST /spec/validate`
  - Input: `{spec_url, base_url, headers}`
  - Fetches spec, checks base URL is reachable, checks auth header works against the first available endpoint
  - Returns `{valid: bool, endpoints: [...], errors: [...]}`
- This is the pre-run validation step — called before any agent is created

### Exit criterion
Post a real public Swagger spec URL to `/spec/validate`. Get back a list of discovered endpoints and a valid/invalid flag. Deliberately pass a bad auth header and get an error back.

---

## Phase 5 — Agent Planning Phase

**Goal:** All N agents collectively plan before anything executes.

### What to build
- New Python route: `POST /agent/plan`
  - Input: `{spec_url, base_url, headers, goal, n_agents}`
  - Calls Claude once with the full spec summary + goal + n_agents
  - Claude returns a JSON array of N agent plans:
    ```json
    [
      {
        "agent_id": 1,
        "persona": "power user",
        "input_slice": "large payloads (500-2000 items)",
        "action_plan": ["POST /auth/login", "POST /search with limit=500", "GET /results/{id}"],
        "success_condition": "receives non-empty results array"
      },
      ...
    ]
    ```
  - No two agents overlap in input slice
  - Returns plans to the frontend for user review before execution
- Plan validation: check all endpoints in each plan exist in the spec
- User can edit plans before approving

### Exit criterion
Call `/agent/plan` with a spec and goal of "test the full search flow with 3 agents." Get back 3 non-overlapping agent plans with distinct personas and action plans. Plans reference only endpoints that exist in the spec.

---

## Phase 6 — Agent Execution + Live SSE Stream

**Goal:** Run N agents concurrently, stream all events to frontend live.

### What to build
- New Python route: `POST /agent/run` (starts execution, returns `session_group_id`)
- New Python route: `GET /agent/stream/{session_group_id}` (SSE stream)
  - Spawns N asyncio tasks, one per agent
  - Each task runs `session.run_session()` with that agent's plan
  - All events from all agents multiplexed onto one SSE stream with `session_id` field
  - SSE event format:
    ```
    data: {"session_id": 2, "type": "request", "method": "POST", "url": "/search", "body": {...}, "t": 1234}
    data: {"session_id": 2, "type": "response", "status": 200, "body": {...}, "latency_ms": 43}
    data: {"session_id": 2, "type": "reasoning", "text": "Got results, now fetching first item..."}
    data: {"session_id": 2, "type": "done", "success": true, "turns": 5, "total_latency_ms": 312}
    data: {"type": "group_done", "success_count": 5, "fail_count": 1}
    ```
- Store full session logs in Postgres: each agent's complete conversation saved as JSONB
- Reconnection: if client disconnects and reconnects with the same `session_group_id`, replay stored events

### Exit criterion
Run 3 agents against a local multi-endpoint test server. Watch all 3 SSE streams interleave in the terminal. Verify all 3 sessions are stored in Postgres after completion. Disconnect and reconnect — get the replay.

---

## Phase 7 — Deployment Comparison

**Goal:** Pick two named deployments, see exactly what changed.

### What to build
- `GET /api/diff?a=:id&b=:id` already exists — extend it:
  - Add per-endpoint latency delta (which specific API call got slower?)
  - Add agent success rate comparison
  - Add turn count comparison (did achieving the goal take more turns?)
- New diff fields in response: `{endpoint_deltas: [{endpoint, avg_latency_a, avg_latency_b, delta}], success_rate_delta, avg_turns_delta}`
- Bottleneck heatmap data: for simulation mode, return per-endpoint average latency across all agents, for both deployments

### Exit criterion
Save two simulation runs with intentionally different latency profiles. Call `/api/diff`. Get back the per-endpoint deltas with the correct slower endpoint identified.

---

## Phase 8 — React Frontend Revamp

**Goal:** Clean, demoable UI. Four modes accessible from a sidebar. Everything live.

### Layout
- Sidebar: mode selector (Stress Test | Simulation | Compare | Search)
- Each mode is a full-page panel

### Mode 1 — Stress Test Panel
- Form: endpoint, method, headers, body, concurrency steps
- "Run" button → connects to SSE stream
- Live chart (Recharts): x-axis = concurrency, y-axis = latency (ms), 3 lines for p50/p95/p99
- Error rate bar below the chart
- Breaking point marker on the chart when detected
- "Save as Deployment" button after run completes

### Mode 2 — Simulation Panel
- Step 1: Swagger spec URL + base URL + headers/API key
- "Validate" button → calls `/spec/validate`, shows discovered endpoints
- Step 2: Goal input + number of agents
- "Generate Plans" → calls `/agent/plan`, shows N agent cards with their personas and action plans
- User can review/edit plans
- "Run Simulation" → starts execution
- N live panels (cards), each showing real-time conversation stream for one agent
- Dropdown to expand any single agent to full-screen
- "Save as Deployment" after all agents complete

### Mode 3 — Compare Panel
- Two deployment selectors (searchable dropdown by name/tag)
- Side-by-side metric cards with delta indicators (↑ red, ↓ green, = grey)
- Latency curve overlay chart (two lines, one per deployment)
- Per-endpoint latency heatmap (simulation mode deployments)
- Plain English summary

### Mode 4 — Search Panel
- "Use latest run" or select a specific deployment
- "Find Similar" button → calls `/api/search`
- Ranked result cards: name, tag, date, similarity percentage
- Colour coding: > 90% = red flag, 70–90% = yellow, < 70% = neutral

### Shared components
- Deployment save modal: name (required), tag (optional), notes
- SSE connection hook: handles connect, reconnect, event parsing
- Live status indicator: "3/6 agents complete"

### Exit criterion
Full demo run: validate a spec → generate plans → run 3 agents → watch live panels → save deployment → compare to a previous run → similarity search finds it. No console errors. No broken states.

---

## Phase 9 — Polish + Integration

**Goal:** Production-quality feel. No rough edges.

### Tasks
- Pre-run validation gate: "Run" buttons disabled until all required fields are filled
- Error surfaces as toast notifications (not silent failures)
- Loading skeletons for all async operations
- Go server waits for Python sidecar health before accepting requests (startup order)
- CORS locked down for production (not wildcard `*`)
- Postgres connection pooling configured correctly
- `.env.example` with all required variables documented
- README: quickstart in 5 commands
- End-to-end smoke test script: stress test + simulation + save + compare + search

### Exit criterion
Follow the README on a clean machine. Full smoke test passes. Demo video recorded.

---

## Build Order Summary

```
Phase 1  →  Stress / Concurrency Test (Go SSE)          [extends existing probe]
Phase 2  →  Deployment Storage Revamp (name + JSONB)     [extends existing store]
Phase 3  →  Python MCP Server Scaffold                   [new]
Phase 4  →  Swagger Spec Ingestion + Validation          [new]
Phase 5  →  Agent Planning Phase                         [new]
Phase 6  →  Agent Execution + Live SSE Stream            [new]
Phase 7  →  Deployment Comparison (extended diff)        [extends existing diff]
Phase 8  →  React Frontend Revamp (all 4 modes)          [revamp existing frontend]
Phase 9  →  Polish + Integration                         [final]
```

Each phase has one clear exit criterion. Nothing starts until the previous criterion passes.

---

## Tech Stack Reference

| Layer | Tech | Version |
|---|---|---|
| Go backend | net/http, hdrhistogram | Go 1.22+ |
| Python backend | FastAPI, Anthropic SDK, SciPy, NumPy | Python 3.11+ |
| Frontend | Next.js, Recharts, Tailwind | Node 20+ |
| Database | PostgreSQL | 15+ |
| AI | Claude (via Anthropic API) | claude-sonnet-4-6 |
| Streaming | SSE (server-sent events) | — |
