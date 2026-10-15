"""Handover completeness diagnostics, deliberately separate from qualification."""

from typing import Any


def _missing(value: Any, prefix: str = "") -> list[str]:
    if isinstance(value, dict):
        if not value:
            return [prefix]
        return [
            missing
            for key, child in value.items()
            if key not in {"instructions", "status", "contains_operational_data", "schema_version"}
            for missing in _missing(child, f"{prefix}.{key}".strip("."))
        ]
    if value is None or (isinstance(value, str) and not value.strip()) or value == []:
        return [prefix]
    return []


def _overlay(contract: dict[str, Any], supplied: dict[str, Any]) -> dict[str, Any]:
    return {
        key: _overlay(child, supplied.get(key, {}))
        if isinstance(child, dict) and isinstance(supplied.get(key, {}), dict)
        else supplied.get(key)
        for key, child in contract.items()
    }


def check_handover(manifest: dict[str, Any], template: dict[str, Any]) -> dict[str, Any]:
    if manifest.get("schema_version") != template["schema_version"]:
        raise ValueError("Unsupported pilot manifest schema")
    merged = _overlay(template, manifest)
    missing = _missing(merged)
    unresolved = []
    evaluation = merged.get("evaluation")
    acceptance = merged.get("acceptance")
    if isinstance(evaluation, dict) and evaluation.get("phase") == "not_started":
        unresolved.append("evaluation.phase")
    if not isinstance(acceptance, dict) or acceptance.get("decision") not in {"accept", "restrict"}:
        unresolved.append("acceptance.decision")
    return {
        "missing_fields": missing,
        "unresolved_states": unresolved,
        "handover_complete": not (missing or unresolved),
        "operational_qualification_established_by_this_check": False,
        "limits": "Checks populated fields only, not authenticity, permission, scientific validity "
        "or engineering sign-off. A complete manifest alone is never an operational release.",
    }
