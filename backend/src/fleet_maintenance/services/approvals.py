import uuid
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from fleet_maintenance.persistence.models import (
    AuditEvent,
    CaseLink,
    MaintenanceCase,
    Plan,
    Reservation,
    WorkRecord,
)
from fleet_maintenance.science.scheduling.constraints import validate_input, validate_result
from fleet_maintenance.science.scheduling.formulation import Assignment, PlanningResult
from fleet_maintenance.services.planning import planning_records, planning_snapshot, restore_source
from fleet_maintenance.services.resources import reserve_assignments, resource_records


class ApprovalConflict(Exception):
    pass


def approve_plan(session: Session, plan_id: str, actor: str) -> Plan:
    plan = session.scalar(select(Plan).where(Plan.id == plan_id).with_for_update())
    if plan is None:
        raise LookupError(plan_id)
    if plan.approved_at is not None:
        return plan
    if plan.status != "proposed":
        raise ApprovalConflict("Only a usable proposed plan can be approved.")
    scope_value = plan.input_snapshot.get("scope_component_id")
    scope = str(scope_value) if scope_value is not None else None
    try:
        tasks, parts = planning_records(session, scope, lock=True)
        resources = resource_records(session, scope, lock=True)
        snapshot = planning_snapshot(session, scope)
    except ValueError as exc:
        raise ApprovalConflict(str(exc)) from exc
    if snapshot["input_version"] != plan.input_version:
        raise ApprovalConflict("Plan inputs changed; generate a new proposal.")
    part_by_id = {p.id: p for p in parts}
    task_by_id = {t.id: t for t in tasks}
    assigned_ids = [str(a["task_id"]) for a in plan.assignments]
    if not assigned_ids:
        raise ApprovalConflict(
            "Plan contains no scheduled work; review open tasks and calculate a new proposal."
        )
    if len(set(assigned_ids)) != len(assigned_ids):
        raise ApprovalConflict("Plan must have unique task assignments.")
    if any(task_id not in task_by_id for task_id in assigned_ids):
        raise ApprovalConflict("Plan contains unavailable tasks.")
    current = restore_source(snapshot)
    if not current.resources:
        raise ApprovalConflict("Configure qualified crew and bay resources before approval.")
    source = replace(
        current,
        tasks=tuple(
            task for task in current.tasks if task.id in assigned_ids or task.id.startswith("hold:")
        ),
    )
    held_assignments = [
        Assignment(
            task.id,
            task.earliest,
            task.deadline,
            task.fixed_crew_id,
            task.fixed_bay_id,
            task.fixed_crew_unit,
            task.fixed_bay_unit,
        )
        for task in source.tasks
        if task.id.startswith("hold:")
    ]
    result = PlanningResult(
        "feasible",
        tuple(Assignment(**cast(dict[str, Any], assignment)) for assignment in plan.assignments)
        + tuple(held_assignments),
    )
    violations = validate_input(source) + validate_result(source, result)
    if violations:
        raise ApprovalConflict("Plan violates current hard constraints: " + "; ".join(violations))
    required: dict[str, int] = {}
    for assignment in plan.assignments:
        task = task_by_id.get(str(assignment["task_id"]))
        if task and task.required_part_id:
            required[task.required_part_id] = (
                required.get(task.required_part_id, 0) + task.required_part_quantity
            )
    for part_id, quantity in required.items():
        part = part_by_id[part_id]
        if part.on_hand < quantity:
            raise ApprovalConflict(
                f"Awaiting received stock for {part_id}; "
                "receive deliveries and regenerate the proposal."
            )
        part.on_hand -= quantity
        part.version += 1
        session.add(Reservation(plan_id=plan.id, part_id=part_id, quantity=quantity))
    try:
        reserve_assignments(session, plan.id, plan.assignments, resources)
    except IntegrityError as exc:
        session.rollback()
        raise ApprovalConflict("Crew or bay capacity was already reserved; replan.") from exc
    for task_id in assigned_ids:
        task = task_by_id[task_id]
        task.status = "approved"
        task.version += 1
        work = WorkRecord(
            id=f"work-{uuid.uuid5(uuid.NAMESPACE_URL, plan.id + ':' + task_id).hex}",
            plan_id=plan.id,
            task_id=task_id,
        )
        session.add(work)
        session.flush()
        # Extend the existing evidence case in the same approval transaction.
        from fleet_maintenance.services.cases import link

        for case in session.scalars(
            select(MaintenanceCase)
            .join(CaseLink)
            .where(CaseLink.kind == "task", CaseLink.record_id == task_id)
        ):
            link(session, case, "research_work", work.id, str(work.version))
            link(session, case, "research_plan", plan.id, plan.input_version)
    plan.status = "approved"
    plan.approved_at = datetime.now(UTC)
    plan.approved_by = actor
    session.add(
        AuditEvent(
            actor=actor,
            action="plan.approved",
            subject_id=plan.id,
            details={"input_version": plan.input_version},
        )
    )
    from fleet_maintenance.persistence.models import OutboxEvent

    session.add(
        OutboxEvent(
            topic="events",
            payload={
                "event_type": "plan.approved",
                "plan_id": plan.id,
                "input_version": plan.input_version,
                "scope_component_id": plan.input_snapshot.get("scope_component_id"),
                "actor": actor,
            },
        )
    )
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise ApprovalConflict("Approval already committed or conflicted.") from exc
    session.refresh(plan)
    return plan
