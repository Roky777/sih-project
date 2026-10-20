"""Bounded common wording must not require a model or discard user constraints."""

import pytest

from fleet_maintenance.api.dependencies import Actor
from fleet_maintenance.services.assistant import copilot, quick_answers
from fleet_maintenance.services.assistant.tools import Context


@pytest.mark.parametrize(
    ("question", "canonical"),
    [
        ("Hi, please tell me how many planes are available now?",
         "how many aircraft are available"),
        ("How many airplanes do we have?", "how many aircraft are in the fleet"),
        ("Number of aircraft", "how many aircraft are in the fleet"),
        ("Show me current fleet availability", "what is the current availability"),
        ("Which alerts are urgent?", "which findings need attention first"),
        ("List open warnings", "which findings need attention first"),
        ("Which parts are missing?", "which spare shortages affect the current plan"),
        ("Show spare shortages", "which spare shortages affect the current plan"),
        ("What work orders are pending for this aircraft?",
         "what maintenance is open for this aircraft"),
        ("What is the status of this aircraft?", "summarise this aircraft"),
        ("Show me the availability forecast", "show the 30-day availability forecast"),
        ("Show recent sensor trends", "show the recent sensor trends behind this alert"),
        ("Explain the selected warning", "explain this finding with evidence"),
    ],
)
def test_bounded_wording_uses_existing_record_route(question: str, canonical: str) -> None:
    assert quick_answers.normalize_question(question) == canonical


@pytest.mark.parametrize(
    "question",
    [
        "How many fights are available?", "How many flights are available now?",
        "How many fighters are available?", "Show sensor history",
        "Explain this alert", "What work is open for this aircraft?",
        "How many are in stock?", "What is the status of this aircraft?",
    ],
)
def test_missing_identity_or_ambiguous_scope_clarifies_without_model(
    monkeypatch: pytest.MonkeyPatch, question: str
) -> None:
    monkeypatch.setattr(copilot, "client", lambda: pytest.fail("Must not load inference"))
    monkeypatch.setattr(quick_answers, "call_tool", lambda *args: pytest.fail("No guessed record"))
    answer = copilot.run_turn(
        None, Actor("v", "viewer"), Context(), [{"role": "user", "content": question}]
    )  # type: ignore[arg-type]
    assert answer.reply and answer.answer_mode != "model"


def test_unknown_part_is_not_zero_stock(monkeypatch: pytest.MonkeyPatch) -> None:
    from fleet_maintenance.services.assistant.tools import ToolResult

    monkeypatch.setattr(
        quick_answers, "call_tool", lambda *args: ToolResult({"parts": []})
    )
    monkeypatch.setattr(copilot, "client", lambda: pytest.fail("Must not load inference"))

    class Session:
        def rollback(self):
            pass

    answer = copilot.run_turn(
        Session(), Actor("v", "viewer"), Context(),
        [{"role": "user", "content": "What is the stock level for ABC-999?"}],
    )  # type: ignore[arg-type]
    assert "No matching" in answer.reply and "do not mean zero" in answer.reply
