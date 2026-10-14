from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from fleet_maintenance.api.dependencies import Actor, current_actor
from fleet_maintenance.domain.contracts.cases import (
    FleetCapacityResponse,
    FleetCapacityUpdate,
    SearchHit,
    WorkspaceSummary,
)
from fleet_maintenance.domain.contracts.records import WorkspaceFixture
from fleet_maintenance.persistence.database import get_session
from fleet_maintenance.services.approvals import ApprovalConflict
from fleet_maintenance.services.workspace import import_fixture

router = APIRouter(prefix="/workspace", tags=["workspace"])


@router.post("/fixtures")
def fixtures(
    body: WorkspaceFixture,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, object]:
    if actor.role != "administrator":
        raise HTTPException(403, "Administrator role required")
    try:
        counts = import_fixture(session, body, actor.id)
        return {
            "source_version": body.source_version,
            "accepted_counts": counts,
            "rejected_counts": 0,
            "policy": "strict_atomic",
            "provenance": "synthetic",
        }
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except ApprovalConflict as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/search", response_model=list[SearchHit])
def search(
    q: str = "", session: Session = Depends(get_session), actor: Actor = Depends(current_actor)
) -> list[dict[str, str]]:
    from sqlalchemy import select

    from fleet_maintenance.persistence.models import (
        Aircraft,
        Component,
        FleetPartRequest,
        FleetWorkOrder,
        MaintenanceCase,
    )
    from fleet_maintenance.services import fleet_health as fleet
    from fleet_maintenance.services.cases import dataset_for

    results: list[dict[str, str]] = []

    def add(identifier: str, label: str, kind: str, dataset: str, path: str) -> None:
        if q.casefold() in f"{identifier} {label} {kind} {dataset}".casefold():
            results.append(
                {"id": identifier, "label": label, "type": kind, "dataset": dataset, "to": path}
            )

    from fleet_maintenance.services.registration import list_registered

    for record in list_registered(session, q=q, limit=25)["items"]:
        add(
            record["id"],
            f"{record['tail_number']} · {record['aircraft_type']} · {record['base']}",
            "Registered aircraft",
            "user_supplied",
            f"/aircraft/registered/{record['id']}",
        )
    try:
        bundle = fleet.active_bundle(session)
    except fleet.EngineNotReady:
        bundle = None
    dataset = f"operational:{fleet.run_id_of(bundle)}" if bundle else "operational:unavailable"
    for aircraft in bundle.aircraft if bundle else []:
        add(
            aircraft["id"],
            f"{aircraft['id']} · {aircraft.get('base', '')}",
            "Aircraft",
            dataset,
            f"/aircraft/{aircraft['id']}",
        )
    component_types = bundle.type_by_code if bundle else {}
    for component in bundle.slots if bundle else []:
        add(
            component["id"],
            f"{component['id']} · {component_types[component['type']]['name']}",
            "Component",
            dataset,
            f"/health/{component['id']}",
        )
    for case in session.scalars(
        select(MaintenanceCase).order_by(MaintenanceCase.created_at.desc())
    ):
        if case.dataset.startswith("operational:") or actor.role in {
            "engineer",
            "planner",
            "supervisor",
            "administrator",
        }:
            add(
                case.id,
                f"{case.aircraft_id} · {case.title}",
                "Case",
                case.dataset,
                f"/cases/{case.id}",
            )
    for work in session.scalars(select(FleetWorkOrder)):
        add(
            work.id,
            f"{work.aircraft} · {work.title}",
            "Work order",
            dataset,
            f"/maintenance/work/{work.id}",
        )
    for request in session.scalars(select(FleetPartRequest)):
        add(request.id, request.part, "Parts request", dataset, f"/spares/requests/{request.id}")
    for part in bundle.part_index if bundle else []:
        add(part, part, "Part", dataset, f"/spares?view=inventory&part={part}")
    if actor.role in {"engineer", "planner", "supervisor", "administrator"}:
        for engine_component in session.scalars(
            select(Component).join(Aircraft).where(Aircraft.provenance != "user_supplied")
        ):
            add(
                engine_component.id,
                engine_component.serial_number,
                "Engine component",
                dataset_for(engine_component),
                f"/components/{engine_component.id}",
            )
    return results[:30]


