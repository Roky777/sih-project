import io
import json
from datetime import date
from typing import Any

import pytest

from fleet_maintenance.api.dependencies import Actor
from fleet_maintenance.services.assistant import copilot, quick_answers
from fleet_maintenance.services.assistant.groq import GroqClient
from fleet_maintenance.services.assistant.tools import Context, ToolResult


class Session:
    def rollback(self) -> None:
        pass


@pytest.mark.parametrize(
    ("content", "answer"),
    [
        ("<think>Private scratchpad</think>Checked answer", "Checked answer"),
        ("Private scratchpad</think>Checked answer", "Checked answer"),
        ("Checked answer<think>unfinished scratchpad", "Checked answer"),
        ("Checked answer", "Checked answer"),
    ],
)
def test_reasoning_wrappers_are_not_part_of_the_final_answer(content: str, answer: str) -> None:
    assert copilot._strip_thinking(content) == answer


@pytest.mark.parametrize("question", [
    "What is the current availability?", "current availability", " Show fleet availability! ",
    "What's the current fleet availability?",
    "Hello, how many aircraft are available?",
    "Please tell me how many planes are available today?",
    "Can you show me today's fleet availability?",
    "How many aircrafts are currently available?",
    "How many jets are operational?",
])
def test_direct_answer_uses_selected_date_without_loading_model(
    monkeypatch: pytest.MonkeyPatch, question: str,
) -> None:
    seen = []

    def tool(session: Any, actor: Actor, ctx: Context, name: str, args: Any) -> ToolResult:
        seen.append((ctx.as_of, name))
        return ToolResult(
            {
                "as_of": "2026-07-28",
                "aircraft": 40,
                "availability_today": 0.8,
                "by_availability_state": {"available": 32},
            }
        )

    monkeypatch.setattr(quick_answers, "call_tool", tool)
    monkeypatch.setattr(copilot, "client", lambda: pytest.fail("Must not load inference"))
    turn = copilot.run_turn(
        Session(),
        Actor("demo", "viewer"),  # type: ignore[arg-type]
        Context(as_of=date(2026, 7, 28)),
        [{"role": "user", "content": question}],
    )
    assert seen == [(date(2026, 7, 28), "get_fleet_summary")]
    assert "32 of 40" in turn.reply and "80%" in turn.reply and "2026-07-28" in turn.reply


@pytest.mark.parametrize(
    "question",
    [
        "Why is fleet availability dropping?",
        "What if availability drops?",
        "How many aircraft are available tomorrow?",
        "How many aircraft are there and why?",
        "What was availability on 2026-07-01?",
        "Current availability tomorrow",
        "Show fleet availability and cancel maintenance",
        "Show the 30-day availability forecast for AC-014",
        "How many planes are available tomorrow?",
        "How many planes are available if we repair AC-014?",
        "How many jets are available and approve all work?",
        "How many aircraft were available yesterday?",
        "Show sensor history for AC-014",
    ],
)
def test_ambiguous_or_explanatory_questions_do_not_use_direct_answer(question: str) -> None:
    assert (
        quick_answers.quick_answer(
            Session(),
            Actor("u", "viewer"),
            Context(),  # type: ignore[arg-type]
            [{"role": "user", "content": question}],
        )
        is None
    )


def test_stock_answer_preserves_reserved_and_available_counts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def tool(session: Any, actor: Actor, ctx: Context, name: str, args: Any) -> ToolResult:
        assert name == "get_spare_availability" and args == {"part_number": "PRP-230"}
        return ToolResult(
            {
                "as_of": "2026-09-30",
                "parts": [{"on_hand": 3, "reserved": 2, "available": 1, "on_order": 4}],
            }
        )

    monkeypatch.setattr(quick_answers, "call_tool", tool)
    turn = quick_answers.quick_answer(
        Session(),
        Actor("u", "viewer"),
        Context(),  # type: ignore[arg-type]
        [{"role": "user", "content": "How many PRP-230 are in stock?"}],
    )
    assert "3 on hand, 2 reserved and 1 available" in turn.reply


class Response(io.BytesIO):
    pass


def test_aircraft_days_are_not_valid_percentage_evidence() -> None:
    assert copilot.untraced_numbers("84.5% lost", [{"aircraft_days_lost": 84.5}]) == ["84.5%"]
    assert copilot.untraced_numbers("2% risk", [{"risk_14d": 0.02}]) == []


def test_hosted_transcript_links_tool_result_to_call_and_keeps_key_server_side(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def request(req: Any, timeout: float) -> Response:
        body = json.loads(req.data)
        call = body["messages"][1]["tool_calls"][0]
        assert body["messages"][2]["tool_call_id"] == call["id"]
        assert json.loads(call["function"]["arguments"]) == {"aircraft_id": "AC-001"}
        assert "test-secret" not in req.data.decode()
        return Response(json.dumps({"choices": [{"message": {"content": "Answer"}}]}).encode())

    monkeypatch.setattr("urllib.request.urlopen", request)
    result = GroqClient("test-secret", "openai/gpt-oss-20b", 30).chat(
        [
            {"role": "user", "content": "Explain"},
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "function": {
                            "name": "get_aircraft_health",
                            "arguments": {"aircraft_id": "AC-001"},
                        }
                    }
                ],
            },
            {"role": "tool", "tool_name": "get_aircraft_health", "content": "{}"},
        ],
        None,
        30,
    )
    assert result["content"] == "Answer"


