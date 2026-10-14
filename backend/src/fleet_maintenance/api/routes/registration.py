from collections.abc import Callable
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from fleet_maintenance.api.dependencies import Actor, current_actor
from fleet_maintenance.domain.contracts.registration import (
    AircraftCreate,
    ComponentCreate,
    RecordsImport,
)
from fleet_maintenance.persistence.database import get_session
from fleet_maintenance.services import registration as service

router = APIRouter(prefix="/aircraft-registry", tags=["aircraft-registry"])


def writer(request: Request, actor: Actor = Depends(current_actor)) -> Actor:
    if actor.role not in {"administrator", "engineer", "planner", "supervisor"}:
        raise HTTPException(
            403, "Aircraft registration requires an engineer, planner or administrator"
        )
    if request.headers.get("X-Fleet-Replay-Date") or request.query_params.get("as_of"):
        raise HTTPException(409, "History/replay is read-only")
    return actor


def guarded[T](session: Session, call: Callable[[], T]) -> T:
    try:
        return call()
    except (service.RegistrationConflict, IntegrityError) as exc:
        session.rollback()
        raise HTTPException(409, "Duplicate identity or conflicting registration") from exc
    except LookupError as exc:
        session.rollback()
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        session.rollback()
        raise HTTPException(422, str(exc)) from exc


@router.get("")
def listing(
    as_of: date | None = None,
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return service.list_registered(session, as_of, q=q, limit=limit, offset=offset)


@router.post("", status_code=201)
def create(
    body: AircraftCreate, actor: Actor = Depends(writer), session: Session = Depends(get_session)
) -> dict[str, Any]:
    return guarded(session, lambda: service.create_aircraft(session, body, actor.id))


@router.get("/{identifier}")
def detail(
    identifier: str, as_of: date | None = None, session: Session = Depends(get_session)
) -> dict[str, Any]:
    return guarded(session, lambda: service.detail(session, identifier, as_of))


@router.post("/{identifier}/components", status_code=201)
def install(
    identifier: str,
    body: ComponentCreate,
    actor: Actor = Depends(writer),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return guarded(session, lambda: service.install_component(session, identifier, body, actor.id))


@router.post("/{identifier}/records")
def records(
    identifier: str,
    body: RecordsImport,
    actor: Actor = Depends(writer),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return guarded(session, lambda: service.import_records(session, identifier, body, actor.id))
