from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from fleet_maintenance.api.dependencies import Actor, current_actor, require_supervisor
from fleet_maintenance.persistence.database import get_session
from fleet_maintenance.persistence.models import WorkRecord
from fleet_maintenance.services.approvals import ApprovalConflict
from fleet_maintenance.services.reservations import update_work

router = APIRouter(prefix="/work", tags=["work"])


class WorkOutcome(BaseModel):
    action: Literal["start", "complete", "cancel", "verify"]
    expected_version: int = Field(ge=1)
    notes: str = Field(min_length=1, max_length=1000)


def serialize(work: WorkRecord) -> dict[str, object]:
    return {
        "id": work.id,
        "plan_id": work.plan_id,
        "task_id": work.task_id,
        "status": work.status,
        "version": work.version,
        "consumed_quantity": work.consumed_quantity,
        "notes": work.notes,
        "started_at": work.started_at,
        "completed_at": work.completed_at,
    }


@router.get("")
def list_work(session: Session = Depends(get_session)) -> list[dict[str, object]]:
    return [
        serialize(work)
        for work in session.scalars(select(WorkRecord).order_by(WorkRecord.id)).all()
    ]


@router.post("/{work_id}/outcome")
def outcome(
    work_id: str,
    body: WorkOutcome,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, object]:
    require_supervisor(actor)
    try:
        return serialize(
            update_work(session, work_id, body.action, body.expected_version, actor.id, body.notes)
        )
    except LookupError:
        raise HTTPException(404, "Work not found") from None
    except ApprovalConflict as exc:
        raise HTTPException(409, str(exc)) from exc
