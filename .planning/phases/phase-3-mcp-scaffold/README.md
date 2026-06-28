# Phase 3 — Python MCP Server Scaffold

## Status
**Not started.** The Python sidecar exists with `/fit` and `/similarity`. This phase adds the Claude agent infrastructure alongside those existing routes — nothing existing is removed or changed.

---

## Goal
Build the foundation for Claude-powered agent sessions: a Go internal route that fires one HTTP request on Python's behalf, and the Python module that runs a Claude conversation loop using that route as its tool.

---

## What's Already Done (Reuse)

| What | Where | How to reuse |
|---|---|---|
| FastAPI app with router mounting | `python/main.py` | Mount new `agent_router` the same way `fit_router` and `sim_router` are mounted |
| Python sidecar's HTTP client pattern | `python/curve_fit.py` | Same `httpx` or `requests` pattern for calling Go's `/internal/probe-once` |
| Go `http.Client` timeout pattern | `go/internal/api/handlers.go:82` | Reuse for the internal probe-once handler |
| `writeJSON` / `writeError` helpers | `go/internal/api/handlers.go:15` | Reuse in the new internal handler |
| CORS middleware (and how to bypass it) | `go/internal/api/router.go:38` | Internal routes registered on a separate mux without CORS |

**What NOT to reuse**: `Sweep()` or `ProbeStep` with n-substitution — the internal route fires exactly one raw request, no sweep logic needed.

---

## What to Build

### Go side

1. **Internal probe-once handler** (`go/internal/api/internal.go`)
   - Route: `POST /internal/probe-once`
   - Request body:
     ```json
     {
       "method": "POST",
       "url": "https://api.example.com/chat",
       "headers": {"Authorization": "Bearer abc123"},
       "body": "{\"message\": \"hello\"}",
       "timeout_ms": 5000
     }
     ```
   - Response:
     ```json
     {
       "status_code": 200,
       "body": "{\"reply\": \"hi there\"}",
       "latency_ms": 43.2,
       "error": ""
     }
     ```
   - Implementation: create `http.Request`, set headers, fire with timeout, record `time.Since(start)`, read body as string, return. No HDR histogram needed — single request only.
   - On network error: return `{status_code: 0, body: "", latency_ms: X, error: "connection refused"}`
   - On non-2xx: return normally (status_code reflects it, not an error field)

2. **Register on internal mux** (`go/internal/api/router.go`)
   - Create a second `http.ServeMux` without CORS middleware for internal routes
   - Register `POST /internal/probe-once` on it
   - Bind to `127.0.0.1:8081` (not `0.0.0.0:8080`) — only Python on the same machine can reach it
   - Start in `main.go` as a second `http.Server` on `:8081`

### Python side

3. **Agent package init** (`python/agent/__init__.py`)
   - Empty file to make it a Python package

4. **MCP tool definition** (`python/agent/mcp.py`)
   - Defines the `call_endpoint` tool schema for Claude:
     ```python
     CALL_ENDPOINT_TOOL = {
         "name": "call_endpoint",
         "description": "Fire one HTTP request to the target API and return the response. Use this to interact with the API endpoints.",
         "input_schema": {
             "type": "object",
             "properties": {
                 "method":  {"type": "string", "enum": ["GET","POST","PUT","DELETE","PATCH"]},
                 "url":     {"type": "string"},
                 "headers": {"type": "object"},
                 "body":    {"type": "object", "description": "Request body (omit for GET)"}
             },
             "required": ["method", "url"]
         }
     }
     ```
   - `def execute_tool(tool_input: dict, go_probe_url: str) -> dict` — calls `POST http://localhost:8081/internal/probe-once` with the tool input, returns the result dict

