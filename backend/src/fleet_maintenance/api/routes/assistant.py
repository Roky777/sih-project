"""AI Maintenance Copilot API. Disabled by FLEET_ASSISTANT_ENABLED=false (routes then 404)."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from fleet_maintenance.api.dependencies import Actor, current_actor
from fleet_maintenance.domain.contracts.fleet_health import (
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantStatusResponse,
)
from fleet_maintenance.persistence.database import get_session
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
        "model": settings.assistant_model,
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
        "tool_calls": turn.tool_calls,
        "artifacts": turn.artifacts,
        "citations": turn.citations,
        "warnings": turn.warnings,
        "context": {**body.context.model_dump(), "scenario_id": ctx.scenario_id},
        "model": settings.assistant_model,
        "data_label": copilot.DATA_LABEL,
    }
