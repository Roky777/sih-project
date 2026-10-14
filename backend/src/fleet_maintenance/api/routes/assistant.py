"""AI Maintenance Copilot API. Disabled by FLEET_ASSISTANT_ENABLED=false (routes then 404)."""

import json
from collections.abc import Iterator
from queue import Empty, Queue
from threading import Event, Thread
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from fleet_maintenance.api.dependencies import Actor, current_actor
from fleet_maintenance.domain.contracts.fleet_health import (
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantStatusResponse,
)
from fleet_maintenance.persistence.database import SessionLocal, get_session
from fleet_maintenance.services import fleet_health as service
from fleet_maintenance.services.assistant import copilot
from fleet_maintenance.services.assistant.tools import SCENARIO_ROLES, Context
from fleet_maintenance.settings import get_settings

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.get("/status", response_model=AssistantStatusResponse)
def status(actor: Actor = Depends(current_actor)) -> dict[str, Any]:
    settings = get_settings()
    if not settings.assistant_enabled:
        return {
            "enabled": False,
            "available": False,
            "model": None,
            "detail": "The assistant is turned off.",
            "can_run_scenarios": False,
        }
    available, detail = copilot.client().available()
    return {
        "enabled": True,
        "available": available,
        "model": copilot.model_name(),
        "detail": detail,
        "can_run_scenarios": actor.role in SCENARIO_ROLES,
    }


@router.post("/chat", response_model=AssistantChatResponse)
def chat(
    body: AssistantChatRequest,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.assistant_enabled:
        raise HTTPException(404, "The assistant is turned off.")
    if body.messages[-1].role != "user":
        raise HTTPException(422, "The last message must be from the user.")
    ctx = Context(**body.context.model_dump())
    try:
        turn = copilot.run_turn(session, actor, ctx, [m.model_dump() for m in body.messages])
    except copilot.AssistantUnavailable as exc:
        raise HTTPException(503, f"Assistant unavailable: {exc}") from None
    except service.EngineNotReady as exc:
        raise HTTPException(503, str(exc)) from None
    return {
        "reply": turn.reply,
        "answer_mode": turn.answer_mode,
        "tool_calls": turn.tool_calls,
        "artifacts": turn.artifacts,
        "citations": turn.citations,
        "warnings": turn.warnings,
        "context": {**body.context.model_dump(), "scenario_id": ctx.scenario_id},
        "model": copilot.model_name()
        if turn.answer_mode == "model"
        else "AeroCare application services",
        "data_label": copilot.data_label(ctx),
    }


@router.post("/chat/stream", response_class=StreamingResponse)
def chat_stream(
    body: AssistantChatRequest, actor: Actor = Depends(current_actor)
) -> StreamingResponse:
    if not get_settings().assistant_enabled:
        raise HTTPException(404, "The assistant is turned off.")
    if body.messages[-1].role != "user":
        raise HTTPException(422, "The last message must be from the user.")

    def events() -> Iterator[str]:
        queue: Queue[dict[str, Any]] = Queue()
        stopped = Event()

        def emit(event: dict[str, Any]) -> None:
            if stopped.is_set():
                raise copilot.AssistantUnavailable("The question was cancelled.")
            queue.put(event)

        def work() -> None:
            ctx = Context(**body.context.model_dump())
            try:
                with SessionLocal() as session:
                    turn = copilot.run_turn(
                        session, actor, ctx, [m.model_dump() for m in body.messages], emit=emit
                    )
                payload = AssistantChatResponse.model_validate(
                    {
                        "reply": turn.reply,
                        "answer_mode": turn.answer_mode,
                        "tool_calls": turn.tool_calls,
                        "artifacts": turn.artifacts,
                        "citations": turn.citations,
                        "warnings": turn.warnings,
                        "context": {**body.context.model_dump(), "scenario_id": ctx.scenario_id},
                        "model": copilot.model_name()
                        if turn.answer_mode == "model"
                        else "AeroCare application services",
                        "data_label": copilot.data_label(ctx),
                    }
                ).model_dump(mode="json")
                emit({"type": "done", "response": payload})
            except (copilot.AssistantUnavailable, service.EngineNotReady) as exc:
                queue.put({"type": "error", "message": str(exc)})
            except Exception:
                queue.put({"type": "error", "message": "The answer could not be completed."})

        Thread(target=work, daemon=True).start()
        try:
            yield json.dumps({"type": "status", "text": "Checking fleet records…"}) + "\n"
            while True:
                try:
                    event = queue.get(timeout=1)
                except Empty:
                    yield json.dumps({"type": "heartbeat"}) + "\n"
                    continue
                yield json.dumps(event) + "\n"
                if event["type"] in {"done", "error"}:
                    break
        finally:
            stopped.set()

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
