"""Agent planning phase — one Claude call that produces N distinct test plans."""

from __future__ import annotations

import asyncio
import json
import re

import anthropic

from agent.spec import format_for_claude, get_cached_summary, load_spec, summarise_spec

MODEL = "claude-sonnet-4-6"

_PERSONAS = [
    "power user",
    "casual user",
    "adversarial",
    "first-time user",
    "api integrator",
]

_PLANNING_SYSTEM = """\
You are coordinating a team of {n_agents} API testing agents.
You have full knowledge of the following API:

{spec_text}

Your job: create {n_agents} distinct, non-overlapping test plans so that together \
the agents provide complete coverage of the API surface.

Rules:
- No two agents may test the same input range or duplicate another agent's work
- Each agent must have a distinct persona from this list: {personas}
- Every endpoint reference in action_plan must exist in the API listed above (use exact paths)
- action_plan items are plain-English instructions that reference specific endpoints
- Return ONLY a valid JSON array — no markdown, no code block, no explanation, nothing else
"""

_PLANNING_USER = """\
Goal: {goal}

Return a JSON array of exactly {n_agents} agent plans. Each plan object must have these fields:
- "agent_id": integer from 1 to {n_agents}
- "persona": one of {personas}
- "tone": one sentence describing how this persona phrases requests
- "input_slice": which specific part of the input space this agent covers (e.g. "large payloads 500-2000 items", "minimal required fields only", "empty and null edge cases")
- "action_plan": ordered list of plain-English steps, each referencing a specific endpoint path from the API
- "success_condition": one sentence describing what "done" looks like for this agent

Return ONLY the JSON array.
"""


def build_planning_prompt(spec_text: str, goal: str, n_agents: int) -> tuple[str, str]:
    """Return (system_prompt, user_message) for the planning call."""
    persona_list = ", ".join(f'"{p}"' for p in _PERSONAS[:n_agents] if True)
    system = _PLANNING_SYSTEM.format(
        n_agents=n_agents,
        spec_text=spec_text,
        personas=persona_list,
    )
    user = _PLANNING_USER.format(
        goal=goal,
        n_agents=n_agents,
        personas=persona_list,
    )
    return system, user


def _extract_json(text: str) -> list[dict]:
    """Parse Claude's response, stripping markdown fences if present."""
    # Strip markdown code block if present
    stripped = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
    stripped = re.sub(r"\s*```$", "", stripped.strip(), flags=re.MULTILINE)
    stripped = stripped.strip()
    # Find the outermost JSON array
    start = stripped.find("[")
    end = stripped.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("No JSON array found in Claude response")
    return json.loads(stripped[start : end + 1])


def _call_claude(system: str, messages: list[dict]) -> str:
    client = anthropic.Anthropic()
    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=system,
        messages=messages,
    )
    return response.content[0].text


async def generate_plans(spec_url: str, goal: str, n_agents: int) -> list[dict]:
    """
    One Claude API call that returns N distinct agent plans.
    Retries once if JSON parsing fails.
    """
    summary = get_cached_summary(spec_url)
    if not summary:
        spec = await asyncio.to_thread(load_spec, spec_url)
        summary = summarise_spec(spec)

    spec_text = format_for_claude(summary)
    system, user_msg = build_planning_prompt(spec_text, goal, n_agents)
    messages = [{"role": "user", "content": user_msg}]

    raw = await asyncio.to_thread(_call_claude, system, messages)

    try:
        plans = _extract_json(raw)
    except (ValueError, json.JSONDecodeError):
        # Retry once with explicit correction
        retry_messages = messages + [
            {"role": "assistant", "content": raw},
            {"role": "user", "content": "Your response was not valid JSON. Return ONLY the raw JSON array, no markdown, no text before or after it."},
        ]
        raw2 = await asyncio.to_thread(_call_claude, system, retry_messages)
        plans = _extract_json(raw2)

    return plans


def _normalize_path(path: str) -> str:
    """Replace {param} with a wildcard for comparison."""
    return re.sub(r"\{[^}]+\}", "*", path)


def _path_exists(candidate: str, valid_paths: set[str]) -> bool:
    """Check if candidate path matches any valid spec path (param-tolerant)."""
    norm_candidate = _normalize_path(candidate)
    for vp in valid_paths:
        if norm_candidate == _normalize_path(vp):
            return True
    return False


def _extract_paths_from_step(step: str) -> list[str]:
    """Extract /path strings from a plain-English action plan step."""
    return re.findall(r"(/[\w/{}\-_.]+)", step)


def validate_plans(plans: list[dict], spec_summary: dict) -> list[str]:
    """
    Validate N plans against the spec. Returns list of error strings (empty = valid).
    """
    errors: list[str] = []
    valid_paths = {ep["path"] for ep in spec_summary.get("endpoints", [])}
    required_fields = {"agent_id", "persona", "input_slice", "action_plan", "success_condition"}

    ids_seen: set[int] = set()
    slices_seen: set[str] = set()

    for i, plan in enumerate(plans):
        label = f"Plan {plan.get('agent_id', i + 1)}"

        for field in required_fields:
            if field not in plan:
                errors.append(f"{label}: missing required field '{field}'")

        agent_id = plan.get("agent_id")
        if agent_id is not None:
            if agent_id in ids_seen:
                errors.append(f"Duplicate agent_id: {agent_id}")
            ids_seen.add(agent_id)

        input_slice = plan.get("input_slice", "").strip()
        if input_slice:
            if input_slice in slices_seen:
                errors.append(f"{label}: duplicate input_slice '{input_slice}'")
            slices_seen.add(input_slice)

        action_plan = plan.get("action_plan", [])
        if not isinstance(action_plan, list) or not action_plan:
            errors.append(f"{label}: action_plan must be a non-empty list")
            continue

        for step in action_plan:
            paths_in_step = _extract_paths_from_step(str(step))
            for path in paths_in_step:
                if not _path_exists(path, valid_paths):
                    errors.append(f"{label}: unknown endpoint '{path}' in step: '{step}'")

    n = len(plans)
    expected_ids = set(range(1, n + 1))
    if ids_seen and ids_seen != expected_ids:
        errors.append(f"agent_ids {sorted(ids_seen)} don't match expected 1..{n}")

    return errors
