"""Copilot loop, tool allowlist, validation, permissions and answer checks (no model service)."""

from datetime import date
from types import SimpleNamespace
from typing import Any

import pytest

from fleet_maintenance.api.dependencies import Actor
from fleet_maintenance.services.assistant import copilot, tools
from fleet_maintenance.services.assistant.tools import Context, ToolError, ToolResult


class FakeLLM:
    """Replays scripted model messages and records what it was sent."""

    def __init__(self, script: list[dict[str, Any]]) -> None:
        self.script, self.sent = list(script), []

    def chat(self, messages: list[dict[str, Any]], tools: Any, timeout: float) -> dict[str, Any]:
        self.sent.append({"messages": [dict(m) for m in messages], "tools": tools})
        if not self.script:
            raise copilot.AssistantUnavailable("script exhausted")
        return self.script.pop(0)


class FakeSession:
    def rollback(self) -> None:
        pass


@pytest.fixture(autouse=True)
def bundle(monkeypatch: pytest.MonkeyPatch) -> None:
    from fleet_maintenance.services import fleet_health

    monkeypatch.setattr(
        fleet_health, "active_bundle", lambda session: SimpleNamespace(as_of=date(2026, 9, 30))
    )


def _fake_tool(monkeypatch: pytest.MonkeyPatch, data: dict[str, Any]) -> list[Any]:
    seen: list[Any] = []

    def run(session: Any, actor: Actor, ctx: Context, args: Any) -> ToolResult:
        seen.append((ctx, args))
        return ToolResult(
            data,
            [{"type": "prediction", "label": "forecast"}],
            [
                {
                    "id": "ADV-AC-017-FUE-BST-00017",
                    "kind": "finding",
                    "label": "Fuel boost pump finding",
                    "href": "/health/AC-017-FUE-BST",
                }
            ],
        )

    tool = tools.TOOLS["get_finding_details"]
    monkeypatch.setitem(
        tools.TOOLS, "get_finding_details", tools.Tool(tool.name, tool.description, tool.args, run)
    )
    return seen


def call(name: str, arguments: Any) -> dict[str, Any]:
    return {"content": "", "tool_calls": [{"function": {"name": name, "arguments": arguments}}]}


def test_tool_loop_uses_context_cites_real_records_and_flags_untraced_numbers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen = _fake_tool(monkeypatch, {"risk_14d": 0.6471, "rul_days": {"p10": 3.0, "p50": 8.5}})
    llm = FakeLLM(
        [
            call("get_finding_details", {}),
            {
                "content": "<think>x</think>Risk is 64.7% with RUL P50 8.5 days "
                "[ADV-AC-017-FUE-BST-00017]. Also [WO-99999] and 42.3 hours."
            },
        ]
    )
    ctx = Context(as_of=date(2026, 9, 1), advisory_id="ADV-AC-017-FUE-BST-00017")
    turn = copilot.run_turn(
        FakeSession(),
        Actor("u", "engineer"),
        ctx,  # type: ignore[arg-type]
        [{"role": "user", "content": "Explain this finding and its uncertainty"}],
        llm,
    )
    assert seen[0][0].as_of == date(2026, 9, 1)  # tools inherit the timeline date
    assert "<think>" not in turn.reply
    assert "[WO-99999]" not in turn.reply and any("WO-99999" in w for w in turn.warnings)
    assert "withheld" in turn.reply and "42.3" not in turn.reply
    assert any("42.3" in w for w in turn.warnings)  # not in tool output
    assert not any("64.7" in w or "8.5" in w for w in turn.warnings)  # traced (percent, value)
    assert turn.citations[0]["cited"] is False  # explanation was withheld
    assert turn.artifacts == [{"type": "prediction", "label": "forecast"}]
    system = llm.sent[0]["messages"][0]["content"]
    assert "historical date 2026-09-01" in system and "never use later information" in system


def test_unknown_tool_bad_arguments_and_malformed_json_are_reported_to_the_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    llm = FakeLLM(
        [
            {
                "content": "",
                "tool_calls": [
                    {"function": {"name": "delete_records", "arguments": {}}},
                    {
                        "function": {
                            "name": "get_aircraft_health",
                            "arguments": {"aircraft_id": "X; DROP"},
                        }
                    },
                    {"function": {"name": "get_sensor_history", "arguments": "{not json"}},
                ],
            },
            {"content": "I could not retrieve evidence for that request."},
        ]
    )
    turn = copilot.run_turn(
        FakeSession(),
        Actor("u", "viewer"),
        Context(),  # type: ignore[arg-type]
        [{"role": "user", "content": "go"}],
        llm,
    )
    errors = [c["error"] for c in turn.tool_calls]
    assert "Unknown tool" in errors[0]
    assert "Invalid arguments" in errors[1]
    assert "not valid JSON" in errors[2]
    tool_messages = [m for m in llm.sent[1]["messages"] if m["role"] == "tool"]
    assert len(tool_messages) == 3 and all('"error"' in m["content"] for m in tool_messages)
    # Echoed assistant tool calls always carry object arguments.
    echoed = [m for m in llm.sent[1]["messages"] if m.get("tool_calls")][0]["tool_calls"]
    assert all(isinstance(c["function"]["arguments"], dict) for c in echoed)


