"""Agent group runner — spawns N concurrent sessions, fans events into one queue."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections import defaultdict
from typing import Any

import httpx

from agent.session import run_session

GO_API_URL = "http://localhost:8080"
GO_PROBE_URL = "http://localhost:8081/internal/probe-once"

_groups: dict[str, dict[str, Any]] = {}


def create_group(plans: list[dict], spec_url: str, base_url: str, name: str, tag: str) -> str:
    """Create a new session group record and return its ID."""
    gid = str(uuid.uuid4())
    _groups[gid] = {
        "status": "pending",
        "events": [],
        "plans": plans,
        "spec_url": spec_url,
        "base_url": base_url,
        "name": name,
        "tag": tag,
    }
    return gid


def get_group(gid: str) -> dict | None:
    return _groups.get(gid)


async def run_group(
    session_group_id: str,
    spec_summary: str,
    go_probe_url: str = GO_PROBE_URL,
    go_api_url: str = GO_API_URL,
) -> None:
    """
    Spawn N concurrent agent sessions, drain all events, then save to Go API.
    Called as a background asyncio task — does not raise; errors go into events.
    """
    group = _groups.get(session_group_id)
    if not group:
        return

    group["status"] = "running"
    plans = group["plans"]
    event_queue: asyncio.Queue = asyncio.Queue()

    tasks = [
        asyncio.create_task(
            run_session(
                session_id=plan["agent_id"],
                spec_summary=spec_summary,
                goal=group.get("goal", "test the API"),
                plan=plan,
                go_probe_url=go_probe_url,
                event_queue=event_queue,
            )
        )
        for plan in plans
    ]

    results: list[dict] = []

    async def drain_until_all_done() -> None:
        done_count = 0
        target = len(plans)
        while done_count < target:
            try:
                event = await asyncio.wait_for(event_queue.get(), timeout=0.1)
                group["events"].append(event)
                if event.get("type") == "done":
                    done_count += 1
            except asyncio.TimeoutError:
                pass

    gather_task = asyncio.create_task(drain_until_all_done())
    session_results = await asyncio.gather(*tasks, return_exceptions=True)
    await gather_task

    # Drain any remaining queued events
    while not event_queue.empty():
        try:
            group["events"].append(event_queue.get_nowait())
        except asyncio.QueueEmpty:
            break

    for r in session_results:
        if isinstance(r, dict):
            results.append(r)

    success_count = sum(1 for r in results if isinstance(r, dict) and r.get("success"))
    fail_count = len(plans) - success_count
    total_turns = sum(r.get("turns", 0) for r in results if isinstance(r, dict))

    group_done_event = {
        "type": "group_done",
        "success_count": success_count,
        "fail_count": fail_count,
        "total_turns": total_turns,
    }
    group["events"].append(group_done_event)
    group["status"] = "done"
    group["results"] = results

    # Persist to Go API (best-effort — don't fail the whole run on save error)
    try:
        await _save_to_go(session_group_id, group, go_api_url)
    except Exception as exc:
        group["save_error"] = str(exc)


def _aggregate_logs(events: list[dict], plans: list[dict]) -> tuple[list[dict], dict]:
    """Build session_logs and summary from the flat event list."""
    plan_by_id = {p["agent_id"]: p for p in plans}
    sessions: dict[int, dict] = {}
    endpoint_latencies: dict[str, list[float]] = defaultdict(list)

    for event in events:
        sid = event.get("session_id")
        if sid is None:
            continue

        if sid not in sessions:
            plan = plan_by_id.get(sid, {})
            sessions[sid] = {
                "session_id": sid,
                "persona": plan.get("persona", ""),
                "success": False,
                "turns": 0,
                "total_latency_ms": 0.0,
                "turns_detail": [],
            }

        s = sessions[sid]
        etype = event.get("type")

        if etype == "response":
            latency = event.get("latency_ms") or 0.0
            s["total_latency_ms"] += latency
            url = event.get("url", "")
            if url:
                endpoint_latencies[url].append(latency)

        elif etype == "done":
            s["success"] = event.get("success", False)
            s["turns"] = event.get("turns", 0)

    session_logs = list(sessions.values())
    all_latencies = [s["total_latency_ms"] for s in session_logs if s["total_latency_ms"] > 0]
    avg_latency = sum(all_latencies) / len(all_latencies) if all_latencies else 0.0

    summary = {
        "success_count": sum(1 for s in session_logs if s["success"]),
        "fail_count": sum(1 for s in session_logs if not s["success"]),
        "avg_turns": (
            sum(s["turns"] for s in session_logs) / len(session_logs)
            if session_logs else 0
        ),
        "avg_latency_ms": round(avg_latency, 2),
        "per_endpoint_avg_latency": {
            url: round(sum(lats) / len(lats), 2)
            for url, lats in endpoint_latencies.items()
        },
    }
    return session_logs, summary


async def _save_to_go(session_group_id: str, group: dict, go_api_url: str) -> None:
    session_logs, summary = _aggregate_logs(group["events"], group["plans"])
    name = group.get("name") or f"simulation-{session_group_id[:8]}"
    tag = group.get("tag", "")
    spec_url = group.get("spec_url", "")

    payload = {
        "endpoint": spec_url,
        "version": session_group_id,
        "notes": "",
        "fingerprint_vector": {
            "complexity_class": "",
            "complexity_exponent": 0,
            "memory_growth_rate": 0,
            "concurrency_cliff": 0,
            "breaking_point": 0,
            "read_write_ratio": 0,
        },
        "fitted_curve": "",
        "sweep_result": "",
        "headers_json": "",
        "payload_template": "",
        "http_method": "POST",
        "name": name,
        "tag": tag,
        "mode": "simulation",
        "session_logs": json.dumps(session_logs),
        "summary": json.dumps(summary),
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(f"{go_api_url}/api/deployments", json=payload)
        resp.raise_for_status()
        group["deployment_id"] = resp.json().get("id")
