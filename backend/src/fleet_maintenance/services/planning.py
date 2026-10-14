import hashlib
import json
import uuid
from dataclasses import asdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from fleet_maintenance.persistence.models import (
    Component,
    MaintenanceTask,
    Part,
    PartArrival,
    Plan,
    WorkRecord,
)
from fleet_maintenance.science.scheduling.formulation import (
    PartArrivalInput,
    PlanningInput,
    PlanningResult,
    ResourceInput,
    TaskInput,
)
from fleet_maintenance.science.scheduling.solver import solve
from fleet_maintenance.services.resources import resource_inputs, resource_records

SOLVER_CONFIGURATION = {
    "version": "grounding-cpsat-v3",
    "time_limit_seconds": 5.0,
    "objective": (
        "minimize union aircraft grounding slots, then makespan; "
        "score = grounding slots * (horizon + 1) + makespan; "
        "all constraints remain hard"
    ),
    "num_search_workers": 1,
    "random_seed": 26249,
}


def current_input_version(tasks: list[MaintenanceTask], parts: list[Part]) -> str:
    payload = {
        "tasks": [
            (
                t.id,
                t.version,
                t.status,
                t.duration_slots,
                t.earliest_slot,
                t.deadline_slot,
                t.required_skill,
                t.required_part_id,
                t.required_part_quantity,
                t.fixed_start,
                t.predecessors,
                t.component_id,
                t.grouping_key,
                t.mandatory,
            )
            for t in sorted(tasks, key=lambda x: x.id)
        ],
        "parts": [(p.id, p.version, p.on_hand) for p in sorted(parts, key=lambda x: x.id)],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:20]


def planning_records(
    session: Session, scope: str | None = None, *, lock: bool = False
) -> tuple[list[MaintenanceTask], list[Part]]:
    """Customer trials use dedicated parts/crew; ordinary fleet plans exclude them."""
    task_query = select(MaintenanceTask).where(MaintenanceTask.status == "open")
    part_query = select(Part)
    if scope is None:
        task_query = task_query.where(~MaintenanceTask.component_id.startswith("trial-"))
        part_query = part_query.where(~Part.id.startswith("trial-"))
    else:
        from fleet_maintenance.persistence.models import ImportRecord, Scenario

        trial = session.get(Scenario, scope.removesuffix("-engine"))
        if (
            not scope.startswith("trial-")
            or trial is None
            or trial.assumptions.get("component_id") != scope
        ):
            raise ValueError("Unknown customer trial scope")
        latest = session.scalar(
            select(ImportRecord)
            .where(ImportRecord.component_id == scope)
            .order_by(ImportRecord.created_at.desc(), ImportRecord.id.desc())
            .limit(1)
        )
        trial_data = trial.assumptions.get("trial", {})
        if (
            latest is None
            or not isinstance(trial_data, dict)
            or latest.id != trial_data.get("import_id")
        ):
            raise ValueError("Trial history changed; create a new trial with the current data")
        task_query = task_query.where(MaintenanceTask.component_id == scope)
        part_query = part_query.where(Part.id == trial.assumptions["part_id"])
    task_query = task_query.order_by(MaintenanceTask.id)
    part_query = part_query.order_by(Part.id)
    if lock:
        task_query, part_query = task_query.with_for_update(), part_query.with_for_update()
    return list(session.scalars(task_query)), list(session.scalars(part_query))


def planning_snapshot(session: Session, scope: str | None = None) -> dict[str, object]:
    tasks, parts = planning_records(session, scope)
    components = {c.id: c for c in session.scalars(select(Component)).all()}
    part_ids = [p.id for p in parts]
    configured_resources = resource_inputs(resource_records(session, scope))
    capacities: dict[str, int] = {}
    for resource in configured_resources:
        if resource.kind == "crew":
            for capability in resource.capabilities:
                capacities[capability] = capacities.get(capability, 0) + resource.capacity
    source = PlanningInput(
        horizon=14,
        tasks=tuple(
            TaskInput(
                t.id,
                t.duration_slots,
                t.earliest_slot,
                t.deadline_slot,
                t.required_skill,
                t.required_part_id,
                t.required_part_quantity,
                t.fixed_start,
                tuple(t.predecessors),
                component_id=t.component_id,
                group_id=t.grouping_key,
                component_kind=components[t.component_id].kind,
                aircraft_id=components[t.component_id].aircraft_id,
            )
            for t in tasks
        )
        + committed_tasks(session, scope),
        skill_capacity=capacities if configured_resources else {"engine": 1},
        part_stock={p.id: p.on_hand for p in parts},
        part_arrivals=tuple(
            PartArrivalInput(a.part_id, a.arrival_slot, a.quantity)
            for a in session.scalars(
                select(PartArrival)
                .where(PartArrival.status == "expected", PartArrival.part_id.in_(part_ids))
                .order_by(PartArrival.id)
            ).all()
        ),
        resources=configured_resources,
    )
    provenance = {
        "source": asdict(source),
        "solver_configuration": SOLVER_CONFIGURATION,
        "scope_component_id": scope,
        "record_version": current_input_version(tasks, parts),
    }
    digest = hashlib.sha256(json.dumps(provenance, sort_keys=True).encode()).hexdigest()
    return {
        "source": asdict(source),
        "solver_configuration": SOLVER_CONFIGURATION,
        "input_version": digest,
        "record_version": current_input_version(tasks, parts),
        "scope_component_id": scope,
    }


