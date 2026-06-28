# Phase 4 — Swagger Spec Ingestion + Pre-Run Validation

## Status
**Not started.** Pure Python addition. No Go changes needed. The `agent/routes.py` file created in Phase 3 is where these routes live.

---

## Goal
Parse a Swagger/OpenAPI spec into a clean summary Claude can read, then validate that the spec is reachable, the base URL responds, and the auth headers work — all before a single agent is created or any API cost is spent.

---

## What's Already Done (Reuse)

| What | Where | How to reuse |
|---|---|---|
| FastAPI router pattern | `python/curve_fit.py`, `python/similarity.py` | Same `APIRouter` + Pydantic model pattern |
| `execute_tool()` to call Go probe-once | `python/agent/mcp.py` (Phase 3) | Use it to fire the auth validation request — same as agents will do |
| `agent/routes.py` skeleton | Phase 3 | Add new routes to this file |

---

## What to Build

### 1. Spec parser (`python/agent/spec.py`)

```python
def load_spec(url_or_path: str) -> dict:
    """Fetch spec from URL or load from file path. Returns raw parsed dict."""
    # If starts with http(s): fetch with requests/httpx
    # Else: open as file
    # Try JSON first, then YAML (requires pyyaml)
    # Raise clear error if unreachable or invalid format

def summarise_spec(spec: dict) -> dict:
    """Extract clean summary Claude can read as context."""
    # Returns:
    {
        "title": str,
        "base_url": str,            # servers[0].url from spec
        "auth_schemes": [...],      # security schemes (bearer, api_key, etc.)
        "endpoints": [
            {
                "method": "POST",
                "path": "/chat/message",
                "description": str, # operationId or summary
                "required_params": [...],
                "required_body_fields": [...],
                "response_shape": {...},  # simplified, not full schema
            }
        ]
    }
    # OpenAPI 3.x: parse spec["paths"], spec["components"]["schemas"]
    # Swagger 2.x: parse spec["paths"], spec["definitions"]
    # Keep it minimal — Claude doesn't need the full JSON Schema, just field names and types

def format_for_claude(summary: dict) -> str:
    """Convert summary dict to a readable text block for Claude's system prompt."""
    # Returns structured text, not JSON — easier for Claude to reason about
    # Example:
    # API: My Chat Assistant
    # Base URL: https://api.example.com
    # Auth: Bearer token in Authorization header
    #
    # Available endpoints:
    # POST /auth/login
    #   Required body: email (string), password (string)
    #   Returns: token (string), expires_at (datetime)
    #
    # POST /chat/message
    #   Required headers: Authorization: Bearer {token}
    #   Required body: session_id (string), message (string)
    #   Returns: response (string), session_id (string)
```

### 2. Validation route (`python/agent/routes.py`)

```
POST /agent/spec/validate
```

Request:
```json
{
  "spec_url": "https://petstore.swagger.io/v2/swagger.json",
  "base_url": "https://petstore.swagger.io/v2",
  "headers": {"api_key": "special-key"}
}
```

Validation steps (run in order, stop on first failure):
1. **Spec reachable**: fetch the spec URL → error if 4xx/5xx/timeout
2. **Spec parseable**: parse JSON/YAML → error if malformed
3. **Has endpoints**: spec must have at least 1 path → error if empty
4. **Base URL responds**: `GET {base_url}/` or first available GET endpoint → error if no response
5. **Auth works**: fire request with provided headers to first auth-required endpoint → warn (not block) if 401

Response on success:
```json
{
  "valid": true,
  "spec_title": "Petstore",
  "endpoints": [
    {"method": "GET", "path": "/pets", "description": "List all pets"},
    {"method": "POST", "path": "/pets", "description": "Create a pet"}
  ],
  "auth_detected": "api_key",
  "warnings": []
}
```

Response on failure:
```json
{
  "valid": false,
  "error": "Could not fetch spec: ConnectionError at https://...",
  "endpoints": [],
  "warnings": []
}
```

### 3. Spec cache endpoint (`python/agent/routes.py`)

```
POST /agent/spec/load
```

- Fetches + summarises the spec and returns the Claude-readable text block
- The frontend calls this to show the user what Claude will see before starting
- Also caches the summary in memory (keyed by spec URL) so the planning phase doesn't re-fetch

---

## Files to Create / Modify

| File | Action | What changes |
|---|---|---|
| `python/agent/spec.py` | **Create** | `load_spec()`, `summarise_spec()`, `format_for_claude()` |
| `python/agent/routes.py` | **Modify** | Add `POST /agent/spec/validate` and `POST /agent/spec/load` |
| `python/requirements.txt` | **Modify** | Add `pyyaml` for YAML spec support |

---

## Spec Format Support

| Format | Support |
|---|---|
| OpenAPI 3.0 / 3.1 (JSON) | ✅ Primary |
| OpenAPI 3.0 / 3.1 (YAML) | ✅ Via pyyaml |
| Swagger 2.0 (JSON) | ✅ Different field names but same structure |
| Swagger 2.0 (YAML) | ✅ Via pyyaml |
| Non-standard / proprietary | ❌ Out of scope |

Key field mapping between versions:

| Concept | OpenAPI 3.x | Swagger 2.x |
|---|---|---|
| Base URL | `servers[0].url` | `host` + `basePath` |
| Endpoints | `paths` | `paths` |
| Request body | `requestBody.content.application/json.schema` | `parameters[in=body]` |
| Response | `responses.200.content.application/json.schema` | `responses.200.schema` |
| Auth | `components.securitySchemes` | `securityDefinitions` |

---

## How It Connects

- **Receives from Phase 3**: `python/agent/routes.py` skeleton exists
- **Required by Phase 5**: Planning phase calls `summarise_spec()` to get the endpoint list for Claude's context and to validate that agent action plans reference real endpoints
- **Required by Phase 8**: Frontend calls `POST /agent/spec/validate` before showing the "Generate Plans" button

---

## Key Decisions

**Why parse to a text summary instead of passing raw JSON to Claude?** A full OpenAPI spec can be 50-200KB. Claude's context window is not infinite and you pay per token. The clean text summary strips schemas, removes duplication, and gives Claude only what it needs to navigate the API — typically under 2KB.

**Why warn but not block on 401?** Some endpoints require a specific flow (login first, get token, then use it). The auth header the user provides might not work on the very first endpoint but will work after the login flow. Blocking here would prevent valid scenarios. Warn instead.

**Why cache the summary in memory?** Planning (Phase 5) and execution (Phase 6) both need the spec summary. Fetching + parsing a remote spec twice wastes time and could fail if the spec URL goes down between steps. A simple dict keyed by URL is enough — no Redis needed.

---

## Exit Criterion

1. `POST /agent/spec/validate` with the public Petstore Swagger spec → returns `{valid: true, endpoints: [...]}` with at least 3 endpoints listed
2. `POST /agent/spec/validate` with a bad URL → returns `{valid: false, error: "..."}`
3. `POST /agent/spec/load` with valid spec → returns a readable text block listing all endpoints (the format_for_claude output)
4. YAML spec URL → parsed correctly (same as JSON)
