# Phase 6 — Agent Execution + Live SSE Stream

## Status
**Not started.** This is the largest phase and the headline feature. Depends on Phase 3 (session.py loop), Phase 4 (spec ingestion), Phase 5 (planning), and Phase 2 (session_logs JSONB column).

---

## Goal
Run N Claude agent sessions concurrently, stream all events from all sessions live to the frontend via SSE, and persist the full conversation logs to Postgres when done.

---

## What's Already Done (Reuse)

| What | Where | How to reuse |
|---|---|---|
| `run_session()` conversation loop | `python/agent/session.py` (Phase 3) | The runner calls this N times as asyncio tasks |
| `execute_tool()` via Go probe-once | `python/agent/mcp.py` (Phase 3) | session.py already uses this; no changes needed |
| `session_logs JSONB` column | `go/internal/store/deployment.go` (Phase 2) | Save full logs here after all sessions complete |
| `agent/routes.py` | Phase 3 | Add the run + stream routes here |
| SSE helper functions | `go/internal/api/sse.go` (Phase 1) | Python has its own SSE via FastAPI StreamingResponse — no Go needed here |

---

## What to Build

### 1. Session runner (`python/agent/runner.py`)

```python
import asyncio, uuid, json
from agent.session import run_session

# In-memory store: session_group_id → {status, events, plans, results}
_groups: dict[str, dict] = {}

async def run_group(session_group_id: str, spec_url: str, plans: list[dict], 
                    go_probe_url: str, db_conn):
    """
    Spawn N asyncio tasks (one per plan), collect all events into the group's
    event list, save logs to DB when all tasks complete.
    """
    group = _groups[session_group_id]
    event_queue = asyncio.Queue()
    
    # Spawn N concurrent tasks
    tasks = [
        asyncio.create_task(
            run_session(plan["agent_id"], spec_url, plan, go_probe_url, event_queue)
        )
        for plan in plans
    ]
    
    # Drain queue while tasks run
    async def drain():
        while True:
            event = await event_queue.get()
            group["events"].append(event)
            if event.get("type") == "group_done":
                break
    
    await asyncio.gather(*tasks)
    await event_queue.put({"type": "group_done", 
                           "success_count": ..., "fail_count": ...})
    await drain()
    
    # Save to DB
    group["status"] = "done"
    save_session_logs(db_conn, session_group_id, group["events"])
```

### 2. SSE stream route (`python/agent/routes.py`)

```
POST /agent/run
```
Request:
```json
{
  "spec_url": "https://...",
  "plans": [...],             ← from /agent/plan response
  "base_url": "https://...",
  "headers": {...}
}
```
Response: `{"session_group_id": "abc-123"}`

Immediately spawns `run_group()` as a background asyncio task and returns the group ID. Does not wait for completion.

```
GET /agent/stream/{session_group_id}
```
SSE stream. Flow:
1. If group still running: yield new events as they arrive (poll `group["events"]` with offset)
2. If group done: yield all stored events (replay) then close
3. If group not found: yield `data: {"type":"error","message":"session not found"}\n\n`

Reconnection support: client sends `Last-Event-ID` header with last received event index → resume from that offset.

### 3. SSE event format (complete schema)

```
# Agent fires a request:
data: {"session_id":2,"type":"request","method":"POST","url":"/auth/login","headers":{},"body":{"email":"test@example.com"},"turn":1,"t":1751102400000}

# Response received:
data: {"session_id":2,"type":"response","status":200,"body":{"token":"abc123"},"latency_ms":43.2,"turn":1}

# Claude's reasoning (text_block before tool use):
data: {"session_id":2,"type":"reasoning","text":"Got the token. Now I'll send a chat message.","turn":1}

# Session complete:
data: {"session_id":2,"type":"done","success":true,"turns":5,"total_latency_ms":312}

# All sessions complete:
data: {"type":"group_done","success_count":5,"fail_count":1,"total_turns":23}

# Error (network or Claude API failure):
data: {"session_id":2,"type":"error","message":"connection refused to /chat/message","turn":3}
```