def test_hosted_stream_yields_text_and_requires_completion(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[str] = []
    data = (
        b'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n'
        b'data: {"choices":[{"delta":{"content":"fleet"}}]}\n\n'
        b"data: [DONE]\n"
    )
    monkeypatch.setattr("urllib.request.urlopen", lambda *a, **kw: Response(data))
    result = GroqClient("key", "openai/gpt-oss-20b", 30).chat([], None, 30, events.append)
    assert events == ["Hello ", "fleet"] and result["content"] == "Hello fleet"
    monkeypatch.setattr(
        "urllib.request.urlopen", lambda *a, **kw: Response(data.split(b"data: [DONE]")[0])
    )
    with pytest.raises(copilot.AssistantUnavailable, match="ended early"):
        GroqClient("key", "openai/gpt-oss-20b", 30).chat([], None, 30, events.append)


def test_known_explanation_retrieves_fresh_cutoff_evidence_without_inference(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[Any] = []

    def retrieve(session: Any, actor: Actor, ctx: Context, name: str, args: Any) -> ToolResult:
        seen.append((name, ctx.as_of))
        return ToolResult(
            {
                "availability_today": 0.8,
                "as_of": "2026-07-28",
                "by_availability_state": {"available": 32, "unscheduled_repair": 8},
                "observed_last_14_days": [
                    {"date": "2026-07-27", "availability": 0.9},
                    {"date": "2026-07-28", "availability": 0.8},
                ],
            }
        )

    monkeypatch.setattr(quick_answers, "call_tool", retrieve)
    monkeypatch.setattr(copilot, "client", lambda: pytest.fail("No inference needed"))
    turn = copilot.run_turn(
        Session(),
        Actor("u", "viewer"),  # type: ignore[arg-type]
        Context(as_of=date(2026, 7, 28)),
        [{"role": "user", "content": "Explain the drop in fleet availability."}],
    )
    assert seen == [("get_fleet_summary", date(2026, 7, 28))]
    assert "90% on 2026-07-27" in turn.reply and "80% on 2026-07-28" in turn.reply
    assert "8 unscheduled repair" in turn.reply


def test_forecast_preserves_aircraft_day_units(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        quick_answers,
        "call_tool",
        lambda *a: ToolResult(
            {
                "as_of": "2026-07-28",
                "availability_mean": 0.8,
                "p10": 0.7,
                "p90": 0.9,
                "aircraft_days_lost": 84.5,
            }
        ),
    )
    turn = quick_answers.quick_answer(
        Session(),
        Actor("u", "viewer"),
        Context(),  # type: ignore[arg-type]
        [{"role": "user", "content": "What does the 30-day availability forecast show?"}],
    )
    assert turn is not None
    assert "84.5" in turn.reply and "84.5%" not in turn.reply
    assert "70%–90%" in turn.reply and "not observed" in turn.reply


def test_sensor_missingness_and_empty_search_are_not_fault_or_completion_claims(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def retrieve(session: Any, actor: Actor, ctx: Context, name: str, args: Any) -> ToolResult:
        if name == "get_sensor_history":
            return ToolResult(
                {
                    "component": "Turbine",
                    "component_id": "AC-033-ENG-TRB",
                    "as_of": "2026-07-28",
                    "window_days": 60,
                    "sensors": [
                        {
                            "name": "Vibration",
                            "first": None,
                            "latest": 0.86,
                            "unit": "ips",
                            "missing_share": 0.83,
                        }
                    ],
                }
            )
        assert args["status"] == "open" and args["aircraft_id"] == "AC-017"
        return ToolResult({"as_of": "2026-07-28", "recorded": [], "planned_proposals": []})

    monkeypatch.setattr(quick_answers, "call_tool", retrieve)
    sensors = quick_answers.quick_answer(
        Session(),
        Actor("u", "viewer"),
        Context(component_id="AC-033-ENG-TRB"),  # type: ignore[arg-type]
        [{"role": "user", "content": "Show the recent sensor trends behind this alert."}],
    )
    assert sensors is not None
    assert "first missing" in sensors.reply and "missing data 83%" in sensors.reply
    assert "do not establish" in sensors.reply
    work = quick_answers.quick_answer(
        Session(),
        Actor("u", "viewer"),
        Context(aircraft_id="AC-017"),  # type: ignore[arg-type]
        [{"role": "user", "content": "What maintenance is open for this aircraft?"}],
    )
    assert work is not None and "does not prove all maintenance is completed" in work.reply


def test_selected_finding_answer_keeps_assessment_separate_from_forecast(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def retrieve(session: Any, actor: Actor, ctx: Context, name: str, args: Any) -> ToolResult:
        assert ctx.component_id == "AC-014-PRP-230" and name == "get_finding_details"
        return ToolResult({
            "aircraft": "AC-014", "component": "Turbine", "as_of": "2026-07-28",
            "health_state": "critical", "health_index": 35,
            "risk_14d": 0.75, "rul_days": {"p10": 2, "p50": 5, "p90": 9},
            "priority": {"level": "P1"}, "recommended_action": "Review replacement",
            "advisory_id": "ADV-014",
        }, citations=[{"id": "ADV-014"}])

    monkeypatch.setattr(quick_answers, "call_tool", retrieve)
    turn = quick_answers.quick_answer(
        Session(), Actor("u", "viewer"),  # type: ignore[arg-type]
        Context(component_id="AC-014-PRP-230"),
        [{"role": "user", "content": "Explain this finding with evidence."}],
    )
    assert turn is not None
    assert "Recorded assessment: critical" in turn.reply
    assert "Model forecast: 75%" in turn.reply and "P10–P90 2–9 days" in turn.reply
    assert "needs engineer review" in turn.reply and turn.citations[0]["cited"]
    missing = quick_answers.quick_answer(
        Session(), Actor("u", "viewer"), Context(),  # type: ignore[arg-type]
        [{"role": "user", "content": "Explain this finding with evidence."}],
    )
    assert missing is not None and "Select a component" in missing.reply
