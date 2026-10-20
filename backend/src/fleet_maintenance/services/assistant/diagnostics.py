"""Operator-only assistant timings. No prompts, answers, secrets or record IDs are reported."""

import argparse
import json
import time
from typing import Any

from fleet_maintenance.api.dependencies import Actor
from fleet_maintenance.persistence.database import SessionLocal
from fleet_maintenance.services.assistant import copilot
from fleet_maintenance.services.assistant.tools import Context, tool_schemas
from fleet_maintenance.settings import get_settings


def report(*, records: bool = False, benchmark: bool = False) -> dict[str, Any]:
    settings = get_settings()
    result: dict[str, Any] = {
        "enabled": settings.assistant_enabled,
        "provider": settings.assistant_provider,
        "model": copilot.model_name(),
        "context_tokens": settings.assistant_context_tokens,
        "keep_alive": settings.assistant_keep_alive,
        "issues": [],
    }
    greetings = []
    for greeting in ("hi", "hello"):
        started = time.monotonic()
        answer = copilot.run_turn(
            None, Actor("local-performance-check", "viewer"), Context(),  # type: ignore[arg-type]
            [{"role": "user", "content": greeting}],
        )
        greetings.append({
            "elapsed_ms": round((time.monotonic() - started) * 1000, 2),
            "answer_mode": answer.answer_mode,
        })
    result["greetings"] = greetings
    question = "How should I address you while we work together?"
    messages = [
        {"role": "system", "content": copilot._system_prompt(Context(), "viewer")},
        {"role": "user", "content": question},
    ]
    original = json.dumps(
        {"messages": messages, "tools": tool_schemas("viewer")}, separators=(",", ":"),
    )
    reduced = json.dumps({"messages": messages}, separators=(",", ":"))
    result["self_introduction_prompt"] = {
        "original_chars": len(original), "reduced_chars": len(reduced),
        "reduction_percent": round(100 * (1 - len(reduced) / len(original)), 1),
        "measurement": "Request characters, not measured model latency or token counts",
    }
    if records:
        timings = []
        for question in (
            "What is the current availability?", "How many aircraft are in the fleet?",
        ):
            started = time.monotonic()
            try:
                with SessionLocal() as session:
                    answer = copilot.run_turn(
                        session, Actor("local-performance-check", "viewer"), Context(),
                        [{"role": "user", "content": question}],
                    )
                timings.append({
                    "elapsed_ms": round((time.monotonic() - started) * 1000, 2),
                    "answer_mode": answer.answer_mode,
                })
            except Exception:
                result["issues"].append("records.unavailable")
                break
        result["record_queries"] = timings
    if settings.assistant_provider != "ollama":
        if benchmark:
            result["issues"].append("benchmark.requires_local_ollama")
        return result
    llm = copilot.client()
    available, _ = llm.available()
    result["model_available"] = available
    try:
        running = llm._request("/api/ps", None, 3).get("models", [])
        result["configured_model_loaded"] = any(
            item.get("name") == settings.assistant_model for item in running
        )
        result["loaded_model_memory"] = [
            {key: item.get(key) for key in ("size", "size_vram", "context_length")}
            for item in running if item.get("name") == settings.assistant_model
        ]
    except Exception:
        result["issues"].append("model.residency_unavailable")
    if benchmark:
        if not available or not settings.assistant_enabled:
            result["issues"].append("benchmark.model_unavailable")
        else:
            started = time.monotonic()
            try:
                # One synthetic introduction, same streaming transport and prompt as the app.
                # No business records, tool execution or generated answer are exported.
                llm.chat(
                    messages, None, settings.assistant_timeout_seconds, on_delta=lambda _: None
                )
                result["model_timing"] = llm.last_metrics
            except Exception:
                result["issues"].append("benchmark.failed_or_timed_out")
                result["benchmark_elapsed_ms"] = round((time.monotonic() - started) * 1000, 2)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--records", action="store_true", help="Time two read-only fleet queries")
    parser.add_argument(
        "--benchmark", action="store_true", help="Generate one synthetic introduction"
    )
    args = parser.parse_args()
    result = report(records=args.records, benchmark=args.benchmark)
    print(json.dumps(result, indent=2))
    raise SystemExit(1 if result["issues"] else 0)


if __name__ == "__main__":
    main()
