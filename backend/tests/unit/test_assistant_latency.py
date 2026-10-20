"""Prompt cost, competing local turns and redacted Ollama timing regressions."""

import io
import json
import logging
from datetime import date
from types import SimpleNamespace
from typing import Any

import pytest

from fleet_maintenance.api.dependencies import Actor
from fleet_maintenance.services.assistant import copilot
from fleet_maintenance.services.assistant.tools import Context


class Reply:
    def __init__(self, fail: bool = False) -> None:
        self.sent: list[Any] = []
        self.fail = fail

    def chat(self, messages: Any, tools: Any, timeout: float) -> dict[str, Any]:
        self.sent.append(tools)
        if self.fail:
            raise copilot.AssistantUnavailable("fixture model failure")
        return {"content": "I'm the AeroCare maintenance copilot."}


def turn(question: str, llm: Any) -> copilot.Turn:
    return copilot.run_turn(
        None, Actor("fixture", "viewer"), Context(),
        [{"role": "user", "content": question}], llm,
    )  # type: ignore[arg-type]


def test_self_introduction_still_uses_model_without_expensive_record_tool_menu() -> None:
    llm = Reply()
    result = turn("How should I address you while we work together?", llm)
    assert result.answer_mode == "model" and llm.sent == [None]
    assert not result.tool_calls


@pytest.mark.parametrize("question", [
    "Introduce yourself and show the current fleet count",
    "What is your name and which aircraft are available?",
    "Tell me about yourself tomorrow",
    "Explain that again",  # An ambiguous follow-up retains retrieval capabilities.
    "Give me the size of our fleet and the subset currently available, please.",
    "Where would I start entering a newly acquired airframe?",
])
def test_other_questions_keep_the_full_authorized_tool_menu(question: str) -> None:
    llm = Reply()
    turn(question, llm)
    assert llm.sent[0]
    names = {tool["function"]["name"] for tool in llm.sent[0]}
    assert {"get_fleet_summary", "get_product_help"}.issubset(names)
    assert "run_what_if_scenario" not in names


def test_busy_local_model_does_not_queue_more_inference_or_block_site_help() -> None:
    with copilot._LOCAL_INFERENCE:
        llm = Reply()
        with pytest.raises(copilot.AssistantUnavailable, match="answering another question"):
            turn("How should I address you while we work together?", llm)
        assert llm.sent == []
        assert turn("What is AeroCare?", llm).answer_mode == "guidance"
        assert llm.sent == []
    assert turn("How should I address you while we work together?", Reply()).reply


def test_local_inference_slot_is_released_after_model_failure() -> None:
    with pytest.raises(copilot.AssistantUnavailable, match="fixture model failure"):
        turn("How should I address you while we work together?", Reply(fail=True))
    assert turn("How should I address you while we work together?", Reply()).reply


