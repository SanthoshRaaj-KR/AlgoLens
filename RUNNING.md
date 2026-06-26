# AlgoLens — How to Run

## Prerequisites

- Go 1.22+
- Python 3.11+
- Node 18+ (frontend, not yet needed)

---

## Start order (manual)

Services must start in this order because the Go server waits for the
Python sidecar to be healthy before it proceeds.

### 1. Python sidecar (terminal 1)

```powershell
cd python
.\.venv\Scripts\Activate.ps1          # activate venv
uvicorn main:app --port 8001 --reload
```

Verify: `curl http://localhost:8001/health`
Expected: `{"status":"ok"}`

### 2. Go API server (terminal 2)

```powershell
cd go
go run ./cmd/server
```

The server polls `localhost:8001/health` every second (up to 30s).
Once it sees OK it opens SQLite, wires routes, and starts on `:8080`.

Verify: `curl http://localhost:8080/health`
Expected: `{"status":"ok"}`

---

## Run tests

### Go (all packages)

```powershell
cd go
go test ./... -timeout 120s
```

### Python sidecar

```powershell
cd python
.\.venv\Scripts\Activate.ps1
python -m pytest test_sidecar.py -v
```

---

## Manual smoke test — curve fitting

With the sidecar running on port 8001:

```powershell
# Should return O(n²) with R² > 0.99
$body = '{"n_values":[1,2,4,8,16,32,64,128,256,512,1024],"latencies":[1.0001,1.0004,1.0016,1.0064,1.0256,1.1024,1.4096,2.6384,7.5536,27.2144,105.8576]}'
Invoke-RestMethod -Method Post -Uri http://localhost:8001/fit -Body $body -ContentType "application/json" | ConvertTo-Json
```

---

## What each service does

| Service | Port | Role |
|---|---|---|
| Python sidecar | 8001 | Curve fitting (scipy), cosine similarity (numpy) |
| Go API server | 8080 | HTTP probing, sweep orchestration, SQLite store, REST API |
| React frontend | 5173 | UI (not yet built) |

---

## SQLite database

The Go server creates `go/algolens.db` on first run (WAL mode).
The `deployments` table holds all saved fingerprint results.
No data is written automatically — only when you explicitly call
`POST /api/deployments` (Phase 6).

---

## REST API reference

All endpoints on `http://localhost:8080`.

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/api/probe` | Run a sweep + fingerprint. Body: `{endpoint, method, payload_template, input_sizes, concurrency_levels, timeout_ms}`. Returns sweep points + fingerprint vector + fit result. **Does not save.** |
| POST | `/api/deployments` | Save a fingerprint. Body: `{endpoint, version, notes, fingerprint_vector, fitted_curve, sweep_result}` |
| GET | `/api/deployments?endpoint=` | List all deployments for an endpoint (newest first) |
| GET | `/api/deployments/{id}` | Fetch one deployment by ID |
| GET | `/api/diff?a={id}&b={id}` | Field-level delta + plain-English regression summary between two deployments |
| GET | `/api/timeline?endpoint=` | All deployments for an endpoint in chronological order (oldest first) |
| POST | `/api/search` | Body: `{fingerprint_vector}`. Returns all stored deployments ranked by cosine similarity |

### Example: run a probe

```powershell
$body = '{"endpoint":"http://localhost:9000/api?n={{n}}","method":"GET","input_sizes":[1,2,4,8,16],"concurrency_levels":[1,2],"timeout_ms":2000}'
Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/probe -Body $body -ContentType "application/json"
```

## Phases complete

| Phase | Status | What it built |
|---|---|---|
| 1 | Done | Go server scaffold, SQLite schema, health endpoints |
| 2 | Done | Go probing harness (ProbeStep, warmup, adaptive settling) |
| 3 | Done | Go sweep controller (n × concurrency matrix, retry, breaking-point stop) |
| 4 | Done | Python sidecar (curve fitting, similarity, 13 tests) |
| 5 | Done | Fingerprint vector builder (cliff, growth rate, breaking point) + SQLite CRUD |
| 6 | Done | Full REST API (probe, deployments, diff, timeline, search) |
| 7–10 | Next | React frontend, diff view, timeline chart, polish |
