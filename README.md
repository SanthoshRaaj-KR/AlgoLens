# AlgoLens

API behavior testing platform for backend developers. Four modes:

| Mode | What it does |
|---|---|
| **Stress Test** | Ramp concurrency, plot p50/p95/p99 live, detect breaking point |
| **Simulation** | Claude agents test your API from a Swagger spec concurrently |
| **Compare** | Side-by-side diff of two saved deployments — fingerprint + sim metrics |
| **Search** | Cosine similarity across all saved runs to find historical matches |

## Quickstart

```bash
# 1. Clone and install
git clone <repo-url> && cd algo-lens
make install

# 2. Copy env vars and fill in DATABASE_URL + ANTHROPIC_API_KEY
cp .env.example go/.env
cp .env.example python/.env   # only ANTHROPIC_API_KEY is used here
cp frontend/.env.local frontend/.env.local  # edit NEXT_PUBLIC_* if needed

# 3. Start everything (opens three terminal windows on Windows)
make dev

# 4. Open the app
start http://localhost:3000
```

That's it. The Go server waits for the Python sidecar to be healthy before accepting requests.

## Architecture

```
Browser (Next.js :3000)
  │
  ├── GET/POST /api/*  →  Go (:8080)   — probe engine, storage, diff, SSE stress stream
  └── POST /agent/*   →  Python (:8001) — Claude agent orchestration, spec parsing
                                │
                                └── POST /internal/probe-once  →  Go (:8081, internal only)
                                                                   fires one HTTP request per agent turn
```

## Requirements

- Go 1.22+
- Python 3.11+
- Node 20+
- PostgreSQL 15+ (or a Supabase project)

## Environment variables

See `.env.example` for all required variables with descriptions.

## Modes in detail

### Stress Test
POST `/api/stress` — provide endpoint URL, HTTP method, optional headers/body, and a comma-separated list of concurrency levels. Streams one SSE event per completed level. Breaking point fires when error rate ≥ 50%.

### Simulation
1. Paste a Swagger/OpenAPI spec URL → validated and parsed
2. Set a goal + number of agents → Claude produces N non-overlapping test plans
3. Review plans → click Run → N agents execute concurrently with live SSE panels
4. Saved to Postgres with full session logs and summary metrics

### Compare
`GET /api/diff?a=:id&b=:id` — returns fingerprint deltas plus simulation-mode extras (per-endpoint latency heatmap, success rate delta, avg turns delta).

### Similarity Search
`POST /api/search` — cosine similarity via Python/NumPy over stored fingerprint vectors. Returns ranked matches with scores.