def committed_tasks(session: Session, scope: str | None = None) -> tuple[TaskInput, ...]:
    rows = session.execute(
        select(WorkRecord, MaintenanceTask, Plan)
        .join(MaintenanceTask, MaintenanceTask.id == WorkRecord.task_id)
        .join(Plan, Plan.id == WorkRecord.plan_id)
        .where(WorkRecord.status.in_(["approved", "in_progress"]))
        .where(
            MaintenanceTask.component_id == scope
            if scope
            else ~MaintenanceTask.component_id.startswith("trial-")
        )
    ).all()
    tasks = []
    for work, task, plan in rows:
        component = session.get(Component, task.component_id)
        assert component is not None
        assignment = next(a for a in plan.assignments if a["task_id"] == task.id)
        if not assignment.get("crew_id") or not assignment.get("bay_id"):
            raise ValueError(
                "Active legacy work has no crew/bay booking. Reconcile or finish that work "
                "before creating a resource-aware proposal."
            )
        start, end = int(str(assignment["start"])), int(str(assignment["end"]))
        tasks.append(
            TaskInput(
                f"hold:{work.id}",
                end - start,
                start,
                end,
                task.required_skill,
                component_id=task.component_id,
                aircraft_id=component.aircraft_id,
                component_kind=component.kind,
                fixed_start=start,
                fixed_crew_id=str(assignment["crew_id"]) if assignment.get("crew_id") else None,
                fixed_bay_id=str(assignment["bay_id"]) if assignment.get("bay_id") else None,
                fixed_crew_unit=int(str(assignment.get("crew_unit", 0))),
                fixed_bay_unit=int(str(assignment.get("bay_unit", 0))),
            )
        )
    return tuple(tasks)


def restore_source(snapshot: dict[str, object]) -> PlanningInput:
    from typing import Any, cast

    values = cast(dict[str, Any], snapshot["source"])
    return PlanningInput(
        horizon=values["horizon"],
        tasks=tuple(TaskInput(**row) for row in values["tasks"]),
        skill_capacity=values["skill_capacity"],
        part_stock=values["part_stock"],
        part_arrivals=tuple(PartArrivalInput(**row) for row in values.get("part_arrivals", [])),
        resources=tuple(ResourceInput(**row) for row in values.get("resources", [])),
        slot_duration_hours=values.get("slot_duration_hours", 8),
        time_zone=values.get("time_zone", "Asia/Kolkata"),
        epoch_utc=values.get("epoch_utc"),
    )


def propose_plan(
    session: Session,
    plan_id: str | None = None,
    *,
    commit: bool = True,
    snapshot: dict[str, object] | None = None,
    computed_result: PlanningResult | None = None,
) -> Plan:
    if plan_id is not None:
        existing = session.get(Plan, plan_id)
        if existing is not None:
            return existing
    snapshot = snapshot or planning_snapshot(session)
    source = restore_source(snapshot)
    result = computed_result if computed_result is not None else solve(source)
    plan = Plan(
        id=plan_id or f"plan-{uuid.uuid4().hex[:10]}",
        status="proposed" if result.status in {"optimal", "feasible"} else result.status,
        solver_status=result.status,
        input_version=str(snapshot["input_version"]),
        input_snapshot={
            **asdict(source),
            "solver_configuration": snapshot.get("solver_configuration", SOLVER_CONFIGURATION),
            "scope_component_id": snapshot.get("scope_component_id"),
            **({"advisory": snapshot["advisory"]} if "advisory" in snapshot else {}),
        },
        objective=result.objective,
        best_bound=result.best_bound,
        assignments=[asdict(a) for a in result.assignments if not a.task_id.startswith("hold:")],
        diagnostics=list(result.diagnostics)
        + (
            [
                "Expected deliveries are assumptions; approval requires "
                "received stock and a current proposal."
            ]
            if source.part_arrivals
            else []
        ),
    )
    session.add(plan)
    if commit:
        session.commit()
        session.refresh(plan)
    else:
        session.flush()
    return plan
