from datetime import date
from typing import Annotated, Any, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from fleet_maintenance.api.dependencies import (
    Actor,
    current_actor,
    require_engineer,
    require_supervisor,
)
from fleet_maintenance.domain.contracts.cases import (
    CasePage,
    CaseResponse,
    CaseWorkOutcome,
    ProposalApproval,
    ReviewRequest,
    VerificationRequest,
)
from fleet_maintenance.persistence.database import get_session
from fleet_maintenance.persistence.models import MaintenanceCase
from fleet_maintenance.services import cases, fleet_planning
from fleet_maintenance.services.approvals import ApprovalConflict
from fleet_maintenance.services.fleet_health import FleetConflict, verify_work_order

router = APIRouter(prefix="/cases", tags=["maintenance-cases"])


def read_only(as_of: date | None) -> None:
    if as_of:
        raise HTTPException(
            409, "History/replay is read-only; exit replay before recording a decision"
        )


def fail(error: Exception) -> NoReturn:
    if isinstance(error, LookupError):
        raise HTTPException(
            404, "The requested record is unavailable; return to its register"
        ) from error
    raise HTTPException(
        409 if isinstance(error, ApprovalConflict | FleetConflict) else 422, str(error)
    ) from error


@router.get("", response_model=CasePage)
def list_cases(
    dataset: str = "operational",
    aircraft: str | None = None,
    component: str | None = None,
    record: str | None = None,
    state: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    if dataset == "operational":
        from fleet_maintenance.services.fleet_health import active_bundle, run_id_of

        dataset = f"operational:{run_id_of(active_bundle(session))}"
    query = (
        select(MaintenanceCase)
        .where(MaintenanceCase.dataset.startswith(dataset))
        .order_by(MaintenanceCase.created_at.desc(), MaintenanceCase.id)
    )
    if aircraft:
        query = query.where(MaintenanceCase.aircraft_id == aircraft)
    if component:
        query = query.where(MaintenanceCase.component_id == component)
    if record:
        from fleet_maintenance.persistence.models import CaseLink

        query = query.where(
            MaintenanceCase.id.in_(select(CaseLink.case_id).where(CaseLink.record_id == record))
        )
    items = [cases.serialize(session, case) for case in session.scalars(query)]
    if state:
        items = [item for item in items if item["state"] == state]
    return {
        "items": items[offset : offset + limit],
        "total": len(items),
        "offset": offset,
        "limit": limit,
    }


@router.get("/{case_id}", response_model=CaseResponse)
def detail(case_id: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    try:
        case, _ = cases.records(session, case_id)
        return cases.serialize(session, case)
    except LookupError as error:
        fail(error)


@router.post("/{case_id}/review", response_model=CaseResponse)
def review(
    case_id: str,
    body: ReviewRequest,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    require_engineer(actor)
    read_only(body.as_of)
    try:
        return cases.review_case(
            session,
            case_id,
            body.decision,
            body.reason,
            body.follow_up,
            body.expected_version,
            actor.id,
        )
    except (LookupError, ValueError, ApprovalConflict, FleetConflict) as error:
        fail(error)


@router.post("/{case_id}/proposal", response_model=CaseResponse)
def prepare(
    case_id: str,
    as_of: date | None = None,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    if actor.role not in {"supervisor", "planner"}:
        raise HTTPException(403, "Maintenance supervisor or planner prepares proposals")
    read_only(as_of)
    try:
        return fleet_planning.prepare(session, case_id, actor.id)
    except (LookupError, ValueError, ApprovalConflict, FleetConflict) as error:
        fail(error)


@router.post("/proposals/{proposal_id}/approval", response_model=CaseResponse)
def approve(
    proposal_id: str,
    body: ProposalApproval,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    require_supervisor(actor)
    read_only(body.as_of)
    try:
        return fleet_planning.approve(session, proposal_id, body.input_version, actor.id)
    except (LookupError, ValueError, ApprovalConflict, FleetConflict) as error:
        fail(error)


@router.post("/work/{work_id}/verification")
def verify(
    work_id: str,
    body: VerificationRequest,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    require_supervisor(actor)
    read_only(body.as_of)
    try:
        return verify_work_order(session, work_id, body.expected_version, actor.id, body.notes)
    except (LookupError, ValueError, FleetConflict) as error:
        fail(error)


@router.post("/{case_id}/work/{work_id}/outcome")
def work_outcome(
    case_id: str,
    work_id: str,
    body: CaseWorkOutcome,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    require_supervisor(actor)
    read_only(body.as_of)
    try:
        case, links = cases.records(session, case_id)
        if not case.dataset.startswith("operational:") or not any(
            item.kind == "fleet_work" and item.record_id == work_id for item in links
        ):
            raise ValueError("Work does not belong to this operational case")
        from fleet_maintenance.services.fleet_health import update_work_order

        return update_work_order(
            session,
            work_id,
            {"start": "in_progress", "complete": "completed", "cancel": "cancelled"}[body.action],
            body.expected_version,
            actor.id,
            body.notes,
        )
    except (LookupError, ValueError, FleetConflict) as error:
        fail(error)
