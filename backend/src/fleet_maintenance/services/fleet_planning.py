"""Operational case planning uses the existing solver on isolated synthetic resources."""

import hashlib
import json
import math
import uuid
from dataclasses import asdict
from datetime import timedelta
from typing import Any, cast

from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from fleet_maintenance.domain.contracts.planning import (
    PartArrivalInput,
    PlanningInput,
    ResourceInput,
    TaskInput,
)
from fleet_maintenance.persistence.models import (
    AuditEvent,
    CaseReview,
    FleetAdvisoryDecision,
    FleetAssessment,
    FleetCapacity,
    FleetCapacityBooking,
    FleetPartRequest,
    FleetProposal,
    FleetWorkOrder,
    MaintenanceCase,
)
from fleet_maintenance.science.fleet import decisions
from fleet_maintenance.science.scheduling.constraints import validate_input, validate_result
from fleet_maintenance.science.scheduling.solver import solve
from fleet_maintenance.services import fleet_health as fleet
from fleet_maintenance.services.approvals import ApprovalConflict
from fleet_maintenance.services.cases import link, records


def configure_demo_capacity(session: Session) -> None:
    """Register only explicit catalogue assumptions, never historical crew/bay bookings."""
    bundle = fleet.active_bundle(session)
    for identifier, agency in bundle.agencies.items():
        if session.get(FleetCapacity, identifier) is None:
            session.add(
                FleetCapacity(
                    id=identifier,
                    capabilities=[
                        str(item["code"]) for item in bundle.types if item["agency"] == identifier
                    ]
                    + (["inspection"] if identifier == "AG-LINE" else []),
                    bay_capacity=int(agency["bays"]),
                    crew_capacity=max(1, int(float(agency["capacity_hours_per_day"]) // 16)),
                    provenance=("Synthetic catalogue capacity and eligibility; not qualification"),
                )
            )
    session.flush()


def fingerprint(session: Session, case: MaintenanceCase) -> str:
    bundle = fleet.active_bundle(session)
    from fleet_maintenance.services.planning import SOLVER_CONFIGURATION

    payload = {
        "solver_configuration": SOLVER_CONFIGURATION,
        "run": fleet.run_id_of(bundle),
        "case": (case.id, case.version),
        "work": [
            (w.id, w.version, w.status, str(w.planned_start), w.agency_id)
            for w in session.scalars(select(FleetWorkOrder).order_by(FleetWorkOrder.id))
        ],
        "requests": [
            (r.id, r.version, r.status, r.received_quantity, str(r.eta))
            for r in session.scalars(select(FleetPartRequest).order_by(FleetPartRequest.id))
        ],
        "capacity": [
            (r.id, r.version, r.capabilities, r.crew_capacity, r.bay_capacity)
            for r in session.scalars(select(FleetCapacity).order_by(FleetCapacity.id))
        ],
        "closures": sorted(fleet.overlay(session).closed_recorded),
        "assessments": [
            (a.id, a.model_hash, a.input_ids, str(a.cutoff), a.state)
            for a in session.scalars(
                select(FleetAssessment)
                .where(FleetAssessment.run_id == fleet.run_id_of(bundle))
                .order_by(FleetAssessment.id)
            )
        ],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def source_for(session: Session, case: MaintenanceCase) -> PlanningInput:
    bundle = fleet.active_bundle(session)
    if case.dataset != f"operational:{fleet.run_id_of(bundle)}":
        raise ApprovalConflict("Case input bundle is historical; use current evidence")
    _, links = records(session, case.id)
    orders = [
        work
        for item in links
        if item.kind == "fleet_work"
        if (work := session.get(FleetWorkOrder, item.record_id)) is not None
        and work.status == "planned"
    ]
    if not orders:
        raise ApprovalConflict(
            "Prepare a task from a confirmed finding before calculating a proposal"
        )
    horizon = 61
    current = fleet.overlay(session)
    position = decisions.spare_position(bundle, bundle.replay_offset(None), current)
    tasks: list[TaskInput] = []
    for work in orders:
        component_type = (
            bundle.type_by_code[bundle.slots[bundle.slot_index[work.component_id]]["type"]]
            if work.component_id
            else {"code": "inspection"}
        )
        if work.component_id is None and not work.impact.get("mandatory_task_id"):
            raise ApprovalConflict("Work has no verified component identity or mandatory task")
        deadline = (
            min(horizon, (case.deadline - bundle.as_of).days + 1) if case.deadline else horizon
        )
        duration = max(1, math.ceil(work.duration_days))
        tasks.append(
            TaskInput(
                work.id,
                duration,
                max(0, (work.planned_start - bundle.as_of).days),
                deadline,
                component_type["code"],
                part_id=work.part,
                part_quantity=1 if work.part else 0,
                component_id=work.component_id,
                component_kind=component_type["code"],
                aircraft_id=work.aircraft,
            )
        )
    resources: list[ResourceInput] = []
    bookings = list(session.scalars(select(FleetCapacityBooking)))
    recorded = decisions.open_recorded(bundle, bundle.days - 1, current)
    for config in session.scalars(select(FleetCapacity).order_by(FleetCapacity.id)):
        # Existing open agency work with no resource identities conservatively withholds
        # aggregate capacity. Never fabricate bookings for those historical jobs.
        legacy = sum(1 for w in recorded if w["agency"] == config.id)
        for kind, capacity in [("crew", config.crew_capacity), ("bay", config.bay_capacity)]:
            for unit in range(legacy, capacity):
                free = [
                    day
                    for day in range(horizon)
                    if not any(
                        b.agency_id == config.id
                        and b.kind == kind
                        and b.unit == unit
                        and b.day == bundle.as_of + timedelta(days=day)
                        for b in bookings
                    )
                ]
                windows: list[tuple[int, int]] = []
                for day in free:
                    if windows and windows[-1][1] == day:
                        windows[-1] = (windows[-1][0], day + 1)
                    else:
                        windows.append((day, day + 1))
                if windows:
                    resources.append(
                        ResourceInput(
                            f"{config.id}:{kind}:{unit}",
                            kind,
                            tuple(config.capabilities),
                            tuple(windows),
                            valid_until=horizon,
                        )
                    )
    arrivals = tuple(
        PartArrivalInput(
            r.part, max(0, (r.eta - bundle.as_of).days), r.quantity - r.received_quantity
        )
        for r in session.scalars(select(FleetPartRequest))
        if r.status == "ordered" and r.eta and r.eta <= bundle.as_of + timedelta(days=horizon - 1)
    )
    for request in session.scalars(select(FleetPartRequest)):
        if request.work_order_id in {w.id for w in orders} and request.status == "reserved":
            position[request.part]["available"] += request.quantity
    return PlanningInput(
        horizon,
        tuple(tasks),
        {
            task.skill: sum(
                r.capacity for r in resources if r.kind == "crew" and task.skill in r.capabilities
            )
            for task in tasks
        },
        {p: int(v["available"]) for p, v in position.items()},
        arrivals,
        tuple(resources),
        slot_duration_hours=24,
        epoch_utc=f"{bundle.as_of}T00:00:00Z",
    )


def prepare(session: Session, identifier: str, actor: str) -> dict[str, Any]:
    case, links = records(session, identifier)
    review = session.scalar(
        select(FleetAdvisoryDecision)
        .where(FleetAdvisoryDecision.advisory_id == case.source_key)
        .order_by(FleetAdvisoryDecision.id.desc())
        .limit(1)
    )
    if not case.dataset.startswith("operational:"):
        raise ValueError("Research cases use the existing research planner")
    mandatory_links = [item for item in links if item.kind == "mandatory_task"]
    current_review = session.scalar(
        select(CaseReview)
        .where(CaseReview.case_id == case.id)
        .order_by(CaseReview.id.desc())
        .limit(1)
    )
    if current_review:
        reviewed = {(ref.get("kind"), ref.get("id")) for ref in current_review.evidence_refs}
        if any(
            item.kind in {"assessment", "fleet_assessment"}
            and (item.kind, item.record_id) not in reviewed
            for item in links
        ):
            raise ApprovalConflict("New evidence requires engineering review before planning")

    if (
        not mandatory_links
        and (review is None or review.status != "accepted")
        and not any(item.kind == "fleet_work" for item in links)
    ):
        raise ApprovalConflict("An engineer must confirm maintenance is required before planning")
    existing = [
        item
        for item in links
        if item.kind == "fleet_work"
        and (work := session.get(FleetWorkOrder, item.record_id))
        and work.status not in {"cancelled", "completed"}
    ]
    if not existing and mandatory_links:
        bundle = fleet.active_bundle(session)
        task = mandatory_links[0].evidence
        component_type = (
            bundle.type_by_code[bundle.slots[bundle.slot_index[case.component_id]]["type"]]
            if case.component_id
            else None
        )
        work = FleetWorkOrder(
            id=f"PWO-{uuid.uuid4().hex[:8].upper()}",
            aircraft=case.aircraft_id,
            component_id=case.component_id,
            agency_id=component_type["agency"] if component_type else "AG-LINE",
            part=component_type["part_number"] if component_type else None,
            title=f"Mandatory: {case.title}",
            planned_start=bundle.as_of,
            duration_days=float(component_type["repair_days"])
            if component_type
            else float(bundle.records["meta"]["config"]["inspection_days"]),
            status="planned",
            priority="P1" if task.get("overdue") else "P2",
            impact={
                "mandatory_task_id": mandatory_links[0].record_id,
                "mandatory": True,
                "due_date": task.get("due_date"),
            },
            notes="Mandatory deadline retained; overdue work requires a justified recovery window",
            created_by=actor,
        )
        session.add(work)
        session.flush()
        link(session, case, "fleet_work", work.id, str(work.version))
        if work.part:
            request = FleetPartRequest(
                id=f"PRQ-{uuid.uuid4().hex[:8].upper()}",
                work_order_id=work.id,
                part=work.part,
                quantity=1,
                needed_by=bundle.as_of,
                status="open",
                updated_by=actor,
            )
            session.add(request)
            session.flush()
            link(session, case, "fleet_request", request.id, str(request.version))
    elif not existing:
        if case.component_id is None:
            raise ApprovalConflict("No verified component mapping")
        created_work = fleet.create_work_order(
            session,
            actor,
            case.component_id,
            None,
            fleet.active_bundle(session).as_of,
            case.source_key,
            "Case-linked tentative proposal",
        )
        link(session, case, "fleet_work", str(created_work["id"]), str(created_work["version"]))
        for request in session.scalars(
            select(FleetPartRequest).where(FleetPartRequest.work_order_id == created_work["id"])
        ):
            link(session, case, "fleet_request", request.id, str(request.version))
    configure_demo_capacity(session)
    source = source_for(session, case)
    version = fingerprint(session, case)
    session.commit()
    # The solver has no transactional side effects; proposals do not reserve stock.
    result = solve(source)
    if fingerprint(session, case) != version:
        raise ApprovalConflict("Inputs changed while solving; recalculate")
    violations = (
        validate_input(source) + validate_result(source, result)
        if result.status in {"optimal", "feasible"}
        else []
    )
    proposal = FleetProposal(
        id=f"FPLAN-{uuid.uuid4().hex[:20]}",
        case_id=case.id,
        input_version=version,
        input_snapshot=asdict(source),
        assignments=[asdict(a) for a in result.assignments] if not violations else [],
        diagnostics=[*result.diagnostics, *violations],
        solver_status=result.status,
        status="proposed" if result.assignments and not violations else "blocked",
        objective=result.objective,
        best_bound=result.best_bound,
        actor=actor,
    )
    session.add(proposal)
    link(session, case, "fleet_proposal", proposal.id, version)
    session.add(
        AuditEvent(
            actor=actor,
            action="fleet.proposal_prepared",
            subject_id=case.id,
            details={
                "proposal": proposal.id,
                "inputs": version,
                "objective": (
                    "Minimize latest completion in days; surrogate, not maximum availability"
                ),
            },
        )
    )
    session.commit()
    from fleet_maintenance.services.cases import serialize

    return serialize(session, case)


def approve(session: Session, proposal_id: str, expected_input: str, actor: str) -> dict[str, Any]:
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(hashtext('fleet-case-approval'))"))
    proposal = session.get(FleetProposal, proposal_id, with_for_update=True)
    if proposal is None:
        raise LookupError(proposal_id)
    case = session.get(MaintenanceCase, proposal.case_id, with_for_update=True)
    assert case is not None
    if proposal.status == "approved":
        from fleet_maintenance.services.cases import serialize

        return serialize(session, case)
    if proposal.status != "proposed" or not proposal.assignments:
        raise ApprovalConflict("Only a usable nonempty proposal can be approved")
    if (
        expected_input != proposal.input_version
        or fingerprint(session, case) != proposal.input_version
    ):
        raise ApprovalConflict(
            "Proposal inputs changed; recalculate and review the exact new proposal"
        )
    source = source_for(session, case)
    from fleet_maintenance.domain.contracts.planning import Assignment, PlanningResult

    result = PlanningResult(
        proposal.solver_status,
        tuple(Assignment(**cast(dict[str, Any], a)) for a in proposal.assignments),
    )
    errors = validate_input(source) + validate_result(source, result)
    if errors:
        raise ApprovalConflict("Proposal violates current constraints: " + "; ".join(errors))
    bundle = fleet.active_bundle(session)
    for assignment in proposal.assignments:
        work = session.get(FleetWorkOrder, str(assignment["task_id"]), with_for_update=True)
        assert work is not None
        request = session.scalar(
            select(FleetPartRequest)
            .where(FleetPartRequest.work_order_id == work.id)
            .with_for_update()
        )
        if request is not None:
            position = decisions.spare_position(
                bundle, bundle.replay_offset(None), fleet.overlay(session)
            )[request.part]
            if (
                int(position["available"])
                + (request.quantity if request.status == "reserved" else 0)
                < request.quantity
            ):
                raise ApprovalConflict(
                    f"Receive required {request.part}; expected delivery is not usable stock"
                )
            request.needed_by = bundle.as_of + timedelta(days=int(str(assignment["start"])))
            request.status = "reserved"
            request.version += 1
        for kind in ("crew", "bay"):
            identifier = str(assignment[f"{kind}_id"])
            agency, _, unit = identifier.split(":")
            for day in range(int(str(assignment["start"])), int(str(assignment["end"]))):
                session.add(
                    FleetCapacityBooking(
                        work_id=work.id,
                        agency_id=agency,
                        kind=kind,
                        unit=int(unit),
                        day=bundle.as_of + timedelta(days=day),
                    )
                )
            work.agency_id = agency
        work.planned_start = bundle.as_of + timedelta(days=int(str(assignment["start"])))
        work.status = "approved"
        work.version += 1
        if work.advisory_id and work.component_id:
            session.add(
                FleetAdvisoryDecision(
                    advisory_id=work.advisory_id,
                    component_id=work.component_id,
                    status="scheduled",
                    work_order_id=work.id,
                    actor=actor,
                    snapshot={"proposal_id": proposal.id, "input_version": proposal.input_version},
                )
            )
    proposal.status = "approved"
    session.add(
        AuditEvent(
            actor=actor,
            action="fleet.proposal_approved",
            subject_id=case.id,
            details={"proposal_id": proposal.id, "input_version": proposal.input_version},
        )
    )
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise ApprovalConflict("Stock or resource commitments conflicted; replan") from exc
    from fleet_maintenance.services.cases import serialize

    return serialize(session, case)


def release(session: Session, work: FleetWorkOrder) -> None:
    bookings = list(
        session.scalars(select(FleetCapacityBooking).where(FleetCapacityBooking.work_id == work.id))
    )
    if bookings:
        session.add(
            AuditEvent(
                actor=work.created_by,
                action="fleet.resources_released",
                subject_id=work.id,
                details={
                    "commitments": [
                        {"agency": b.agency_id, "kind": b.kind, "unit": b.unit, "day": str(b.day)}
                        for b in bookings
                    ]
                },
            )
        )
    session.execute(delete(FleetCapacityBooking).where(FleetCapacityBooking.work_id == work.id))