### 4. Persist session logs to DB

After all sessions complete:
```python
def save_session_logs(db_conn, session_group_id: str, events: list[dict]):
    """
    Aggregate events by session_id, build session_logs JSONB structure,
    compute summary stats, call Go /api/deployments to save.
    
    session_logs structure:
    [
      {
        "session_id": 1,
        "persona": "power user",
        "success": true,
        "turns": 5,
        "total_latency_ms": 312,
        "turns_detail": [
          {"turn": 1, "method": "POST", "url": "/login", "status": 200, "latency_ms": 43},
          ...
        ]
      }
    ]
    
    summary structure:
    {
      "success_count": 5,
      "fail_count": 1,
      "avg_turns": 4.2,
      "avg_latency_ms": 287.3,
      "per_endpoint_avg_latency": {
        "POST /auth/login": 43.1,
        "POST /chat/message": 156.2
      }
    }
    """
```

---

## Files to Create / Modify

| File | Action | What changes |
|---|---|---|
| `python/agent/runner.py` | **Create** | `run_group()`, `_groups` store, `save_session_logs()` |
| `python/agent/routes.py` | **Modify** | Add `POST /agent/run` and `GET /agent/stream/{id}` |
| `python/agent/session.py` | **Modify** (minor) | Ensure `run_session()` puts a `done` event on the queue when finished |

---

## Concurrency Model

```
POST /agent/run
    │
    ├── asyncio.create_task(run_session(agent_1, ...))  ──┐
    ├── asyncio.create_task(run_session(agent_2, ...))  ──┤── all concurrent
    ├── asyncio.create_task(run_session(agent_3, ...))  ──┤
    └── asyncio.create_task(run_session(agent_4, ...))  ──┘
                                                           │
                                                     asyncio.Queue
                                                           │
                                              GET /agent/stream/... (SSE consumer)
```

Each `run_session` task is fully independent — its own conversation history, its own Claude context. They only share the `asyncio.Queue` for event output.

---

## How It Connects

- **Receives from Phase 5**: `plans` array passed directly to `run_group()`
- **Receives from Phase 3**: `run_session()` is called here
- **Receives from Phase 2**: `session_logs` JSONB column exists in DB
- **Produces for Phase 7**: `summary.per_endpoint_avg_latency` is what the diff uses for bottleneck heatmap
- **Produces for Phase 8**: `GET /agent/stream/{id}` is what the simulation panel SSE-connects to

---

## Key Decisions

**Why asyncio tasks and not threads?** Python threads would work but asyncio tasks are lighter (no OS thread per agent) and Claude API calls are I/O-bound (waiting for HTTP responses). Asyncio excels at I/O concurrency.

**Why store events in memory during the run?** The SSE stream needs to replay events if the browser reconnects mid-run. Storing in-memory (the `_groups` dict) is fast. After completion, the full log is persisted to Postgres. Memory is only used during an active run.

**Why call Go `/api/deployments` to save instead of writing directly to Postgres?** Keeps the Python layer stateless with respect to DB writes. One connection pool (in Go) manages all writes. Python only reads/writes through Go's REST API.

**Why emit `reasoning` events (Claude's thinking text)?** This is what makes the frontend panels interesting — you see Claude reasoning out loud, then firing a request, then reading the response. Without the reasoning events, the panels just show request/response pairs with no visible intelligence.

---

## Exit Criterion

1. `POST /agent/run` with 3 manually-crafted plans against the Go test server → returns `session_group_id`
2. `GET /agent/stream/{id}` → SSE events arrive: requests, responses, reasoning, and done events for all 3 agents, interleaved with `session_id` field
3. After all sessions complete: verify `session_logs` and `summary` are written to the Postgres `deployments` table
4. Disconnect and reconnect to `GET /agent/stream/{id}` → all events replayed from the beginning
5. All 3 agents run truly concurrently (check that session 1 events interleave with session 2 events in the stream, not all session 1 first then all session 2)
