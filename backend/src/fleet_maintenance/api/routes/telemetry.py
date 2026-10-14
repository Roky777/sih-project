"""Authenticated local demonstration transport; no unauthenticated device endpoint."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from fleet_maintenance.api.dependencies import Actor, current_actor, require_engineer
from fleet_maintenance.api.routes.demo import local_demo
from fleet_maintenance.domain.contracts.telemetry import ReplayTick, StreamControl, TelemetryBatch
from fleet_maintenance.persistence.database import get_session
from fleet_maintenance.persistence.models import AuditEvent, TelemetryStream
from fleet_maintenance.services import telemetry as service
from fleet_maintenance.services.approvals import ApprovalConflict

router = APIRouter(prefix="/telemetry", tags=["telemetry"], dependencies=[Depends(local_demo)])


def writer(request: Request, actor: Actor = Depends(current_actor)) -> Actor:
    require_engineer(actor)
    if request.headers.get("X-Fleet-Replay-Date") or request.query_params.get("as_of"):
        raise HTTPException(409, "Historical replay is read only")
    return actor


@router.get("")
def listing(session: Session = Depends(get_session)) -> list[dict[str, Any]]:
    return [
        service.detail(session, row)
        for row in session.scalars(
            select(TelemetryStream).order_by(TelemetryStream.created_at.desc()).limit(20)
        )
    ]


@router.post("", status_code=201)
def create(
    actor: Actor = Depends(writer), session: Session = Depends(get_session)
) -> dict[str, Any]:
    try:
        return service.create(session, actor.id)
    except ValueError as exc:
        session.rollback()
        raise HTTPException(422, str(exc)) from exc


@router.get("/{identifier}")
def detail(identifier: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    try:
        return service.detail(session, service.get_stream(session, identifier))
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


def command(session: Session, identifier: str, actor: Actor, body: Any) -> dict[str, Any]:
    try:
        row = service.get_stream(session, identifier, lock=True)
        if isinstance(body, ReplayTick):
            return service.replay(session, row, body.count, body.demonstrate_rejection, actor.id)
        if isinstance(body, TelemetryBatch):
            return service.receive(session, row, body.frames, actor.id)
        if row.status == "completed":
            raise ValueError("Completed replays are immutable; create another stream")
        prior = row.status
        row.status = body.status
        session.add(
            AuditEvent(
                actor=actor.id,
                action="telemetry.control",
                subject_id=row.id,
                details={"from": prior, "to": row.status},
            )
        )
        session.commit()
        return service.detail(session, row)
    except LookupError as exc:
        session.rollback()
        raise HTTPException(404, str(exc)) from exc
    except ApprovalConflict as exc:
        session.rollback()
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        session.rollback()
        raise HTTPException(422, str(exc)) from exc


@router.post("/{identifier}/frames")
def receive(
    identifier: str,
    body: TelemetryBatch,
    actor: Actor = Depends(writer),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return command(session, identifier, actor, body)


@router.post("/{identifier}/replay")
def replay(
    identifier: str,
    body: ReplayTick,
    actor: Actor = Depends(writer),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return command(session, identifier, actor, body)


@router.post("/{identifier}/control")
def control(
    identifier: str,
    body: StreamControl,
    actor: Actor = Depends(writer),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return command(session, identifier, actor, body)