@router.get("/summary", response_model=WorkspaceSummary)
def summary(session: Session = Depends(get_session)) -> dict[str, object]:
    from sqlalchemy import select

    from fleet_maintenance.persistence.models import MaintenanceCase
    from fleet_maintenance.services import cases
    from fleet_maintenance.services import fleet_health as fleet

    bundle, _, findings = fleet.advisories(session, None)
    dataset = f"operational:{fleet.run_id_of(bundle)}"
    records = [
        cases.serialize(session, case)
        for case in session.scalars(
            select(MaintenanceCase).where(MaintenanceCase.dataset == dataset)
        )
    ]
    active = [
        item for item in records if item["state"] not in {"closed", "cancelled", "monitoring"}
    ]
    works = fleet.work_orders(session, None, None, None)
    awaiting = {
        case.source_key
        for case in session.scalars(
            select(MaintenanceCase).where(MaintenanceCase.dataset == dataset)
        )
        if next((r["state"] for r in records if r["id"] == case.id), None) == "awaiting_review"
    }
    priorities = {finding["id"]: finding["priority"]["score"] for finding in findings}
    sources = {
        case.id: case.source_key
        for case in session.scalars(
            select(MaintenanceCase).where(MaintenanceCase.dataset == dataset)
        )
    }
    active.sort(
        key=lambda item: (
            0 if item["state"] == "awaiting_review" else 1,
            -priorities.get(sources[item["id"]], 0),
            str(item["deadline"] or "9999"),
        )
    )
    return {
        "awaiting_review": len(awaiting),
        "work_needing_action": len(
            [w for w in works["planned"] if w["status"] not in {"completed", "cancelled"}]
        )
        + len([w for w in works["recorded"] if w["status"] == "open"]),
        "urgent_review": sum(
            1
            for finding in findings
            if finding["id"] in awaiting and finding["priority"]["level"] in {"P1", "P2"}
        ),
        "blocked_work": sum(1 for item in active if item["state"] == "blocked"),
        "actions": active[:8],
        "dataset": dataset,
        "as_of": bundle.as_of,
        "updated_at": max((item["created_at"] for item in records), default=None),
    }


@router.get("/capacity", response_model=list[FleetCapacityResponse])
def capacity(session: Session = Depends(get_session)) -> list[dict[str, object]]:
    from sqlalchemy import select

    from fleet_maintenance.persistence.models import FleetCapacity

    return [
        {key: getattr(item, key) for key in FleetCapacityResponse.model_fields}
        for item in session.scalars(select(FleetCapacity).order_by(FleetCapacity.id))
    ]


@router.post("/capacity/initialize", response_model=list[FleetCapacityResponse])
def initialize_capacity(
    session: Session = Depends(get_session), actor: Actor = Depends(current_actor)
) -> list[dict[str, object]]:
    if actor.role not in {"supervisor", "administrator"}:
        raise HTTPException(403, "Supervisor or administrator configures synthetic capacity")
    from fleet_maintenance.services.fleet_health import lock_fleet_commitments
    from fleet_maintenance.services.fleet_planning import configure_demo_capacity

    lock_fleet_commitments(session)
    configure_demo_capacity(session)
    session.commit()
    return capacity(session)


@router.patch("/capacity/{agency_id}", response_model=list[FleetCapacityResponse])
def change_capacity(
    agency_id: str,
    body: FleetCapacityUpdate,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> list[dict[str, object]]:
    if actor.role not in {"supervisor", "administrator"}:
        raise HTTPException(403, "Supervisor or administrator configures synthetic capacity")
    from sqlalchemy import select

    from fleet_maintenance.persistence.models import AuditEvent, FleetCapacity, FleetCapacityBooking
    from fleet_maintenance.services.fleet_health import active_bundle, lock_fleet_commitments

    if not body.reason.strip():
        raise HTTPException(422, "Capacity changes require a reason")
    lock_fleet_commitments(session)
    item = session.get(FleetCapacity, agency_id, with_for_update=True)
    if item is None:
        raise HTTPException(404, "Configure the catalogue assumptions first")
    if item.version != body.expected_version:
        raise HTTPException(409, "Capacity changed; reload its current version")
    eligible = {str(row["code"]) for row in active_bundle(session).types} | {"inspection"}
    if not set(body.capabilities) <= eligible:
        raise HTTPException(422, "Unknown component capability")
    bookings = list(
        session.scalars(
            select(FleetCapacityBooking).where(FleetCapacityBooking.agency_id == item.id)
        )
    )
    if (
        any(
            booking.unit >= (body.crew_capacity if booking.kind == "crew" else body.bay_capacity)
            for booking in bookings
        )
        or bookings
        and set(body.capabilities) != set(item.capabilities)
    ):
        raise HTTPException(
            409,
            "Existing commitments would be invalidated; cancel or complete that work first",
        )
    before = {
        key: getattr(item, key)
        for key in ("crew_capacity", "bay_capacity", "capabilities", "version")
    }
    item.crew_capacity, item.bay_capacity, item.capabilities = (
        body.crew_capacity,
        body.bay_capacity,
        sorted(set(body.capabilities)),
    )
    item.version += 1
    session.add(
        AuditEvent(
            actor=actor.id,
            action="fleet.capacity_configured",
            subject_id=agency_id,
            details={
                "before": before,
                "after": body.model_dump(),
                "reason": body.reason,
                "provenance": item.provenance,
            },
        )
    )
    session.commit()
    return capacity(session)
