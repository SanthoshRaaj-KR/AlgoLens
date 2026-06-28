import httpx

GO_PROBE_URL = "http://localhost:8081/internal/probe-once"

CALL_ENDPOINT_TOOL = {
    "name": "call_endpoint",
    "description": (
        "Fire one HTTP request to the target API and return the response. "
        "Use this to interact with the API endpoints."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "method": {
                "type": "string",
                "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"],
            },
            "url": {"type": "string"},
            "headers": {"type": "object"},
            "body": {
                "type": "object",
                "description": "Request body as JSON object (omit for GET)",
            },
        },
        "required": ["method", "url"],
    },
}


def execute_tool(tool_input: dict, go_probe_url: str = GO_PROBE_URL) -> dict:
    """Call Go's /internal/probe-once and return the result dict."""
    import json

    body_str = ""
    if "body" in tool_input and tool_input["body"] is not None:
        body_str = json.dumps(tool_input["body"])

    payload = {
        "method": tool_input.get("method", "GET"),
        "url": tool_input["url"],
        "headers": tool_input.get("headers", {}),
        "body": body_str,
        "timeout_ms": 10000,
    }

    try:
        resp = httpx.post(go_probe_url, json=payload, timeout=15.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        return {"status_code": 0, "body": "", "latency_ms": 0, "error": str(exc)}