5. **Session runner** (`python/agent/session.py`)
   - `async def run_session(session_id, spec_summary, goal, plan, go_probe_url, event_queue) -> dict`
   - Manages one Claude conversation loop:
     ```
     build system prompt (spec summary + persona + action plan)
     messages = []
     turns = 0
     while not done and turns < MAX_TURNS (20):
         call claude.messages.create(model, system, messages, tools=[CALL_ENDPOINT_TOOL])
         if stop_reason == "tool_use":
             tool_call = extract tool use block from response
             put event {session_id, type:"request", ...tool_call} into event_queue
             result = execute_tool(tool_call.input, go_probe_url)
             put event {session_id, type:"response", ...result} into event_queue
             append assistant message + tool result to messages
         elif stop_reason == "end_turn":
             done = True
             put event {session_id, type:"done", success: True, turns} into event_queue
         turns += 1
     if turns >= MAX_TURNS:
         put event {session_id, type:"done", success: False, reason:"turn_limit"} into event_queue
     return session summary
     ```
   - Uses `anthropic` Python SDK: `import anthropic; client = anthropic.Anthropic()`
   - `event_queue` is an `asyncio.Queue` — the runner (Phase 6) reads from it to build the SSE stream

6. **Mount agent router** (`python/main.py`)
   - `from agent.routes import router as agent_router`
   - `app.include_router(agent_router, prefix="/agent")`
   - Routes defined in Phase 4 and Phase 5 will hang off this router

---

## Files to Create / Modify

| File | Action | What changes |
|---|---|---|
| `go/internal/api/internal.go` | **Create** | `apiProbeOnce` handler |
| `go/internal/api/router.go` | **Modify** | Add second internal mux, register `/internal/probe-once` |
| `go/cmd/server/main.go` | **Modify** | Start second HTTP server on `:8081` for internal routes |
| `python/agent/__init__.py` | **Create** | Empty package init |
| `python/agent/mcp.py` | **Create** | `CALL_ENDPOINT_TOOL` definition + `execute_tool()` |
| `python/agent/session.py` | **Create** | `run_session()` conversation loop |
| `python/agent/routes.py` | **Create** | Empty FastAPI router (populated in Phase 4+5) |
| `python/main.py` | **Modify** | Mount `agent_router` |

---

## Environment Variables Needed

Add to `.env` and `.env.example`:
```
ANTHROPIC_API_KEY=sk-ant-...
GO_INTERNAL_URL=http://localhost:8081
```

Python reads `ANTHROPIC_API_KEY` — the Anthropic SDK picks it up automatically via `anthropic.Anthropic()`.

---

## How It Connects

- **Receives from Phase 2**: Nothing directly (storage revamp is independent).
- **Required by Phase 4**: `python/agent/routes.py` is where Swagger spec routes live.
- **Required by Phase 5**: `session.py` is what the planner calls to test one plan step.
- **Required by Phase 6**: `run_session()` is what the runner calls N times concurrently.

---

## Key Decisions

**Why a separate Go server on port 8081?** The internal probe-once route should not be exposed to the internet. Binding to `127.0.0.1:8081` means only processes on the same machine can call it. Python is always on the same machine. No CORS needed since it's not browser-facing.

**Why does Python call Go instead of making HTTP requests directly?** Go's `net/http` with goroutines gives sub-millisecond timing accuracy. Python's `requests`/`httpx` has higher overhead and no HDR histogram. For accurate latency measurement that will be compared against the stress test data, Go must fire the actual requests.

**Why `asyncio.Queue` for events?** The runner (Phase 6) needs to collect events from N concurrent sessions and multiplex them onto one SSE stream. An async queue is the cleanest way to fan-in from N producers to one consumer without locks.

---

## Exit Criterion

1. Start Go server — second HTTP server listening on `:8081` confirmed in logs
2. `curl -X POST http://localhost:8081/internal/probe-once -d '{"method":"GET","url":"http://localhost:9000/constant","timeout_ms":1000}'` → returns `{status_code:200, body:..., latency_ms: <number>}`
3. Run a Python script that calls `run_session()` with a manually-constructed plan against the test server — confirm at least one `call_endpoint` tool use fires and the event queue receives `request` + `response` events
4. Claude must not have direct network access — all HTTP calls go through Go's `/internal/probe-once`