def test_scenario_tool_is_hidden_and_refused_without_planning_role() -> None:
    assert "run_what_if_scenario" not in {
        t["function"]["name"] for t in tools.tool_schemas("engineer")
    }
    assert "run_what_if_scenario" in {
        t["function"]["name"] for t in tools.tool_schemas("fleet_manager")
    }
    with pytest.raises(ToolError, match="not permitted"):
        tools.call_tool(
            FakeSession(),
            Actor("u", "engineer"),
            Context(),  # type: ignore[arg-type]
            "run_what_if_scenario",
            {"change": "spare_delay"},
        )


def test_scenario_arguments_are_strictly_typed() -> None:
    with pytest.raises(ToolError, match="Invalid arguments"):
        tools.call_tool(
            FakeSession(),
            Actor("u", "planner"),
            Context(),  # type: ignore[arg-type]
            "run_what_if_scenario",
            {"change": "reduce_technicians"},
        )
    with pytest.raises(ToolError, match="Invalid arguments"):
        tools.call_tool(
            FakeSession(),
            Actor("u", "planner"),
            Context(),  # type: ignore[arg-type]
            "run_what_if_scenario",
            {"change": "spare_delay", "delay_days": 900},
        )


def test_bounded_iterations_force_a_final_answer_without_tools(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _fake_tool(monkeypatch, {"value": 1})
    monkeypatch.setattr(copilot.get_settings(), "assistant_max_tool_iterations", 2)
    reply = "Done. [ADV-AC-017-FUE-BST-00017]"
    llm = FakeLLM([call("get_finding_details", {})] * 2 + [{"content": reply}])
    turn = copilot.run_turn(
        FakeSession(),
        Actor("u", "viewer"),
        Context(),  # type: ignore[arg-type]
        [{"role": "user", "content": "loop"}],
        llm,
    )
    assert turn.reply == reply and len(turn.tool_calls) == 2
    assert llm.sent[-1]["tools"] is None


def test_model_service_failures_surface_as_unavailable() -> None:
    with pytest.raises(copilot.AssistantUnavailable):
        copilot.run_turn(
            FakeSession(),
            Actor("u", "viewer"),
            Context(),  # type: ignore[arg-type]
            [{"role": "user", "content": "Explain the selected operating context"}],
            FakeLLM([]),
        )
    with pytest.raises(copilot.AssistantUnavailable, match="empty"):
        copilot.run_turn(
            FakeSession(),
            Actor("u", "viewer"),
            Context(),  # type: ignore[arg-type]
            [{"role": "user", "content": "Explain the selected operating context"}],
            FakeLLM([{"content": "  "}, {"content": ""}]),
        )
    unreachable = copilot.OllamaClient("http://127.0.0.1:9", "qwen3:8b", 2)
    assert unreachable.available()[0] is False
    with pytest.raises(copilot.AssistantUnavailable, match="not reachable"):
        unreachable.chat([{"role": "user", "content": "x"}], None, 2)


def test_untraced_number_check_ignores_ids_dates_and_small_counts() -> None:
    sources = [{"availability_mean": 0.7835, "aircraft_days_lost": 112.4}]
    reply = "Mean availability 78.4% (AC-017, 2026-09-30, 3 aircraft); 112.4 days lost; 55.5 h."
    assert copilot.untraced_numbers(reply, sources) == ["55.5"]


def test_empty_reply_gets_one_nudge_and_role_limits_are_explained() -> None:
    llm = FakeLLM([{"content": ""}, {"content": "Your role cannot run scenarios."}])
    turn = copilot.run_turn(
        FakeSession(),
        Actor("u", "engineer"),
        Context(),  # type: ignore[arg-type]
        [{"role": "user", "content": "Run a scenario"}],
        llm,
    )
    assert turn.reply == "Your role cannot run scenarios."
    assert "cannot run what-if scenarios" in llm.sent[0]["messages"][0]["content"]
    assert llm.sent[1]["messages"][-1]["role"] == "user"
