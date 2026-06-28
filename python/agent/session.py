import asyncio
import json
import time
from typing import Any

import anthropic

from agent.mcp import CALL_ENDPOINT_TOOL, execute_tool

MAX_TURNS = 20
MODEL = "claude-sonnet-4-6"


def _build_system_prompt(spec_summary: str, persona: str, action_plan: list[str], success_condition: str) -> str:
    plan_steps = "\n".join(f"  {i+1}. {step}" for i, step in enumerate(action_plan))
    return (
        f"You are testing an API. Your persona: {persona}.\n\n"
        f"API Overview:\n{spec_summary}\n\n"
        f"Your action plan:\n{plan_steps}\n\n"
        f"Success condition: {success_condition}\n\n"
        "Use the call_endpoint tool to interact with the API. "
        "Work through your action plan step by step. "
        "When you have achieved the success condition or exhausted all steps, stop."
    )


async def run_session(
    session_id: int,
    spec_summary: str,
    goal: str,
    plan: dict[str, Any],
    go_probe_url: str,
    event_queue: asyncio.Queue,
) -> dict:
    """
    Run one Claude agent session. Puts events into event_queue as it proceeds.

    plan keys: persona, input_slice, action_plan (list[str]), success_condition
    """
    client = anthropic.Anthropic()

    system = _build_system_prompt(
        spec_summary=spec_summary,
        persona=plan.get("persona", "API tester"),
        action_plan=plan.get("action_plan", []),
        success_condition=plan.get("success_condition", goal),
    )

    messages: list[dict] = []
    messages.append({"role": "user", "content": f"Goal: {goal}\n\nBegin executing your action plan."})

    turns = 0
    success = False

    while turns < MAX_TURNS:
        response = await asyncio.to_thread(
            client.messages.create,
            model=MODEL,
            max_tokens=4096,
            system=system,
            tools=[CALL_ENDPOINT_TOOL],
            messages=messages,
        )

        # Add assistant turn to history
        assistant_content = response.content
        messages.append({"role": "assistant", "content": assistant_content})

        if response.stop_reason == "tool_use":
            # Emit reasoning text blocks before tool calls
            for block in assistant_content:
                if block.type == "text" and block.text.strip():
                    await event_queue.put({
                        "session_id": session_id,
                        "type": "reasoning",
                        "text": block.text.strip(),
                        "turn": turns + 1,
                    })

            tool_results = []
            for block in assistant_content:
                if block.type != "tool_use":
                    continue

                tool_input = block.input

                await event_queue.put({
                    "session_id": session_id,
                    "type": "request",
                    "tool_use_id": block.id,
                    "method": tool_input.get("method"),
                    "url": tool_input.get("url"),
                    "body": tool_input.get("body"),
                    "turn": turns + 1,
                    "t": int(time.time() * 1000),
                })

                result = await asyncio.to_thread(execute_tool, tool_input, go_probe_url)

                await event_queue.put({
                    "session_id": session_id,
                    "type": "response",
                    "status_code": result.get("status_code"),
                    "body": result.get("body"),
                    "latency_ms": result.get("latency_ms"),
                    "error": result.get("error", ""),
                    "turn": turns + 1,
                })

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result),
                })

            messages.append({"role": "user", "content": tool_results})

        elif response.stop_reason == "end_turn":
            # Emit any final reasoning text
            for block in assistant_content:
                if block.type == "text" and block.text.strip():
                    await event_queue.put({
                        "session_id": session_id,
                        "type": "reasoning",
                        "text": block.text.strip(),
                        "turn": turns + 1,
                    })
            success = True
            break

        turns += 1

    await event_queue.put({
        "session_id": session_id,
        "type": "done",
        "success": success,
        "turns": turns,
        "reason": "end_turn" if success else "turn_limit",
    })

    return {
        "session_id": session_id,
        "success": success,
        "turns": turns,
        "messages": messages,
    }
