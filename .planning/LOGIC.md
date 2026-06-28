# AlgoLens — Core Logic Reference

This document is the authoritative explanation of every piece of logic, math, and decision-making in AlgoLens. Read this before touching any backend code.

---

## 1. The Probe Engine (Go)

Go's only job is firing HTTP requests and measuring latency accurately. Nothing else.

### 1a. Single probe step

Given `(concurrency, url, method, headers, body)`:
1. Spin up `concurrency` goroutines via `sync.WaitGroup`
2. Each goroutine fires one request and records `latency_ns = time.Since(start).Nanoseconds()`
3. Results go into an HDR histogram (range: 1µs–60s, 3 significant figures)
4. Extract p50, p95, p99 from the histogram
5. Return `ProbePoint{Concurrency, P50, P95, P99, Errors}`

Errors and non-2xx responses are counted separately and excluded from the histogram. They don't corrupt the latency distribution but are reported alongside it.

### 1b. Why HDR histogram

HDR histogram is O(1) insert, O(log n) percentile query, and uses fixed memory regardless of sample count. A naive approach (collect all latencies into a slice, sort, take percentile) is O(n log n) and grows memory with sample count. At high concurrency this matters.

### 1c. Settling delay — adaptive, not fixed

Between concurrency steps (stress test mode), after each step completes:
```
settle_ms = max(MIN_SETTLE_MS=300, SETTLE_MULTIPLIER=3 × p99_of_last_step)
```

A fixed delay is wrong in both directions: too short means in-flight requests from the previous step bleed into measurements for the next; too long wastes time on fast endpoints.

Examples:
| Last step p99 | Wait |
|---|---|
| 2ms | 300ms (floor) |
| 200ms | 600ms |
| 1000ms | 3000ms |

### 1d. Single-request internal probe

For the agentic simulation, Python needs Go to fire exactly one HTTP request with arbitrary parameters and return the result. This is handled by `POST /internal/probe-once` — an internal-only route not exposed to the frontend or CORS.

```
Input:  {method, url, headers, body, timeout_ms}
Output: {status_code, body, latency_ms, error}
```

Python calls this. Claude never calls the target API directly — Go always does the actual firing.

---

## 2. Stress / Concurrency Test Logic

The stress test ramps concurrency progressively:

```
for each concurrency_level in [1, 5, 10, 25, 50, 100, ...]:
    1. Settle (adaptive delay from previous step)
    2. Warmup: fire 2 requests, discard
    3. Sample: fire concurrency_level goroutines simultaneously
    4. Emit SSE event with {concurrency, p50, p95, p99, error_rate}
    5. If error_rate >= 0.5: emit breaking_point event, stop
```

Breaking point = the concurrency level where ≥50% of requests fail. This is the ceiling of the endpoint under this payload.

---

## 3. Swagger Spec Ingestion (Python)

### 3a. What the spec gives Claude

A Swagger/OpenAPI spec is JSON or YAML that describes every endpoint:
- Path and HTTP method
- Required and optional parameters (query, path, body)
- Request body schema
- Response schema per status code
- Security/auth requirements

Claude reads this as context and immediately knows how to navigate the API — which endpoints exist, what they need, what they return, and how they chain together.

### 3b. Spec summary format

The raw spec is too verbose to give Claude as-is. Python extracts a clean summary:

```json
{
  "base_url": "https://api.example.com",
  "auth": "Bearer token, header name: Authorization",
  "endpoints": [
    {
      "method": "POST",
      "path": "/auth/login",
      "description": "Authenticate user, returns session token",
      "required_body": {"email": "string", "password": "string"},
      "returns": {"token": "string", "expires_at": "datetime"}
    },
    {
      "method": "POST",
      "path": "/chat/message",
      "description": "Send a message to the assistant",
      "required_headers": ["Authorization: Bearer {token}"],
      "required_body": {"session_id": "string", "message": "string"},
      "returns": {"response": "string", "session_id": "string"}
    }
  ]
}
```

Claude reads this summary, not the raw spec.

### 3c. Pre-run validation

Before generating any agent plans or firing any requests:
1. Fetch spec — is it reachable? Is it valid JSON/YAML?
2. Parse endpoints — does the spec have at least one endpoint?
3. Check base URL — does `GET {base_url}/health` (or equivalent) return anything?
4. Check auth — fire a request with the provided headers to the first available endpoint, expect non-401
5. Return errors if any check fails

