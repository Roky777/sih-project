from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from fleet_maintenance.persistence.database import get_session
from fleet_maintenance.services.access import (
    authenticate_session,
    effective_session_role,
    session_record,
)
from fleet_maintenance.settings import get_settings


@dataclass(frozen=True)
class Actor:
    id: str
    role: str


def current_actor(
    request: Request,
    session: Session = Depends(get_session),
    x_demo_user: str = Header(default="demo-planner"),
    x_demo_role: str = Header(default="planner"),
) -> Actor:
    # Operational replay is read-only, including compatibility routes.
    # Research/trial inputs have their own immutable cutoff and are independent.
    operational = "/fleet-health/" in request.url.path or "/workspace/capacity" in request.url.path
    if "/cases/" in request.url.path:
        from fleet_maintenance.persistence.models import MaintenanceCase

        identifier = request.url.path.split("/cases/", 1)[1].split("/", 1)[0]
        case = session.get(MaintenanceCase, identifier)
        operational = case is None or case.dataset.startswith("operational:")
    # Authentication/session management remains available so the user can sign out.
    if (
        operational
        and request.method not in {"GET", "HEAD", "OPTIONS"}
        and (request.headers.get("X-Fleet-Replay-Date") or request.query_params.get("as_of"))
        and "/access/" not in request.url.path
    ):
        raise HTTPException(409, "History/replay is read-only; exit replay before changing records")
    if get_settings().authentication_mode == "session":
        user = authenticate_session(session, request)
        return Actor(user.id, effective_session_role(user, session_record(session, request)))
    if x_demo_role not in {
        "viewer",
        "fleet_manager",
        "planner",
        "engineer",
        "logistics",
        "supervisor",
        "administrator",
    }:
        raise HTTPException(403, "Unknown demonstration role")
    return Actor(x_demo_user, x_demo_role)


def require_planner(actor: Actor) -> Actor:
    if actor.role not in {"planner", "supervisor"}:
        raise HTTPException(403, "Planner or supervisor role required")
    return actor


def require_engineer(actor: Actor) -> Actor:
    if actor.role not in {"engineer", "supervisor"}:
        raise HTTPException(403, "Engineer or supervisor role required")
    return actor


def require_supervisor(actor: Actor) -> Actor:
    if actor.role != "supervisor":
        raise HTTPException(403, "Supervisor role required")
    return actor
