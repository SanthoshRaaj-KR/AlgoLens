# AlgoLens — How to Run

## Prerequisites

- Go 1.22+
- Python 3.11+
- Node 18+
- A Supabase project (free tier is fine)

---

## One-time setup

### 1. Set DATABASE_URL

Copy `.env.example` to `go/.env` and fill in your Supabase connection string:

```powershell
Copy-Item .env.example go\.env
# Edit go\.env and set DATABASE_URL to your Supabase URI:
# DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres
```

Find the URI in: Supabase dashboard → Project Settings → Database → Connection string (URI tab).

The `deployments` table is created automatically on first run — no manual migration needed.

### 2. Install frontend dependencies

```powershell
cd web
npm install
```

---

## Port already in use? (common on Windows after a crash)

```powershell
# Replace 8001 with 8080, 9000, or 3000 as needed
$p = (netstat -ano | findstr ":8001 " | Where-Object { $_ -match "LISTENING" }) -replace '.*\s(\d+)$','$1'
Stop-Process -Id $p -Force
```

---

## Start order (4 terminals)

Services must start in this order: Python sidecar first, then Go (waits for sidecar), then frontend.

### Terminal 1 — Python sidecar

```powershell
cd python
.\.venv\Scripts\Activate.ps1
uvicorn main:app --port 8001 --reload
```

Verify: `curl http://localhost:8001/health` → `{"status":"ok"}`

### Terminal 2 — Go API server

```powershell
cd go
go run ./cmd/server
```

Reads `go/.env` automatically. Polls sidecar until healthy, then connects to Supabase and starts on `:8080`.

Verify: `curl http://localhost:8080/health` → `{"status":"ok"}`

### Terminal 3 — Next.js frontend

```powershell
cd web
npm run dev
```

Opens on `http://localhost:3000`. Talks to the Go API on `:8080`.

### Terminal 4 (optional) — Test server with known complexity

```powershell
cd go
go run ./test/server
```

Runs on `:9000`. Use these URLs in the Probe page:
- `http://localhost:9000/constant?n={{n}}` → O(1)
- `http://localhost:9000/linear?n={{n}}` → O(n)
- `http://localhost:9000/quadratic?n={{n}}` → O(n²)

---

## Run tests

```powershell
# Go — store/API tests need DATABASE_URL set
cd go
go test ./... -timeout 120s

# Python sidecar
cd python
.\.venv\Scripts\Activate.ps1
python -m pytest test_sidecar.py -v
```

---

## What each service does

| Service | Port | Role |
|---|---|---|
| Python sidecar | 8001 | Curve fitting (scipy), cosine similarity (numpy) |
| Go API server | 8080 | HTTP probing, sweep orchestration, Postgres store, REST API |
| Next.js frontend | 3000 | UI — probe, deployments, diff, timeline, search |
| Test server | 9000 | Fake endpoints with known O(1)/O(n)/O(n²) behaviour |

---

## REST API reference

All endpoints on `http://localhost:8080`.

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/api/probe` | Run sweep + fingerprint. Does **not** save. |
| POST | `/api/deployments` | Save a fingerprint result |
| GET | `/api/deployments?endpoint=` | List all deployments (newest first) |
| GET | `/api/deployments/{id}` | Fetch one deployment |
| GET | `/api/diff?a={id}&b={id}` | Field deltas + plain-English regression summary |
| GET | `/api/timeline?endpoint=` | All deployments chronologically (oldest first) |
| POST | `/api/search` | Body: `{fingerprint_vector}` — ranked cosine similarity results |

---

## Phase status

| Phase | Status | What it built |
|---|---|---|
| 1 | Done | Go + Python scaffold, health endpoints |
| 2 | Done | Probing harness (ProbeStep, warmup, HDR histogram) |
| 3 | Done | Sweep controller (n × concurrency matrix, adaptive settling, retry) |
| 4 | Done | Python sidecar (curve fitting, similarity, 13 tests) |
| 5 | Done | Fingerprint vector builder (cliff, growth rate, breaking point) |
| 6 | Done | Full REST API (probe, deployments, diff, timeline, search) |
| 7 | Done | Next.js frontend — probe form, results, save deployment |
| 8 | Done | Diff view — delta table, curve overlay, plain-English summary |
| 9 | Done | Timeline drift chart, cosine similarity search |
| 10 | In progress | Polish, error handling, integration |