This is the gate. Nothing proceeds until all checks pass.

---

## 4. Agent Planning Phase (Python + Claude)

### 4a. Why agents plan before executing

Without a planning phase, N agents all do the same thing — same inputs, same flow, same results N times over. Useless.

With a planning phase, all N agents collectively plan before any request fires. The planning call is one Claude invocation that returns N distinct plans.

### 4b. What Claude receives for planning

```
System: You are coordinating N API testing agents. You have read the full API spec.
        Your job is to create N distinct, non-overlapping test plans.

User:   Goal: {user's goal in plain English}
        Number of agents: {N}
        API spec summary: {spec summary from §3b}
        
        Return a JSON array of {N} agent plans. Each plan must have:
        - agent_id (1..N)
        - persona ("power user" | "casual user" | "adversarial" | "first-time user" | "api integrator")
        - input_slice (which part of the input space this agent covers — must not overlap with others)
        - action_plan (ordered list of endpoint calls this agent will make)
        - success_condition (what "done" looks like for this agent)
        - tone (how Claude should phrase requests for this persona)
        
        Ensure full input space coverage. No two agents should test the same inputs.
```

### 4c. Plan validation

After Claude returns plans, Python validates:
- All N plans have distinct input slices (no overlap)
- All endpoints referenced in action plans exist in the spec
- Success conditions are unambiguous
- If any check fails, Claude is asked to revise

### 4d. Persona behaviour mapping

| Persona | Input style | Tone | What they test |
|---|---|---|---|
| Power user | Max payload, all optional fields | Terse, technical | Performance ceiling, full feature set |
| Casual user | Minimal payload, required fields only | Conversational | Happy path, default behaviours |
| Adversarial | Edge case values, boundary inputs | Doesn't matter | Error handling, validation |
| First-time user | Random order, extra fields | Hesitant | Forgiveness, clear error messages |
| API integrator | Programmatic patterns, batch operations | Precise | Consistency, idempotency |

---

## 5. Agent Execution Loop (Python + Claude + Go)

### 5a. One session loop

```python
while not done and turns < MAX_TURNS:
    # Claude decides what to do
    response = claude.messages.create(
        model="claude-sonnet-4-6",
        system=system_prompt,       # spec summary + persona + plan
        messages=conversation,      # full history so far
        tools=[call_endpoint_tool]  # the one tool Claude has
    )
    
    if response.stop_reason == "tool_use":
        tool_call = extract_tool_call(response)
        # Go fires the actual HTTP request
        result = go_probe_once(tool_call.method, tool_call.url, 
                               tool_call.headers, tool_call.body)
        # Add to conversation history
        conversation.append(tool_result(result))
        emit_sse(session_id, "request", tool_call)
        emit_sse(session_id, "response", result)
        
    elif response.stop_reason == "end_turn":
        # Claude says it's done
        done = True
        emit_sse(session_id, "done", {success: ..., turns: turns})
    
    turns += 1
```

### 5b. The call_endpoint tool definition

```json
{
  "name": "call_endpoint",
  "description": "Fire one HTTP request to the target API and get the response",
  "input_schema": {
    "type": "object",
    "properties": {
      "method":  {"type": "string", "enum": ["GET","POST","PUT","DELETE","PATCH"]},
      "url":     {"type": "string", "description": "Full URL including base"},
      "headers": {"type": "object", "description": "HTTP headers as key-value pairs"},
      "body":    {"type": "object", "description": "Request body (omit for GET)"}
    },
    "required": ["method", "url"]
  }
}
```

### 5c. Concurrency model

All N sessions run as asyncio tasks in Python. Each task has its own conversation history and its own Claude context. They do not share state.

All events from all sessions are multiplexed onto one SSE stream with a `session_id` field so the frontend can route events to the right panel.

### 5d. Turn limit

Default MAX_TURNS = 20. Prevents runaway sessions. If a session hits the limit, it emits `{type: "done", success: false, reason: "turn_limit_reached"}`.

---

## 6. Curve Fitting Math (Python — unchanged)

For the fingerprint mode, after a sweep we have `(n, latency)` pairs. We fit candidate functions:

| Class | Function | 
|---|---|
| O(1) | `f(n) = c` |
| O(log n) | `f(n) = a·log(n) + b` |
| O(n) | `f(n) = a·n + b` |
| O(n log n) | `f(n) = a·n·log(n) + b` |
| O(n²) | `f(n) = a·n² + b` |

