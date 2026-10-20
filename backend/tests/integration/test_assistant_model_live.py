"""Opt-in real-model smoke checks; fleet figures below are synthetic test fixtures."""

import os
from unittest.mock import patch

import pytest

from fleet_maintenance.api.dependencies import Actor
from fleet_maintenance.services.assistant import copilot
from fleet_maintenance.services.assistant.tools import Context, ToolResult

MODEL_URL = os.environ.get("FLEET_TEST_OLLAMA_URL")
pytestmark = pytest.mark.skipif(not MODEL_URL, reason="Opt in with FLEET_TEST_OLLAMA_URL")


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("How should I address you while we work together?", "aerocare"),
        ("Where would I start entering a newly acquired airframe?", "add aircraft"),
        ("Give me the size of our fleet and the subset currently available, please.", "23"),
    ],
)
def test_unmatched_questions_with_real_instruction_model(question: str, expected: str) -> None:
    class Session:
        def rollback(self):
            pass

    original = copilot.call_tool

    def fixture_tool(session, actor, ctx, name, args):
        if name == "get_fleet_summary":
            return ToolResult(
                {"as_of": "2026-09-30", "fleet_size": 37,
                 "by_availability_state": {"available": 23, "maintenance": 14},
                 "label": "synthetic test fixture"},
                citations=[{"id": "FLEET-TEST", "label": "Synthetic test fleet",
                            "kind": "fleet", "href": "/"}],
            )
        if name == "get_product_help":
            return original(session, actor, ctx, name, args)
        raise AssertionError(f"Unexpected tool in read-only smoke check: {name}")

    llm = copilot.OllamaClient(
        MODEL_URL or "", os.environ.get("FLEET_TEST_OLLAMA_MODEL", "qwen3:4b-instruct"),
        120, 4096,
    )
    with patch.object(copilot, "call_tool", fixture_tool):
        answer = copilot.run_turn(
            Session(), Actor("smoke", "viewer"), Context(),
            [{"role": "user", "content": question}], llm,
        )  # type: ignore[arg-type]
    assert answer.answer_mode == "model"  # Must exercise Qwen, never a phrase route.
    assert expected in answer.reply.lower()
    assert "withheld" not in answer.reply and not answer.warnings
    if expected == "23":
        assert "37" in answer.reply
        assert answer.tool_calls[0]["name"] == "get_fleet_summary"
        assert answer.citations[0]["cited"]
