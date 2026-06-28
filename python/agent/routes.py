from __future__ import annotations

import asyncio
import json

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agent.mcp import execute_tool
from agent.planner import generate_plans, validate_plans
from agent.runner import GO_PROBE_URL, create_group, get_group, run_group
from agent.spec import (
    cache_summary,
    format_for_claude,
    get_cached_summary,
    load_spec,
    summarise_spec,
)

router = APIRouter()


# ── POST /agent/spec/validate ────────────────────────────────────────────────


class SpecValidateRequest(BaseModel):
    spec_url: str
    base_url: str
    headers: dict[str, str] = {}


class EndpointInfo(BaseModel):
    method: str
    path: str
    description: str


class SpecValidateResponse(BaseModel):
    valid: bool
    spec_title: str = ""
    endpoints: list[EndpointInfo] = []
    auth_detected: str = ""
    warnings: list[str] = []
    error: str = ""


@router.post("/spec/validate", response_model=SpecValidateResponse)
def spec_validate(req: SpecValidateRequest) -> SpecValidateResponse:
    warnings: list[str] = []

    # Step 1 + 2: fetch + parse
    try:
        spec = load_spec(req.spec_url)
    except ValueError as exc:
        return SpecValidateResponse(valid=False, error=str(exc))

    # Step 3: must have paths
    if not spec.get("paths"):
        return SpecValidateResponse(valid=False, error="Spec has no paths defined.")

    summary = summarise_spec(spec)
    cache_summary(req.spec_url, summary)

    endpoints = [
        EndpointInfo(
            method=ep["method"],
            path=ep["path"],
            description=ep.get("description") or "",
        )
        for ep in summary["endpoints"]
    ]

    # Step 4: base URL responds
    base_url = req.base_url.rstrip("/") or summary.get("base_url", "")
    if base_url:
        try:
            probe_resp = httpx.get(base_url + "/", timeout=5.0, follow_redirects=True)
            if probe_resp.status_code >= 500:
                warnings.append(f"Base URL returned HTTP {probe_resp.status_code}")
        except Exception as exc:
            warnings.append(f"Base URL unreachable: {exc}")
    else:
        warnings.append("No base URL could be determined from spec or request.")

    # Step 5: auth check — try the first auth-required endpoint with provided headers
    auth_detected = ", ".join(summary.get("auth_schemes", []))
    if req.headers and endpoints:
        first_ep = endpoints[0]
        test_url = (base_url or "") + first_ep.path
        result = execute_tool({"method": first_ep.method, "url": test_url, "headers": req.headers})
        if result.get("status_code") == 401:
            warnings.append(f"Auth header returned 401 on {first_ep.method} {first_ep.path} — check your credentials.")

    return SpecValidateResponse(
        valid=True,
        spec_title=summary["title"],
        endpoints=endpoints,
        auth_detected=auth_detected,
        warnings=warnings,
    )


# ── POST /agent/spec/load ─────────────────────────────────────────────────────


class SpecLoadRequest(BaseModel):
    spec_url: str


class SpecLoadResponse(BaseModel):
    spec_text: str
    title: str
    endpoint_count: int


@router.post("/spec/load", response_model=SpecLoadResponse)
def spec_load(req: SpecLoadRequest) -> SpecLoadResponse:
    summary = get_cached_summary(req.spec_url)
    if not summary:
        try:
            spec = load_spec(req.spec_url)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
        summary = summarise_spec(spec)
        cache_summary(req.spec_url, summary)

    text = format_for_claude(summary)
    return SpecLoadResponse(
        spec_text=text,
        title=summary["title"],
        endpoint_count=len(summary["endpoints"]),
    )


# ── POST /agent/plan ──────────────────────────────────────────────────────────


class AgentPlanRequest(BaseModel):
    spec_url: str
    goal: str
    n_agents: int = 3


class AgentPlan(BaseModel):
    agent_id: int
    persona: str
    tone: str = ""
    input_slice: str
    action_plan: list[str]
    success_condition: str


class AgentPlanResponse(BaseModel):
    plans: list[AgentPlan]
    spec_title: str
    validation_errors: list[str]


@router.post("/plan", response_model=AgentPlanResponse)
async def agent_plan(req: AgentPlanRequest) -> AgentPlanResponse:
    if req.n_agents < 1 or req.n_agents > 10:
        raise HTTPException(status_code=422, detail="n_agents must be between 1 and 10")

    # Load spec (from cache if available)
    summary = get_cached_summary(req.spec_url)
    if not summary:
        try:
            spec = load_spec(req.spec_url)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        summary = summarise_spec(spec)
        cache_summary(req.spec_url, summary)

    try:
        plans_raw = await generate_plans(req.spec_url, req.goal, req.n_agents)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Planning failed: {exc}") from exc

    validation_errors = validate_plans(plans_raw, summary)

    plans = []
    for p in plans_raw:
        try:
            plans.append(AgentPlan(
                agent_id=p.get("agent_id", 0),
                persona=p.get("persona", ""),
                tone=p.get("tone", ""),
                input_slice=p.get("input_slice", ""),
                action_plan=p.get("action_plan", []),
                success_condition=p.get("success_condition", ""),
            ))
        except Exception:
            validation_errors.append(f"Could not parse plan: {p}")

    return AgentPlanResponse(
        plans=plans,
        spec_title=summary.get("title", ""),
        validation_errors=validation_errors,
    )


# ── POST /agent/run ───────────────────────────────────────────────────────────


class AgentRunRequest(BaseModel):
    spec_url: str
    plans: list[dict]
    base_url: str = ""
    headers: dict[str, str] = {}
    goal: str = "test the API"
    name: str = ""
    tag: str = ""


class AgentRunResponse(BaseModel):
    session_group_id: str


@router.post("/run", response_model=AgentRunResponse)
async def agent_run(req: AgentRunRequest) -> AgentRunResponse:
    import agent.runner as _runner_mod

    # Load spec summary for session prompts
    summary = get_cached_summary(req.spec_url)
    if not summary:
        try:
            spec = load_spec(req.spec_url)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        summary = summarise_spec(spec)
        cache_summary(req.spec_url, summary)

    spec_text = format_for_claude(summary)
    gid = create_group(
        plans=req.plans,
        spec_url=req.spec_url,
        base_url=req.base_url,
        name=req.name,
        tag=req.tag,
    )
    _runner_mod._groups[gid]["goal"] = req.goal

    asyncio.create_task(run_group(gid, spec_text, go_probe_url=GO_PROBE_URL))

    return AgentRunResponse(session_group_id=gid)


# ── GET /agent/stream/{session_group_id} ──────────────────────────────────────


@router.get("/stream/{session_group_id}")
async def agent_stream(session_group_id: str, request: Request):
    group = get_group(session_group_id)
    if group is None:
        async def error_gen():
            yield 'data: {"type":"error","message":"session not found"}\n\n'
        return StreamingResponse(error_gen(), media_type="text/event-stream")

    # Support Last-Event-ID for reconnection
    last_id_header = request.headers.get("Last-Event-ID", "")
    try:
        offset = int(last_id_header) + 1
    except (ValueError, TypeError):
        offset = 0

    async def event_gen():
        nonlocal offset
        while True:
            events = group["events"]
            while offset < len(events):
                event = events[offset]
                data = json.dumps(event)
                yield f"id: {offset}\ndata: {data}\n\n"
                offset += 1

            if group["status"] == "done" and offset >= len(group["events"]):
                break

            await asyncio.sleep(0.05)

            if await request.is_disconnected():
                break

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