Best fit = highest R². Tie-break: prefer the simpler (lower-order) class if R² difference < 0.02.

R² formula:
```
SS_res = sum( (latency_i - f(n_i))² )
SS_tot = sum( (latency_i - mean)² )
R² = 1 - SS_res/SS_tot
```

---

## 7. Similarity Search Math (Python — unchanged)

Fingerprint vector = `[complexity_exponent, memory_growth_rate, concurrency_cliff, breaking_point, error_rate]`

All dimensions normalised to [0, 1] using min/max across stored deployments before comparison.

Cosine similarity:
```
similarity(A, B) = (A · B) / (||A|| × ||B||)
```

Range: [0, 1]. 1 = identical shape. We use cosine not Euclidean because dimensions have different scales (exponent ≈ 1–3, breaking_point ≈ 100–100000).

---

## 8. SSE Event Schema

All streaming uses Server-Sent Events. Each event is a JSON object on a `data:` line.

### Stress test events
```
data: {"type": "step", "concurrency": 10, "p50": 45.2, "p95": 112.0, "p99": 203.4, "error_rate": 0.02}
data: {"type": "breaking_point", "concurrency": 50, "error_rate": 0.61}
data: {"type": "done"}
```

### Simulation events
```
data: {"session_id": 1, "type": "request",   "method": "POST", "url": "/auth/login", "body": {...}, "t": 1751102400000}
data: {"session_id": 1, "type": "response",  "status": 200, "body": {...}, "latency_ms": 38}
data: {"session_id": 1, "type": "reasoning", "text": "Got token, now sending first message..."}
data: {"session_id": 1, "type": "done",      "success": true, "turns": 4, "total_latency_ms": 287}
data: {"type": "group_done", "success_count": 5, "fail_count": 1}
```

---

## 9. Postgres JSONB Schema

```sql
CREATE TABLE deployments (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,              -- user-defined, required
    tag             TEXT,                       -- optional label
    mode            TEXT NOT NULL,              -- 'stress' | 'simulation' | 'fingerprint'
    endpoint        TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    notes           TEXT,

    -- fingerprint (all modes)
    fingerprint     JSONB,  -- {complexity_exponent, memory_growth_rate, concurrency_cliff, breaking_point, error_rate}

    -- stress mode
    sweep_result    JSONB,  -- [{concurrency, p50, p95, p99, error_rate}]

    -- simulation mode
    session_logs    JSONB,  -- [{session_id, persona, turns: [{type, method, url, status, latency_ms, body, reasoning}]}]
    summary         JSONB,  -- {success_count, fail_count, avg_turns, avg_latency_ms, per_endpoint_avg_latency}

    -- legacy fields (fingerprint mode)
    complexity_class    TEXT,
    complexity_exponent DOUBLE PRECISION,
    memory_growth_rate  DOUBLE PRECISION,
    concurrency_cliff   DOUBLE PRECISION,
    breaking_point      DOUBLE PRECISION,
    fitted_curve        TEXT,
    headers             TEXT,
    payload_template    TEXT,
    http_method         TEXT
);
```

---

## 10. Key Design Decisions

| Decision | Reason |
|---|---|
| Go only for HTTP probing | Goroutines are cheaper than threads. Accurate nanosecond timing. Python GIL would corrupt concurrent measurements. |
| Python for all Claude logic | Anthropic SDK + MCP protocol are first-class in Python. No reason to reimplement in Go. |
| Claude calls Go, not the API directly | Go's probe engine handles timeouts, retries, and nanosecond timing. Claude only decides what to call. |
| SSE not WebSockets | SSE is simpler (plain HTTP, no handshake protocol), sufficient for unidirectional streaming (server → client), and reconnects automatically. |
| Postgres only, no MongoDB | Postgres JSONB handles arbitrary document storage. One database = simpler ops. |
| Agents plan before executing | Prevents N identical test runs. Ensures full input coverage. Makes results comparable. |
| Pre-run validation gate | Catches missing auth, unreachable endpoints, malformed specs before spending any API cost. |
| User names every deployment | Prevents noise in history. Unnamed runs = not worth comparing. Forces intentional record-keeping. |
| p50 for curve fitting | Robust to outliers. p95/p99 for cliff/breaking point analysis only. |
| Cosine not Euclidean for similarity | Dimensions have incompatible scales. Cosine measures shape, not magnitude. |
