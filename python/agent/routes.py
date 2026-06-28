from __future__ import annotations

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from agent.mcp import execute_tool
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

# Phase 5 (agent planning) routes mount here.
