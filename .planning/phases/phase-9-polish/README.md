# Phase 9 — Polish + Integration

## Status
**Not started.** Final phase. All features are built and working individually. This phase makes them work together reliably, handles edge cases, and prepares the project for a demo and README.

---

## Goal
Production-quality feel: no silent failures, no broken states on reload, correct startup order, documented setup, and a smoke test that proves everything works end-to-end.

---

## What's Already Done (Reuse)

| What | Where | Note |
|---|---|---|
| `waitForSidecar()` startup health check | `go/cmd/server/main.go` | Already polls Python `/health` before accepting requests. Extend for new port 8081. |
| Error display patterns | Existing frontend pages | Inconsistent currently — standardise to toast pattern |
| `.env` loading | `go/cmd/server/main.go` + `python/main.py` | Add missing vars to `.env.example` |

---

## What to Build

### 1. Frontend: pre-run validation gates

On every page with a "Run" or action button:
- Disable the button until all required fields are filled
- Show inline field errors (not just a toast after submit)
- Fields to validate before enabling:
  - Stress test: endpoint URL (must be a valid URL)
  - Simulation: spec URL, base URL, goal, n_agents > 0
  - Save modal: name (required, non-empty)
  - Diff: both deployment IDs selected
  - Search: at least one vector field non-zero

### 2. Frontend: toast notification system

Add a global toast component (or use an existing library like `sonner` which is lightweight):
- Every API call failure → toast with error message
- Every successful save → toast "Saved as {name}"
- SSE connection error → toast "Live stream disconnected — trying to reconnect"
- Don't use `alert()` or `console.error()` anywhere in production code

### 3. Frontend: loading skeletons

Add skeleton placeholders for all async operations:
- Deployment list on dashboard → skeleton rows while loading
- Agent plan cards while `/agent/plan` is running → skeleton cards
- Diff results while loading → skeleton for both deployment cards + delta table

### 4. Startup order enforcement

Current state: Go waits for Python sidecar on port 8001. Needs update:

```
startup sequence:
  1. Python FastAPI starts on :8001 (curve fit, similarity, agent routes)
  2. Go polls http://localhost:8001/health until 200 (already implemented)
  3. Go starts main server on :8080 (already implemented)
  4. Go starts internal server on :8081 (added in Phase 3)
  5. Frontend dev server on :3000 (Next.js, independent)
```

Add to `go/cmd/server/main.go`: after sidecar health check, also verify Python's new agent routes respond (check `http://localhost:8001/agent/spec/validate` exists — a simple OPTIONS or HEAD request).

### 5. Environment variable documentation

Create `.env.example`:
```bash
# Go server
DATABASE_URL=postgresql://user:password@localhost:5432/algolens
SIDECAR_URL=http://localhost:8001
GO_INTERNAL_PORT=8081

# Python sidecar
ANTHROPIC_API_KEY=sk-ant-...
GO_PROBE_URL=http://localhost:8081

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_PYTHON_URL=http://localhost:8001
```

Update all three services to validate required env vars at startup and exit with a clear error if missing (not a panic or silent empty string).

### 6. CORS tightening

Current: `Access-Control-Allow-Origin: *` (permissive, fine for local dev)
For demo/production: restrict to `localhost:3000` or the configured frontend URL.
Add `ALLOWED_ORIGINS` env var (default `http://localhost:3000`).

### 7. Smoke test script (`scripts/smoke_test.sh` or `scripts/smoke_test.py`)

```bash
#!/usr/bin/env bash
# Smoke test: verifies full E2E flow in under 2 minutes

echo "1. Health checks..."
curl -sf http://localhost:8080/health
curl -sf http://localhost:8001/health

echo "2. Stress test (3 steps against test server)..."
# Start test server if not running
# POST /api/stress with concurrency_steps=[1,5,10], endpoint=http://localhost:9000/linear
# Verify 3 SSE step events received

echo "3. Spec validation..."
# POST /agent/spec/validate with Petstore spec
# Verify valid:true and at least 3 endpoints

echo "4. Plan generation..."
# POST /agent/plan with Petstore spec, goal="list all pets", n_agents=2
# Verify 2 plans returned

echo "5. Save stress deployment..."
# POST /api/deployments with name="smoke-test-stress", mode="stress"
# Capture id

echo "6. Diff (same deployment against itself)..."
# GET /api/diff?a={id}&b={id}
# Verify all deltas are 0

echo "7. Similarity search..."
# POST /api/search
# Verify at least 1 result

echo "All checks passed."
```

### 8. README quickstart

5 commands to get the full stack running:
```bash
git clone https://github.com/SanthoshRaaj-KR/algolens
cd algolens
cp .env.example .env  # fill in DATABASE_URL and ANTHROPIC_API_KEY
make dev              # starts Python sidecar + Go server + test server
cd frontend && npm install && npm run dev
```

`Makefile` with `make dev` target that:
1. Starts Python sidecar (`uvicorn main:app --port 8001`)
2. Starts Go test server (`go run ./test/server/main.go`)
3. Starts Go main server (`go run ./cmd/server/main.go`)
4. All three in parallel with `&`, with `trap SIGINT` to kill all on Ctrl-C

---

## Files to Create / Modify

| File | Action | What changes |
|---|---|---|
| `frontend/src/components/toast.tsx` | **Create** | Global toast component (or install sonner) |
| `frontend/src/app/layout.tsx` | **Modify** | Add ToastProvider wrapper |
| Various frontend pages | **Modify** | Add field validation, disable buttons, add loading skeletons, replace alert/console with toast |
| `go/cmd/server/main.go` | **Modify** | Validate env vars at startup, extend health check sequence |
| `python/main.py` | **Modify** | Validate `ANTHROPIC_API_KEY` at startup |
| `go/internal/api/router.go` | **Modify** | CORS `ALLOWED_ORIGINS` from env |
| `.env.example` | **Create** | All required environment variables documented |
| `Makefile` | **Create** | `make dev` target |
| `scripts/smoke_test.sh` | **Create** | E2E smoke test |
| `README.md` | **Create/Update** | Quickstart in 5 commands |

---

## How It Connects

- **Receives from all previous phases**: everything is built, this phase only improves reliability and UX
- **Produces**: a demoable product

---

## Exit Criterion

1. Follow README on a machine that has never run AlgoLens before. 5 commands, stack starts, no errors in any terminal.
2. `scripts/smoke_test.sh` passes all 7 checks
3. Kill the Python sidecar while the Go server is running → Go returns a clear 503 with message "sidecar unavailable", not a 500 or crash
4. Fill in a stress test form with an invalid URL → "Run" button stays disabled, inline error shown
5. Open the simulation page, close the browser mid-run, reopen and navigate to the same session → all previous events replayed, live events continue