@pytest.mark.parametrize("stream", [False, True])
def test_ollama_reports_timings_without_logging_prompts_or_answers(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, stream: bool,
) -> None:
    payload = {
        "done": True, "message": {"content": "private answer"},
        "load_duration": 2000000, "prompt_eval_duration": 5000000,
        "eval_duration": 9000000, "prompt_eval_count": 42, "eval_count": 8,
    }

    class Response(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            self.close()

    def request(req, timeout):
        body = json.loads(req.data)
        assert body["think"] is False
        assert body["options"]["num_predict"] == 480
        return Response((json.dumps(payload) + ("\n" if stream else "")).encode())

    monkeypatch.setattr("urllib.request.urlopen", request)
    llm = copilot.OllamaClient("http://private-endpoint", "fixture-model", 30)
    with caplog.at_level(logging.INFO, logger="fleet.assistant"):
        result = llm.chat(
            [{"role": "user", "content": "private prompt"}], None, 30,
            on_delta=(lambda text: None) if stream else None,
        )
    assert result["content"] == "private answer"
    assert llm.last_metrics["load_ms"] == 2
    assert llm.last_metrics["prompt_eval_ms"] == 5
    assert llm.last_metrics["eval_ms"] == 9
    assert llm.last_metrics["eval_count"] == 8
    assert ("first_delta_ms" in llm.last_metrics) is stream
    assert "assistant_model_timing" in caplog.text
    assert all(secret not in caplog.text for secret in (
        "private prompt", "private answer", "private-endpoint",
    ))


def test_recorded_fleet_summary_does_not_trigger_forecast_and_default_keeps_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from fleet_maintenance.services import fleet_health as service

    bundle = SimpleNamespace(replay_offset=lambda _: 0)
    recorded = {"aircraft": 37, "by_availability_state": {"available": 23}}
    monkeypatch.setattr(service, "advisories", lambda *args: (bundle, 0, []))
    monkeypatch.setattr(service, "overlay", lambda *args: service.decisions.EMPTY_OVERLAY)
    monkeypatch.setattr(service.decisions, "fleet_summary", lambda *args: dict(recorded))
    monkeypatch.setattr(service, "alerts", lambda *args: [])
    monkeypatch.setattr(service, "forecast", lambda *args: pytest.fail("No simulation for records"))
    result = service.summary(None, None, include_forecast=False)  # type: ignore[arg-type]
    assert result == {**recorded, "alerts_open": 0}
    forecast = {key: 0 for key in (
        "availability_mean", "availability_p10", "availability_p50", "availability_p90",
        "aircraft_days_lost", "by_cause", "expected_failures", "horizon_days", "runs",
    )}
    monkeypatch.setattr(service, "forecast", lambda *args: forecast)
    complete = service.summary(None, None)  # type: ignore[arg-type]
    assert complete == {**result, "forecast_30d": forecast}


def test_recorded_history_retains_replay_cutoff_without_forecast(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from fleet_maintenance.services import fleet_health as service

    bundle = SimpleNamespace(replay_offset=lambda _: 100, replay_start_day=200)
    monkeypatch.setattr(service, "active_bundle", lambda _: bundle)
    monkeypatch.setattr(service, "offset_for", lambda b, as_of: 15)
    monkeypatch.setattr(service, "overlay", lambda _: pytest.fail("No current state in replay"))
    monkeypatch.setattr(service, "forecast", lambda *args: pytest.fail("No forecast"))
    expected = [{"date": "2026-07-01", "availability": 0.5}]

    def recorded(b, days, end_day, overlay):
        assert b is bundle and days == 14 and end_day == 215
        assert overlay is service.decisions.EMPTY_OVERLAY
        return expected

    monkeypatch.setattr(service.decisions, "availability_history", recorded)
    actual = service.recorded_availability_history(
        None, date(2026, 7, 1), days=14,
    )  # type: ignore[arg-type]
    assert actual == expected


def test_model_generation_releases_the_callers_read_transaction() -> None:
    class Session:
        released = False

        def rollback(self):
            self.released = True

    session = Session()

    class LLM:
        def chat(self, *args, **kwargs):
            assert session.released
            return {"content": "I'm the AeroCare copilot."}

    result = copilot.run_turn(
        session, Actor("fixture", "viewer"), Context(),
        [{"role": "user", "content": "How should I address you while we work together?"}],
        LLM(),
    )  # type: ignore[arg-type]
    assert result.reply


def test_answer_stream_releases_authentication_connection_before_starting_worker() -> None:
    from fleet_maintenance.api.routes.assistant import chat_stream
    from fleet_maintenance.domain.contracts.fleet_health import AssistantChatRequest

    class Session:
        released = False

        def rollback(self):
            self.released = True

    session = Session()
    response = chat_stream(
        AssistantChatRequest(messages=[{"role": "user", "content": "hello"}]),
        Actor("fixture", "viewer"), session,
    )
    assert session.released and response.media_type == "application/x-ndjson"
