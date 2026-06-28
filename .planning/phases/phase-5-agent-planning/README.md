# Phase 5 — Agent Planning Phase

## Status
**Not started.** Depends on Phase 3 (session.py, Claude SDK wired) and Phase 4 (spec summary available). This phase adds one Claude API call that produces N structured agent plans before any execution begins.

---

## Goal
Make all N agents collectively plan their inputs, personas, and action sequences before any request fires — ensuring no two agents duplicate work and the full test surface is covered.

---

## What's Already Done (Reuse)

| What | Where | How to reuse |
|---|---|---|
| `format_for_claude(summary)` | `python/agent/spec.py` (Phase 4) | Feed its output as context to the planning prompt |
| Anthropic SDK client setup | `python/agent/session.py` (Phase 3) | Same `anthropic.Anthropic()` client, same model |
| `agent/routes.py` | Phase 3 | Add `POST /agent/plan` here |

---

## What to Build

### 1. Planner module (`python/agent/planner.py`)

```python
def build_planning_prompt(spec_text: str, goal: str, n_agents: int) -> str:
    """Build the system + user prompt for the planning call."""

async def generate_plans(spec_url: str, goal: str, n_agents: int) -> list[dict]:
    """
    One Claude API call that returns N agent plans.
    
    Returns list of plan dicts:
    [
      {
        "agent_id": 1,
        "persona": "power user",
        "tone": "terse and technical",
        "input_slice": "large payloads (500–2000 items)",
        "action_plan": [
          "POST /auth/login with full credentials",
          "POST /search with limit=500 and all optional filters",
          "GET /results/{id} for first 3 result IDs"
        ],
        "success_condition": "receives non-empty results array with at least 3 items"
      },
      ...
    ]
    """

def validate_plans(plans: list[dict], spec_summary: dict) -> list[str]:
    """
    Check plans for correctness. Returns list of error strings (empty = valid).
    
    Checks:
    1. All agent_ids are unique and cover 1..N
    2. No two agents have the same input_slice
    3. All endpoint paths in action_plan exist in spec_summary["endpoints"]
    4. All plans have required fields: agent_id, persona, tone, input_slice, action_plan, success_condition
    5. action_plan is a non-empty list
    """
```

### 2. Planning prompt design

The planning call uses Claude with **no tools** — just text in, structured JSON out.

**System prompt**:
```
You are coordinating a team of {n_agents} API testing agents.
You have full knowledge of the following API:

{spec_text from format_for_claude()}

Your job: create {n_agents} distinct, non-overlapping test plans so that together 
the agents provide complete coverage of the API surface.

Rules:
- No two agents may test the same input range
- Each agent must have a distinct persona
- Every endpoint reference in action_plan must exist in the API above
- Return valid JSON only — no markdown, no explanation
```

**User message**:
```
Goal: {user's goal}

Return a JSON array of {n_agents} agent plans. Each plan must have:
- agent_id (integer, 1 to {n_agents})
- persona (one of: "power user", "casual user", "adversarial", "first-time user", "api integrator")  
- tone (how this persona phrases requests)
- input_slice (which part of the input space this agent covers)
- action_plan (ordered list of steps, each step is a plain-English instruction referencing a specific endpoint)
- success_condition (what "done" looks like for this agent)
```

**Parsing**: Claude returns a JSON array. Parse with `json.loads()`. If parsing fails, retry once with an explicit "return only valid JSON" instruction.

### 3. Plan validation endpoint (`python/agent/routes.py`)

```
POST /agent/plan
```

Request:
```json
{
  "spec_url": "https://...",
  "goal": "Test the full chat assistant flow",
  "n_agents": 4
}
```

Flow:
1. Load spec summary from cache (Phase 4 cached it) or re-fetch
2. Call `generate_plans(spec_url, goal, n_agents)`
3. Call `validate_plans(plans, spec_summary)` — if errors, return 422 with error list
4. Return plans to frontend for user review

Response:
```json
{
  "plans": [
    {
      "agent_id": 1,
      "persona": "power user",
      "tone": "terse and technical",
      "input_slice": "large payloads (500-2000 items)",
      "action_plan": ["POST /auth/login", "POST /search with limit=500"],
      "success_condition": "receives non-empty results"
    }
  ],
  "spec_title": "My Chat API",
  "validation_errors": []
}
```

---

## Persona Reference

| Persona | Behaviour | Tests |
|---|---|---|
| Power user | Max payload, all optional fields, technical language | Performance ceiling, full feature set |
| Casual user | Minimal payload, only required fields, conversational | Happy path, default behaviours |
| Adversarial | Edge case values (empty strings, nulls, very long strings, negative numbers) | Error handling, input validation |
| First-time user | Tries endpoints in wrong order, forgets required fields, retries on error | Forgiveness, clear error messages |
| API integrator | Programmatic patterns, polls for results, checks consistency | Idempotency, consistency |

N agents pick from these in order (1→power, 2→casual, 3→adversarial, 4→first-time, 5→integrator, 6→power again, etc.)

---

## Files to Create / Modify

| File | Action | What changes |
|---|---|---|
| `python/agent/planner.py` | **Create** | `build_planning_prompt()`, `generate_plans()`, `validate_plans()` |
| `python/agent/routes.py` | **Modify** | Add `POST /agent/plan` route |

---

## How It Connects

- **Receives from Phase 4**: `format_for_claude()` output, cached spec summary
- **Required by Phase 6**: Each plan dict is passed directly to `run_session()` as the `plan` parameter — it becomes part of the agent's system prompt
- **Required by Phase 8**: Frontend calls `POST /agent/plan`, shows user the N plan cards, user reviews and approves before hitting "Run Simulation"

---

## Key Decisions

**Why one Claude call for all N plans instead of N separate calls?** A single call lets Claude distribute the input space coherently — it sees all N agents at once and ensures no overlap. N separate calls produce N agents that might all pick the same persona or input range.

**Why plain-English action plans instead of structured JSON steps?** The execution phase (Phase 6) gives the action plan to Claude as part of its system prompt context. Claude understands "POST /auth/login first, then use the token for /search" better than `[{"method":"POST","path":"/auth/login"}]`. Structured steps would constrain Claude unnecessarily — the point is that Claude is intelligent.

**Why validate against the spec after planning?** Claude occasionally hallucninates endpoint paths that don't exist in the spec (e.g. `/chat/respond` when the spec has `/chat/message`). The validation step catches these before execution — much cheaper to fix than discovering a missing endpoint after 20 agent turns.

---

## Exit Criterion

1. `POST /agent/plan` with Petstore spec URL, goal "test CRUD operations", n_agents=3 → returns 3 plans with distinct personas and non-overlapping input slices
2. All 3 plans reference only endpoints that exist in the Petstore spec (validate_plans returns no errors)
3. `POST /agent/plan` with n_agents=5 → 5 plans, all 5 personas used
4. If Claude returns malformed JSON → graceful 422 with error message (not 500 crash)
