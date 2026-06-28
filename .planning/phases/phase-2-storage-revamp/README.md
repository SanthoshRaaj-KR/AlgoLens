# Phase 2 — Deployment Storage Revamp

## Status
**Not started.** The `deployments` table and all CRUD operations exist and work. This phase only adds new columns and extends the existing functions — nothing gets deleted or rewritten.

---

## Goal
Add `name`, `tag`, `mode`, `session_logs`, and `summary` to the deployments table so every saved run has a user-visible label and can store rich session data from the agentic simulation.

---

## What's Already Done (Reuse)

| What | Where | How to reuse |
|---|---|---|
| `migrate()` with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` | `go/internal/store/store.go:28` | Already uses this idempotent pattern. Just add 5 more `ALTER TABLE` lines in the same block. |
| `SaveDeployment(...)` | `go/internal/store/deployment.go` | Extend the signature to accept new fields. The INSERT query just gets 5 more columns. |
| `scanDeployment(s scanner)` | `go/internal/store/deployment.go` | Add the 5 new columns to the SELECT and scan. |
| `Deployment` struct | `go/internal/store/deployment.go` | Add 5 new fields. |
| `ListDeployments`, `GetDeployment` | `go/internal/store/deployment.go` | The SELECT `*` pattern picks up new columns automatically once `scanDeployment` is updated. |
| `POST /api/deployments` handler | `go/internal/api/handlers.go:120` | Add new fields to `saveDeploymentRequest` struct and pass to `SaveDeployment`. |

---

## What to Build

1. **Schema migration** (`go/internal/store/store.go`)
   - Add to the existing `migrate()` SQL block:
     ```sql
     ALTER TABLE deployments ADD COLUMN IF NOT EXISTS name          TEXT;
     ALTER TABLE deployments ADD COLUMN IF NOT EXISTS tag           TEXT;
     ALTER TABLE deployments ADD COLUMN IF NOT EXISTS mode          TEXT;
     ALTER TABLE deployments ADD COLUMN IF NOT EXISTS session_logs  JSONB;
     ALTER TABLE deployments ADD COLUMN IF NOT EXISTS summary       JSONB;
     ```
   - Note: `name` is added as `TEXT` (nullable) in the migration for safety. Enforcement of NOT NULL happens at the application layer (handler validation), not the DB constraint — this avoids breaking existing rows.

2. **Deployment struct update** (`go/internal/store/deployment.go`)
   - Add to `Deployment` struct:
     ```go
     Name        string `json:"name"`
     Tag         string `json:"tag"`
     Mode        string `json:"mode"`         // "stress" | "simulation" | "fingerprint"
     SessionLogs string `json:"session_logs"` // raw JSONB as string
     Summary     string `json:"summary"`      // raw JSONB as string
     ```

3. **SaveDeployment signature** (`go/internal/store/deployment.go`)
   - Add `name, tag, mode, sessionLogsJSON, summaryJSON string` parameters
   - Add the 5 new columns to the INSERT query
   - Return the new `id` as before

4. **scanDeployment update** (`go/internal/store/deployment.go`)
   - Add the 5 new columns to the SELECT list
   - Add corresponding `sql.NullString` vars and scan targets
   - Coalesce NULLs to `""` for string fields

5. **Handler update** (`go/internal/api/handlers.go`)
   - Add to `saveDeploymentRequest`:
     ```go
     Name        string `json:"name"`
     Tag         string `json:"tag"`
     Mode        string `json:"mode"`
     SessionLogs string `json:"session_logs"`
     Summary     string `json:"summary"`
     ```
   - Add validation: `name` is required (return 400 if empty)
   - Pass new fields to `SaveDeployment`

---

## Files to Create / Modify

| File | Action | What changes |
|---|---|---|
| `go/internal/store/store.go` | **Modify** | Add 5 `ALTER TABLE` lines to `migrate()` |
| `go/internal/store/deployment.go` | **Modify** | Extend struct, SaveDeployment signature, scanDeployment SELECT |
| `go/internal/api/handlers.go` | **Modify** | Extend `saveDeploymentRequest`, add `name` validation, pass new fields |

---

## Column Details

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `name` | TEXT | yes (enforced in app) | User-defined label, e.g. "v2.3.1-post-refactor" |
| `tag` | TEXT | yes | Optional short tag, e.g. "pre-launch", "regression" |
| `mode` | TEXT | yes | Which mode produced this: "stress", "simulation", "fingerprint" |
| `session_logs` | JSONB | yes | Full agent conversation logs (simulation mode only) |
| `summary` | JSONB | yes | `{success_count, fail_count, avg_turns, avg_latency_ms, per_endpoint_avg_latency}` |

`session_logs` and `summary` are stored as `TEXT` in Go (raw JSON string) and cast to JSONB by Postgres. This matches the existing pattern for `fitted_curve` and `sweep_result` columns.

---

## How It Connects

- **Receives from Phase 1**: Nothing — storage revamp is independent of the stress test handler. But after this phase, the stress test can save results with a name.
- **Required by Phase 6**: Agent execution needs `session_logs` JSONB to store full conversation logs.
- **Required by Phase 7**: Deployment comparison reads `summary` JSONB for per-endpoint latency deltas.
- **Required by Phase 8**: Frontend save modal needs `name` (required) and `tag` (optional) fields.

---

## Key Decisions

**Why not enforce NOT NULL on `name` at the DB level?** Existing rows in the DB have no `name`. Adding `NOT NULL` without a default would require a data migration or break the ALTER. Enforcing it at the application layer (400 if empty) is safer and produces the same result for new inserts.

**Why store JSONB as TEXT in Go?** The existing pattern (`fitted_curve`, `sweep_result`) already stores JSON as TEXT. Changing to a native JSONB type in Go would require adding a pgtype dependency. The simple approach: marshal to string in Go, Postgres stores as JSONB — queries and indexing still work.

---

## Exit Criterion

1. Run the server against a fresh DB — migration runs without error
2. `POST /api/deployments` with `{name: "test-run", mode: "stress", ...}` → returns `{id: 1}`
3. `GET /api/deployments/1` → response includes `name: "test-run"`, `mode: "stress"`
4. `POST /api/deployments` without `name` → returns `400 Bad Request`
5. Old deployments (saved before this phase) still load correctly (`name` is empty string, not error)
