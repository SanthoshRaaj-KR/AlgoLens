"""Swagger / OpenAPI spec ingestion and summarisation."""

from __future__ import annotations

import json
from typing import Any

import httpx
import yaml


_spec_cache: dict[str, dict] = {}


def load_spec(url_or_path: str) -> dict:
    """Fetch spec from a URL or local file path. Returns the raw parsed dict."""
    if url_or_path.startswith("http://") or url_or_path.startswith("https://"):
        try:
            resp = httpx.get(url_or_path, timeout=15.0, follow_redirects=True)
            resp.raise_for_status()
            content = resp.text
        except httpx.HTTPStatusError as exc:
            raise ValueError(f"Spec URL returned HTTP {exc.response.status_code}: {url_or_path}") from exc
        except Exception as exc:
            raise ValueError(f"Could not fetch spec: {exc}") from exc
    else:
        try:
            with open(url_or_path, "r", encoding="utf-8") as f:
                content = f.read()
        except OSError as exc:
            raise ValueError(f"Could not read spec file: {exc}") from exc

    # Try JSON first, then YAML
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass
    try:
        return yaml.safe_load(content)
    except yaml.YAMLError as exc:
        raise ValueError(f"Spec is neither valid JSON nor valid YAML: {exc}") from exc


def _extract_base_url(spec: dict) -> str:
    # OpenAPI 3.x
    servers = spec.get("servers", [])
    if servers and isinstance(servers, list):
        url = servers[0].get("url", "")
        if url:
            return url.rstrip("/")
    # Swagger 2.x
    host = spec.get("host", "")
    base_path = spec.get("basePath", "/")
    schemes = spec.get("schemes", ["https"])
    if host:
        scheme = schemes[0] if schemes else "https"
        return f"{scheme}://{host}{base_path}".rstrip("/")
    return ""


def _extract_auth_schemes(spec: dict) -> list[str]:
    schemes = []
    # OpenAPI 3.x
    security_schemes = spec.get("components", {}).get("securitySchemes", {})
    for name, scheme in security_schemes.items():
        scheme_type = scheme.get("type", "")
        if scheme_type == "http":
            schemes.append(scheme.get("scheme", "bearer"))
        elif scheme_type == "apiKey":
            schemes.append(f"apiKey ({scheme.get('in','header')}: {scheme.get('name',name)})")
        else:
            schemes.append(scheme_type)
    # Swagger 2.x
    security_defs = spec.get("securityDefinitions", {})
    for name, defn in security_defs.items():
        defn_type = defn.get("type", "")
        if defn_type == "apiKey":
            schemes.append(f"apiKey ({defn.get('in','header')}: {defn.get('name',name)})")
        elif defn_type == "basic":
            schemes.append("basic")
        elif defn_type == "oauth2":
            schemes.append("oauth2")
    return list(set(schemes)) if schemes else ["unknown"]


def _simple_schema_fields(schema: dict | None, components: dict) -> list[str]:
    """Extract top-level field names from a JSON Schema object, resolving $ref one level deep."""
    if not schema:
        return []
    if "$ref" in schema:
        ref = schema["$ref"]
        parts = ref.lstrip("#/").split("/")
        resolved = components
        for part in parts:
            if isinstance(resolved, dict):
                resolved = resolved.get(part, {})
        schema = resolved if isinstance(resolved, dict) else {}
    props = schema.get("properties", {})
    required = schema.get("required", [])
    fields = []
    for field, prop in props.items():
        ftype = prop.get("type", "any")
        marker = "*" if field in required else ""
        fields.append(f"{field}{marker} ({ftype})")
    return fields


def _extract_endpoints(spec: dict) -> list[dict]:
    paths: dict[str, Any] = spec.get("paths", {})
    components = spec.get("components", {})  # OpenAPI 3.x
    definitions = spec.get("definitions", {})  # Swagger 2.x
    all_refs = {**components, "definitions": definitions, "schemas": components.get("schemas", {})}

    endpoints = []
    for path, methods in paths.items():
        if not isinstance(methods, dict):
            continue
        for method, operation in methods.items():
            if method.lower() in ("parameters", "summary", "description", "servers"):
                continue
            if not isinstance(operation, dict):
                continue

            description = (
                operation.get("summary")
                or operation.get("operationId")
                or operation.get("description", "")
            )

            # Required query/path params
            required_params: list[str] = []
            for param in operation.get("parameters", []):
                if isinstance(param, dict) and param.get("required"):
                    required_params.append(
                        f"{param.get('name','')} ({param.get('in','?')})"
                    )

            # Request body fields
            required_body_fields: list[str] = []
            # OpenAPI 3.x
            req_body = operation.get("requestBody", {})
            if req_body:
                content = req_body.get("content", {})
                json_content = content.get("application/json", {})
                schema = json_content.get("schema", {})
                required_body_fields = _simple_schema_fields(schema, all_refs)
            # Swagger 2.x — body param
            for param in operation.get("parameters", []):
                if isinstance(param, dict) and param.get("in") == "body":
                    schema = param.get("schema", {})
                    required_body_fields = _simple_schema_fields(schema, all_refs)

            # Response shape (200 or first success code)
            response_fields: list[str] = []
            responses = operation.get("responses", {})
            for code in ("200", "201", "default"):
                resp = responses.get(code, {})
                if resp:
                    # OpenAPI 3.x
                    content = resp.get("content", {})
                    json_content = content.get("application/json", {})
                    schema = json_content.get("schema", {})
                    if not schema:
                        # Swagger 2.x
                        schema = resp.get("schema", {})
                    if schema:
                        response_fields = _simple_schema_fields(schema, all_refs)
                    break

            endpoints.append({
                "method": method.upper(),
                "path": path,
                "description": description,
                "required_params": required_params,
                "required_body_fields": required_body_fields,
                "response_shape": response_fields,
            })

    return endpoints


def summarise_spec(spec: dict) -> dict:
    """Extract a clean structured summary from a raw spec dict."""
    title = (
        spec.get("info", {}).get("title")
        or spec.get("title", "Unknown API")
    )
    return {
        "title": title,
        "base_url": _extract_base_url(spec),
        "auth_schemes": _extract_auth_schemes(spec),
        "endpoints": _extract_endpoints(spec),
    }


def format_for_claude(summary: dict) -> str:
    """Convert a summary dict to a readable text block for Claude's system prompt."""
    lines: list[str] = []
    lines.append(f"API: {summary['title']}")
    lines.append(f"Base URL: {summary['base_url']}")

    auth = ", ".join(summary.get("auth_schemes", []))
    lines.append(f"Auth: {auth}")
    lines.append("")
    lines.append("Available endpoints:")

    for ep in summary.get("endpoints", []):
        lines.append(f"\n{ep['method']} {ep['path']}")
        if ep.get("description"):
            lines.append(f"  Description: {ep['description']}")
        if ep.get("required_params"):
            lines.append(f"  Required params: {', '.join(ep['required_params'])}")
        if ep.get("required_body_fields"):
            lines.append(f"  Body fields: {', '.join(ep['required_body_fields'])}")
        if ep.get("response_shape"):
            lines.append(f"  Returns: {', '.join(ep['response_shape'])}")

    return "\n".join(lines)


def get_cached_summary(spec_url: str) -> dict | None:
    return _spec_cache.get(spec_url)


def cache_summary(spec_url: str, summary: dict) -> None:
    _spec_cache[spec_url] = summary
