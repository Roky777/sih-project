"""Application services for the synthetic fleet-health workspace (docs/plan.md modules 1-9).

The engine bundle (histories, predictions, evaluation) is produced by a durable worker job and
verified by hash before use. Human decisions are stored in PostgreSQL and overlaid at read time.
"""

from __future__ import annotations

import math
import threading
import uuid
from collections import OrderedDict
from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from fleet_maintenance.artifacts.storage import artifact_directory
from fleet_maintenance.persistence.models import (
    AuditEvent,
    FleetAdvisoryDecision,
    FleetAlertAcknowledgement,
    FleetEngineRun,
    FleetIngestBatch,
    FleetIngestedReading,
    FleetPartRequest,
    FleetRecordedClosure,
    FleetScenarioRun,
    FleetWorkOrder,
    Job,
)
from fleet_maintenance.science.fleet import cannibalize, decisions
from fleet_maintenance.science.fleet.availability import (
    CAUSES,
    Intervention,
    OpenWork,
    Snapshot,
    simulate_fleet,
)
from fleet_maintenance.science.fleet.bundle import FleetBundle
from fleet_maintenance.services.jobs import submit_job
from fleet_maintenance.settings import get_settings

ENGINE_JOB_KIND = "fleet_engine"
ADVISORY_TRANSITIONS = {
    "proposed": {"accepted", "dismissed"},
    "accepted": {"scheduled", "dismissed", "proposed"},
    "scheduled": {"completed", "dismissed"},
    "dismissed": {"proposed"},
    "completed": set(),
}
WORK_ORDER_TRANSITIONS = {
    "planned": {"cancelled"},
    "approved": {"in_progress", "cancelled"},
    "in_progress": {"completed"},
    "awaiting_verification": set(),
    "completed": set(),
    "cancelled": set(),
}
SCENARIO_KINDS = (
    "schedule_maintenance",
    "spare_unavailable",
    "early_replacement",
    "extra_capacity",
)


class EngineNotReady(Exception):
    pass


class FleetConflict(Exception):
    pass


# Engine runs and bundle cache ---------------------------------------------------------------
_bundles: OrderedDict[str, FleetBundle] = OrderedDict()
_forecasts: dict[tuple[str, int], dict[str, Any]] = {}
_lock = threading.Lock()


def request_engine_run(session: Session, actor: str, seed: int = 42) -> FleetEngineRun:
    run_id = f"fe-{uuid.uuid4().hex[:16]}"
    run = FleetEngineRun(id=run_id, state="queued", seed=seed, requested_by=actor)
    session.add(run)
    session.flush()
    job = submit_job(session, ENGINE_JOB_KIND, {"engine_run_id": run_id, "seed": seed}, owner=actor)
    run.job_id = job.id
    session.add(
        AuditEvent(
            actor=actor,
            action="fleet.engine_requested",
            subject_id=run_id,
            details={"job_id": job.id, "seed": seed},
        )
    )
    session.commit()
    return run


def ensure_engine_run(session: Session) -> None:
    """Queue the first engine run on a fresh installation (demo seeding)."""
    exists = session.scalar(
        select(FleetEngineRun.id).where(FleetEngineRun.state.in_(["queued", "succeeded"])).limit(1)
    )
    if exists is None:
        request_engine_run(session, "system", 42)


def complete_engine_run(session: Session, run_id: str, result: dict[str, Any]) -> None:
    run = session.get(FleetEngineRun, run_id, with_for_update=True)
    if run is None:
        raise LookupError(run_id)
    run.state = "succeeded"
    run.as_of = date.fromisoformat(str(result["as_of"]))
    run.artifact_directory = f"fleet-engine/{run_id}"
    run.hashes = dict(result["hashes"])
    run.summary = dict(result["summary"])
    run.completed_at = datetime.now(UTC)
    session.add(
        AuditEvent(
            actor="worker",
            action="fleet.engine_completed",
            subject_id=run_id,
            details={"hashes": run.hashes},
        )
    )
    session.flush()
    from fleet_maintenance.services.cases import fleet_cases

    fleet_cases(session)


def engine_status(session: Session) -> dict[str, Any]:
    runs = session.scalars(
        select(FleetEngineRun).order_by(FleetEngineRun.created_at.desc()).limit(10)
    ).all()
    items = []
    for run in runs:
        job = session.get(Job, run.job_id) if run.job_id else None
        state = run.state
        if state == "queued" and job is not None and job.state in ("failed", "cancelled"):
            state = "failed"
        elif state == "queued" and job is not None and job.state == "running":
            state = "running"
        items.append(
            {
                "id": run.id,
                "state": state,
                "seed": run.seed,
                "as_of": run.as_of.isoformat() if run.as_of else None,
                "job_id": run.job_id,
                "summary": run.summary,
                "requested_by": run.requested_by,
                "created_at": run.created_at.isoformat(),
                "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            }
        )
    active = next((item for item in items if item["state"] == "succeeded"), None)
    pending = next((item for item in items if item["state"] in ("queued", "running")), None)
    return {
        "ready": active is not None,
        "active_run": active,
        "pending_run": pending,
        "runs": items,
        "data": "synthetic",
    }


def active_bundle(session: Session) -> FleetBundle:
    run = session.scalar(
        select(FleetEngineRun)
        .where(FleetEngineRun.state == "succeeded")
        .order_by(FleetEngineRun.completed_at.desc())
        .limit(1)
    )
    if run is None or run.artifact_directory is None:
        raise EngineNotReady("The fleet engine has not produced a verified bundle yet.")
    with _lock:
        cached = _bundles.get(run.id)
        if cached is not None:
            return cached
        directory = artifact_directory(get_settings().artifact_root, run.artifact_directory)
        bundle = FleetBundle.load(directory)
        if bundle.manifest["hashes"] != run.hashes:
            raise EngineNotReady("Bundle manifest does not match its registration.")
        _bundles[run.id] = bundle
        while len(_bundles) > 2:
            _bundles.popitem(last=False)
        return bundle


def run_id_of(bundle: FleetBundle) -> str:
    return str(bundle.manifest["run_id"])


def offset_for(bundle: FleetBundle, as_of: date | None) -> int:
    return bundle.replay_offset(as_of)


# Overlay of human decisions -----------------------------------------------------------------
def overlay(session: Session) -> decisions.Overlay:
    latest = (
        select(FleetAdvisoryDecision.advisory_id, func.max(FleetAdvisoryDecision.id).label("id"))
        .group_by(FleetAdvisoryDecision.advisory_id)
        .subquery()
    )
    rows = session.scalars(
        select(FleetAdvisoryDecision).join(latest, FleetAdvisoryDecision.id == latest.c.id)
    ).all()
    status = {
        row.advisory_id: {
            "status": row.status,
            "reason": row.reason,
            "actor": row.actor,
            "updated_at": row.created_at.isoformat(),
            "work_order_id": row.work_order_id,
        }
        for row in rows
    }
    work = [
        work_order_dict(row)
        for row in session.scalars(
            select(FleetWorkOrder).where(FleetWorkOrder.status != "cancelled")
        ).all()
    ]
    requests = tuple(
        {
            "part": row.part,
            "quantity": row.quantity,
            "status": row.status,
            "eta": row.eta,
            "work_order_id": row.work_order_id,
            "received_quantity": row.received_quantity,
        }
        for row in session.scalars(select(FleetPartRequest)).all()
    )
    closures = session.scalars(select(FleetRecordedClosure)).all()
    closed = frozenset(row.work_order_id for row in closures)
    replaced = {w["component_id"] for w in work if w["status"] == "completed" and w["component_id"]}
    if closed:
        try:
            bundle = active_bundle(session)
            for wo in bundle.records["work_orders"]:
                if wo["id"] in closed and wo["slot"] is not None:
                    replaced.add(bundle.slots[wo["slot"]]["id"])
        except EngineNotReady:
            pass
    from fleet_maintenance.persistence.models import FleetAssessment

    assessments: dict[str, dict[str, Any]] = {}
    try:
        bundle = active_bundle(session)
        for assessment in session.scalars(
            select(FleetAssessment)
            .where(
                FleetAssessment.run_id == run_id_of(bundle), FleetAssessment.cutoff == bundle.as_of
            )
            .order_by(FleetAssessment.created_at.desc(), FleetAssessment.id)
        ):
            assessments.setdefault(
                assessment.component_id,
                {
                    **assessment.result,
                    "assessment_id": assessment.id,
                    "cutoff": str(assessment.cutoff),
                    "model_hash": assessment.model_hash,
                    "input_ids": assessment.input_ids,
                },
            )
    except EngineNotReady:
        pass
    return decisions.Overlay(status, work, requests, closed, frozenset(replaced), assessments)


def snapshot(bundle: FleetBundle, current: decisions.Overlay) -> Snapshot:
    """Simulation inputs with logistics decisions applied: received parts are on hand and
    ordered parts arrive on their ETA."""
    base = bundle.snapshot(closed=current.closed_recorded)
    stock = base.stock.copy()
    for part, quantity in current.received().items():
        stock[bundle.part_index[part]] += quantity
    for part, quantity in current.consumed().items():
        index = bundle.part_index[part]
        stock[index] = max(0, int(stock[index]) - quantity)
    rul, risk30 = base.rul.copy(), base.risk30.copy()
    for component, assessment in current.assessments.items():
        if assessment.get("state") == "available":
            rul[bundle.slot_index[component]] = [
                assessment["rul"][k] for k in ("p10", "p50", "p90")
            ]
            risk30[bundle.slot_index[component]] = assessment["risk30"]
    for component in current.replaced_components:
        rul[bundle.slot_index[component]] = decisions.NEW_PART["rul"]
        risk30[bundle.slot_index[component]] = 0.0
    agencies = list(bundle.agencies)
    started = tuple(
        OpenWork(
            bundle.aircraft_index[w["aircraft"]],
            max(1, math.ceil(float(w["duration_days"]))),
            "scheduled",
            agencies.index(w["agency_id"]),
            True,
        )
        for w in current.in_work()
    )
    receipts = base.receipts + tuple(
        (
            bundle.part_index[r["part"]],
            int(r["quantity"]) - int(r.get("received_quantity", 0)),
            (r["eta"] - bundle.as_of).days,
        )
        for r in current.ordered()
        if r["eta"] > bundle.as_of
    )
    return replace(
        base,
        stock=stock,
        receipts=receipts,
        rul=rul,
        risk30=risk30,
        open_work=base.open_work + started,
    )


def work_order_dict(row: FleetWorkOrder) -> dict[str, Any]:
    return {
        "id": row.id,
        "advisory_id": row.advisory_id,
        "aircraft": row.aircraft,
        "component_id": row.component_id,
        "agency_id": row.agency_id,
        "part": row.part,
        "title": row.title,
        "planned_start": row.planned_start,
        "duration_days": row.duration_days,
        "status": row.status,
        "priority": row.priority,
        "impact": row.impact,
        "notes": row.notes,
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat(),
        "version": row.version,
    }


def _replaying(bundle: FleetBundle, offset: int) -> bool:
    return offset != bundle.replay_offset(None)


def advisories(
    session: Session, as_of: date | None
) -> tuple[FleetBundle, int, list[dict[str, Any]]]:
    bundle = active_bundle(session)
    offset = offset_for(bundle, as_of)
    current = overlay(session) if not _replaying(bundle, offset) else decisions.EMPTY_OVERLAY
    return bundle, offset, decisions.build_advisories(bundle, offset, current)


def find_advisory(session: Session, advisory_id: str) -> dict[str, Any]:
    _, _, items = advisories(session, None)
    for item in items:
        if item["id"] == advisory_id:
            return item
    raise LookupError(advisory_id)


def update_advisory(
    session: Session,
    advisory_id: str,
    status: str,
    reason: str | None,
    expected_status: str | None,
    actor: str,
    work_order_id: str | None = None,
    *,
    commit: bool = True,
) -> dict[str, Any]:
    if status not in ADVISORY_TRANSITIONS:
        raise ValueError("Unknown advisory status")
    if status == "dismissed" and not (reason and reason.strip()):
        raise ValueError("A dismissal needs a reason")
    item = find_advisory(session, advisory_id)
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": advisory_id})
        item = find_advisory(session, advisory_id)
    current = item["status"]
    if current == status:
        return item
    if expected_status is not None and expected_status != current:
        raise FleetConflict(f"Advisory is now '{current}'; refresh before changing it.")
    if status != current and status not in ADVISORY_TRANSITIONS[current]:
        raise FleetConflict(f"Cannot move an advisory from '{current}' to '{status}'.")
    if status == "scheduled" and work_order_id is None:
        raise FleetConflict("Schedule an advisory by creating a work order.")
    session.add(
        FleetAdvisoryDecision(
            advisory_id=advisory_id,
            component_id=item["component_id"],
            status=status,
            reason=reason.strip() if reason else None,
            work_order_id=work_order_id,
            actor=actor,
            snapshot={
                k: item[k]
                for k in ("as_of", "health_index", "risk_14d", "rul_days", "priority", "action")
            },
        )
    )
    session.add(
        AuditEvent(
            actor=actor,
            action=f"fleet.advisory_{status}",
            subject_id=advisory_id,
            details={"reason": reason, "work_order_id": work_order_id},
        )
    )
    if commit:
        session.commit()
    else:
        session.flush()
    return find_advisory(session, advisory_id)


# Work orders --------------------------------------------------------------------------------
def create_work_order(
    session: Session,
    actor: str,
    component_id: str,
    agency_id: str | None,
    planned_start: date,
    advisory_id: str | None,
    notes: str,
) -> dict[str, Any]:
    bundle = active_bundle(session)
    if component_id not in bundle.slot_index:
        raise LookupError(component_id)
    if planned_start < bundle.as_of or planned_start > bundle.as_of + timedelta(days=60):
        raise ValueError("Planned start must be within 60 days of the fleet as-of date")
    slot = bundle.slot_index[component_id]
    record = bundle.slots[slot]
    component_type = bundle.type_by_code[record["type"]]
    agency = agency_id or component_type["agency"]
    if agency not in bundle.agencies:
        raise ValueError("Unknown agency")
    part = component_type["part_number"]
    # The availability preview runs before any lock is taken and is labelled as a preview.
    impact = scenario_preview(bundle, overlay(session), slot, (planned_start - bundle.as_of).days)
    session.rollback()
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        # Serialise reservations of the same part number across concurrent planners.
        session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": part})
    existing = session.scalar(
        select(FleetWorkOrder).where(
            FleetWorkOrder.component_id == component_id,
            FleetWorkOrder.status.in_(
                ["planned", "approved", "in_progress", "awaiting_verification"]
            ),
        )
    )
    if existing is not None:
        raise FleetConflict(f"{component_id} already has open work order {existing.id}")
    advisory = None
    if advisory_id is not None:
        advisory = find_advisory(session, advisory_id)
        if advisory["component_id"] != component_id:
            raise ValueError("Advisory does not belong to this component")
        if advisory["status"] != "accepted":
            raise FleetConflict(f"Advisory is '{advisory['status']}' and cannot be scheduled")
    current = overlay(session)
    reserved = sum(
        1
        for w in current.planned_work
        if w["part"] == part and w["status"] in ("planned", "in_progress")
    )
    on_hand = int(bundle.stock_on(bundle.days - 1)[bundle.part_index[part]])
    duration = round(float(component_type["repair_days"]) * 0.7, 1)
    work = FleetWorkOrder(
        id=f"PWO-{uuid.uuid4().hex[:8].upper()}",
        advisory_id=advisory_id,
        aircraft=record["aircraft"],
        component_id=component_id,
        agency_id=agency,
        part=part,
        title=f"Planned replacement: {component_type['name']}",
        planned_start=planned_start,
        duration_days=duration,
        status="planned",
        priority=advisory["priority"]["level"] if advisory else None,
        impact={
            **impact,
            "spare_on_hand": on_hand,
            "spare_reserved_before": reserved,
            "spare_waits": reserved >= on_hand,
        },
        notes=notes,
        created_by=actor,
    )
    session.add(work)
    session.flush()
    session.add(
        FleetPartRequest(
            id=f"PRQ-{uuid.uuid4().hex[:8].upper()}",
            work_order_id=work.id,
            part=part,
            quantity=1,
            needed_by=planned_start,
            # Tentative work never reserves stock before proposal approval.
            status="open",
            updated_by=actor,
        )
    )
    session.add(
        AuditEvent(
            actor=actor,
            action="fleet.work_order_planned",
            subject_id=work.id,
            details={
                "component_id": component_id,
                "advisory_id": advisory_id,
                "planned_start": str(planned_start),
                "agency": agency,
            },
        )
    )
    from fleet_maintenance.services.cases import ensure_case, link

    dataset = f"operational:{run_id_of(bundle)}"
    case = ensure_case(
        session,
        dataset,
        advisory_id or f"work:{work.id}",
        record["aircraft"],
        component_id,
        work.title,
        actor,
    )
    link(session, case, "fleet_work", work.id, str(work.version))
    session.flush()
    for request in session.scalars(
        select(FleetPartRequest).where(FleetPartRequest.work_order_id == work.id)
    ):
        link(session, case, "fleet_request", request.id, str(request.version))
    session.commit()
    return work_order_dict(work)


def update_work_order(
    session: Session,
    work_order_id: str,
    status: str,
    expected_version: int,
    actor: str,
    notes: str | None = None,
) -> dict[str, Any]:
    lock_fleet_commitments(session)
    work = session.get(FleetWorkOrder, work_order_id, with_for_update=True)
    if work is None:
        raise LookupError(work_order_id)
    if work.status == status or (status == "completed" and work.status == "awaiting_verification"):
        return work_order_dict(work)
    if work.version != expected_version:
        raise FleetConflict("Work order changed; refresh before updating it.")
    if status not in WORK_ORDER_TRANSITIONS.get(work.status, set()):
        raise FleetConflict(f"Cannot move a work order from '{work.status}' to '{status}'.")
    if status == "in_progress":
        requests = list(
            session.scalars(
                select(FleetPartRequest).where(FleetPartRequest.work_order_id == work.id)
            )
        )
        if work.status != "approved":
            raise FleetConflict("Review and approve the exact proposal before starting work")
        if any(
            r.status not in {"reserved", "received"}
            or (r.status == "received" and r.received_quantity < r.quantity)
            for r in requests
        ):
            raise FleetConflict("Required parts are not secured")
        from fleet_maintenance.persistence.models import FleetCapacityBooking

        bookings = list(
            session.scalars(
                select(FleetCapacityBooking).where(FleetCapacityBooking.work_id == work.id)
            )
        )
        if {b.kind for b in bookings} != {"crew", "bay"}:
            raise FleetConflict("Approved crew and bay commitments are unavailable")
    if status == "completed":
        work.status = "awaiting_verification"
    else:
        work.status = status
    work.version += 1
    if notes:
        work.notes = notes.strip()
    if status == "cancelled":
        from fleet_maintenance.services.fleet_planning import release

        release(session, work)
        for request in session.scalars(
            select(FleetPartRequest).where(
                FleetPartRequest.work_order_id == work.id,
                FleetPartRequest.status.in_(["open", "reserved", "ordered"]),
            )
        ):
            request.status = "cancelled"
            request.version += 1
    if work.advisory_id and status == "cancelled":
        session.add(
            FleetAdvisoryDecision(
                advisory_id=work.advisory_id,
                component_id=work.component_id or "",
                status="completed" if status == "completed" else "accepted",
                # A cancelled order no longer belongs to the advisory; it returns to "confirmed".
                work_order_id=work.id if status == "completed" else None,
                actor=actor,
                snapshot={"work_order_status": status, "work_order_id": work.id},
            )
        )
    session.add(
        AuditEvent(
            actor=actor,
            action=f"fleet.work_order_{status}",
            subject_id=work.id,
            details={"version": work.version, "notes": notes},
        )
    )
    session.commit()
    return work_order_dict(work)


def work_orders(
    session: Session, status: str | None, aircraft: str | None, agency: str | None
) -> dict[str, Any]:
    bundle = active_bundle(session)
    current = overlay(session)
    day = bundle.days - 1
    recorded = []
    closed_rows = {
        row.work_order_id: row for row in session.scalars(select(FleetRecordedClosure)).all()
    }
    for wo in bundle.records["work_orders"]:
        closure = closed_rows.get(wo["id"])
        is_open = (wo["done_day"] is None or wo["done_day"] >= day) and closure is None
        if not is_open and closure is None and wo["done_day"] < day - 120:
            continue
        phase = bundle.work_order_phase(wo, day) if is_open else "closed"
        item = {
            "id": wo["id"],
            "source": "recorded",
            "aircraft": wo["aircraft"],
            "component_id": bundle.slots[wo["slot"]]["id"] if wo["slot"] is not None else None,
            "component_name": bundle.type_by_code[bundle.slots[wo["slot"]]["type"]]["name"]
            if wo["slot"] is not None
            else "Whole aircraft",
            "kind": wo["kind"],
            "agency_id": wo["agency"],
            "finding": wo["finding"],
            "priority": wo["priority"],
            "status": "open" if is_open else "closed",
            "phase": phase,
            "opened": wo["opened"],
            "promised": bundle.date_of(wo["promised_day"]).isoformat(),
            "completed": (
                bundle.as_of.isoformat() if closure else bundle.date_of(wo["done_day"]).isoformat()
            )
            if not is_open
            else None,
            "turnaround_days": ((day if closure else wo["done_day"]) - wo["opened_day"])
            if not is_open
            else None,
            "late": (day if is_open or closure else wo["done_day"]) > wo["promised_day"],
            "returned_by": closure.actor if closure else None,
            "delay_reason": wo["delay_reason"] or (phase if phase.startswith("awaiting") else None),
            "spare_wait_days": wo["spare_wait_days"],
            "queue_wait_days": wo["queue_wait_days"],
            "part": wo["part"],
            "serial_out": wo["serial_out"],
            "serial_in": wo["serial_in"],
        }
        recorded.append(item)
    planned = [
        {**w, "source": "planned", "planned_start": str(w["planned_start"])}
        for w in current.planned_work
    ]

    def keep(item: dict[str, Any]) -> bool:
        if aircraft and item["aircraft"] != aircraft:
            return False
        if agency and item["agency_id"] != agency:
            return False
        return not status or item["status"] == status

    recorded = sorted(filter(keep, recorded), key=lambda w: w["opened"], reverse=True)
    closed = [w for w in recorded if w["status"] == "closed"]
    return {
        "as_of": bundle.as_of.isoformat(),
        "recorded": recorded,
        "planned": [w for w in planned if keep(w)],
        "kpis": {
            "backlog": decisions.backlog(bundle, day, current),
            "mean_turnaround_days": round(
                sum(w["turnaround_days"] for w in closed) / max(len(closed), 1), 2
            ),
            "on_time_rate": round(sum(1 for w in closed if not w["late"]) / max(len(closed), 1), 4),
            "closed_last_120_days": len(closed),
        },
    }


# Scenarios ----------------------------------------------------------------------------------
def _plan_interventions(bundle: FleetBundle, current: decisions.Overlay) -> list[Intervention]:
    items = []
    for work in current.planned_work:
        if work["status"] != "planned" or work["component_id"] not in bundle.slot_index:
            continue
        start = (work["planned_start"] - bundle.as_of).days
        if 0 <= start < 60:
            items.append(
                Intervention(
                    "replace", (bundle.slot_index[work["component_id"]],), day=max(start, 0)
                )
            )
    return items


def _pair(
    bundle: FleetBundle,
    current: decisions.Overlay,
    horizon: int,
    runs: int,
    seed: int,
    plans: tuple[Intervention, ...],
    extra: tuple[Intervention, ...],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Baseline (current plan) and scenario (plan + extra) with common random numbers."""
    inputs = snapshot(bundle, current)
    baseline = simulate_fleet(inputs, horizon, runs, seed, plans).describe()
    scenario = simulate_fleet(inputs, horizon, runs, seed, plans + extra).describe()
    return baseline, scenario


def scenario_preview(
    bundle: FleetBundle, current: decisions.Overlay, slot: int, start_day: int
) -> dict[str, Any]:
    plans = tuple(_plan_interventions(bundle, current))
    baseline, scenario = _pair(
        bundle,
        current,
        30,
        200,
        7,
        plans,
        (Intervention("replace", (slot,), day=max(start_day, 0)),),
    )
    return {
        "horizon_days": 30,
        "runs": 200,
        "availability_pct_points": round(
            100 * (float(scenario["availability_mean"]) - float(baseline["availability_mean"])), 2
        ),
        "aircraft_days_lost": round(
            float(scenario["aircraft_days_lost"]) - float(baseline["aircraft_days_lost"]), 2
        ),
    }


def _interventions(
    bundle: FleetBundle, kind: str, params: dict[str, Any], items: list[dict[str, Any]]
) -> tuple[Intervention, ...]:
    if kind == "schedule_maintenance":
        component = str(params.get("component_id", ""))
        if component not in bundle.slot_index:
            raise ValueError("Unknown component_id")
        start = int(params.get("start_in_days", 1))
        if not 0 <= start < 60:
            raise ValueError("start_in_days must be between 0 and 59")
        return (Intervention("replace", (bundle.slot_index[component],), day=start),)
    if kind == "spare_unavailable":
        part = str(params.get("part_number", ""))
        if part not in bundle.part_index:
            raise ValueError("Unknown part_number")
        lead = int(
            params.get("lead_time_days", bundle.types[bundle.part_index[part]]["lead_time_days"])
        )
        if not 1 <= lead <= 365:
            raise ValueError("lead_time_days must be between 1 and 365")
        return (
            Intervention("spare_unavailable", part=bundle.part_index[part], lead_time_days=lead),
        )
    if kind == "early_replacement":
        ids = params.get("component_ids")
        if not ids:
            levels = set(params.get("priority_levels") or ["P1"])
            ids = [a["component_id"] for a in items if a["priority"]["level"] in levels]
        slots = tuple(bundle.slot_index[c] for c in ids if c in bundle.slot_index)
        if not slots:
            raise ValueError("No components selected for early replacement")
        return (Intervention("early_replacement", slots),)
    if kind == "extra_capacity":
        agency = str(params.get("agency_id", ""))
        agencies = list(bundle.agencies)
        if agency not in agencies:
            raise ValueError("Unknown agency_id")
        extra = int(params.get("extra_bays", 1))
        if not 1 <= extra <= 5:
            raise ValueError("extra_bays must be between 1 and 5")
        return (Intervention("extra_capacity", agency=agencies.index(agency), extra_bays=extra),)
    raise ValueError(f"Scenario kind must be one of {', '.join(SCENARIO_KINDS)}")


def run_scenario(
    session: Session,
    actor: str,
    name: str,
    kind: str,
    params: dict[str, Any],
    horizon: int,
    runs: int,
    seed: int,
) -> dict[str, Any]:
    bundle = active_bundle(session)
    current = overlay(session)
    items = decisions.build_advisories(bundle, bundle.replay_offset(None), current)
    plans = tuple(_plan_interventions(bundle, current))
    interventions = _interventions(bundle, kind, params, items)
    frozen_inputs = snapshot(bundle, current)
    session.rollback()  # no transaction is held during the calculation
    baseline, scenario = _pair(bundle, current, horizon, runs, seed, plans, interventions)
    by_aircraft: list[dict[str, Any]] = [
        {"aircraft": tail, "delta_aircraft_days": round(float(s) - float(b), 2)}
        for tail, s, b in zip(
            bundle.snapshot().aircraft_ids,
            scenario["aircraft_days_lost_by_aircraft"],
            baseline["aircraft_days_lost_by_aircraft"],
            strict=True,
        )
    ]
    stockouts = [
        {"part_number": bundle.types[i]["part_number"], "baseline": float(b), "scenario": float(s)}
        for i, (b, s) in enumerate(
            zip(baseline["stockout_probability"], scenario["stockout_probability"], strict=True)
        )
        if b > 0.02 or s > 0.02
    ]
    dates = [(bundle.as_of + timedelta(days=d + 1)).isoformat() for d in range(horizon)]
    results = {
        "dates": dates,
        "baseline": {k: v for k, v in baseline.items() if k != "aircraft_days_lost_by_aircraft"},
        "scenario": {k: v for k, v in scenario.items() if k != "aircraft_days_lost_by_aircraft"},
        "delta": {
            "availability_pct_points": round(
                100 * (float(scenario["availability_mean"]) - float(baseline["availability_mean"])),
                2,
            ),
            "aircraft_days_lost": round(
                float(scenario["aircraft_days_lost"]) - float(baseline["aircraft_days_lost"]), 2
            ),
            "by_cause": {
                cause: round(
                    float(scenario["by_cause"][cause]) - float(baseline["by_cause"][cause]), 2
                )
                for cause in CAUSES
            },
        },
        "by_aircraft": sorted(
            [row for row in by_aircraft if abs(row["delta_aircraft_days"]) >= 0.05],
            key=lambda row: -abs(row["delta_aircraft_days"]),
        )[:10],
        "stockouts": sorted(stockouts, key=lambda row: -max(row["scenario"], row["baseline"]))[:8],
        "assumptions": {
            "evidence_kind": "synthetic_scenario",
            "as_of": bundle.as_of.isoformat(),
            "engine_bundle": run_id_of(bundle),
            "aircraft_count": len(frozen_inputs.aircraft_ids),
            "exposure_aircraft_days": len(frozen_inputs.aircraft_ids) * horizon,
            "availability_formula": "1 - mean unavailable aircraft-days / exposure aircraft-days",
            "comparison_formula": "100 * (scenario availability - baseline availability)",
            "horizon_days": horizon, "runs": runs, "seed": seed,
            "failure_model": "Day-step failures from synthetic RUL quantiles; without a "
            "degradation signal use synthetic 30-day risk/background hazard.",
            "repair_model": "ceil(type repair days * multiplier * lognormal(0, 0.3)); "
            "minimum one day. Planned multiplier 0.7; unscheduled 1.0. Assumed, not measured.",
            "repair_days_by_slot": frozen_inputs.repair_days.tolist(),
            "part_stock": frozen_inputs.stock.tolist(),
            "part_lead_time_days": frozen_inputs.lead_time.tolist(),
            "bays_by_agency": frozen_inputs.bays.tolist(),
            "inspection_days": frozen_inputs.inspection_days,
            "intervention": {"kind": kind, "params": params},
            "planned_interventions": [
                {"kind": p.kind, "slots": list(p.slots), "day": p.day} for p in plans
            ],
        },
        "baseline_includes_planned_work": len(plans),
        "framing": "Decision-support simulation on synthetic maintenance data, not operational "
        "planning.",
    }
    record = FleetScenarioRun(
        id=f"sc-{uuid.uuid4().hex[:10]}",
        engine_run_id=run_id_of(bundle),
        name=name,
        kind=kind,
        params=params,
        horizon_days=horizon,
        runs=runs,
        seed=seed,
        results=results,
        created_by=actor,
    )
    session.add(record)
    session.add(
        AuditEvent(
            actor=actor,
            action="fleet.scenario_run",
            subject_id=record.id,
            details={"kind": kind, "params": params},
        )
    )
    session.commit()
    return scenario_dict(record)


def scenario_dict(row: FleetScenarioRun) -> dict[str, Any]:
    return {
        "id": row.id,
        "engine_run_id": row.engine_run_id,
        "name": row.name,
        "kind": row.kind,
        "params": row.params,
        "horizon_days": row.horizon_days,
        "runs": row.runs,
        "seed": row.seed,
        "results": row.results,
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat(),
    }


def scenarios(session: Session) -> list[dict[str, Any]]:
    bundle = active_bundle(session)
    rows = session.scalars(
        select(FleetScenarioRun)
        .where(FleetScenarioRun.engine_run_id == run_id_of(bundle))
        .order_by(FleetScenarioRun.created_at.desc())
        .limit(30)
    ).all()
    return [scenario_dict(row) for row in rows]


def forecast(
    bundle: FleetBundle, offset: int, current: decisions.Overlay | None = None
) -> dict[str, Any]:
    if not _replaying(bundle, offset):
        if current is None or not (
            current.closed_recorded
            or current.replaced_components
            or current.in_work()
            or current.part_requests
            or current.assessments
        ):
            return dict(bundle.forecast)
        # Workspace decisions change the starting state, so re-run the baseline forecast.
        key_text = repr(
            (
                sorted(current.closed_recorded),
                sorted(current.replaced_components),
                [w["id"] for w in current.in_work()],
                [
                    (r["part"], r["status"], r["eta"], r.get("received_quantity", 0))
                    for r in current.part_requests
                ],
                current.assessments,
            )
        )
        cache_key = (run_id_of(bundle), hash(key_text))
        with _lock:
            if cache_key in _forecasts:
                return _forecasts[cache_key]
        plans = tuple(_plan_interventions(bundle, current))
        result = {
            "horizon_days": 30,
            "runs": 300,
            "seed": 26249,
            **simulate_fleet(snapshot(bundle, current), 30, 300, 26249, plans).describe(),
        }
        with _lock:
            _forecasts[cache_key] = result
        return result
    key = (run_id_of(bundle), offset)
    with _lock:
        if key in _forecasts:
            return _forecasts[key]
    result = {
        "horizon_days": 30,
        "runs": 200,
        "seed": 26249,
        **simulate_fleet(bundle.snapshot(offset), 30, 200, 26249).describe(),
    }
    with _lock:
        _forecasts[key] = result
    return result


# Alerts -------------------------------------------------------------------------------------
def alerts(session: Session) -> list[dict[str, Any]]:
    bundle, offset, items = advisories(session, None)
    as_of = bundle.as_of.isoformat()
    found: list[dict[str, Any]] = []
    for item in items:
        if item["status"] in ("completed", "dismissed"):
            continue
        if item["risk_14d"] >= 0.5:
            found.append(
                {
                    "key": f"risk:{item['id']}",
                    "type": "failure_risk",
                    "severity": "critical" if item["risk_14d"] >= 0.7 else "warning",
                    "title": f"{item['aircraft']} {item['component_name']}: "
                    f"{item['risk_14d']:.0%} 14-day failure risk",
                    "message": item["action"]["label"],
                    "aircraft": item["aircraft"],
                    "component_id": item["component_id"],
                    "advisory_id": item["id"],
                }
            )
        if item["spare"]["lead_time_exceeds_rul"]:
            found.append(
                {
                    "key": f"spare:{item['id']}",
                    "type": "spare_vs_rul",
                    "severity": "warning",
                    "title": f"{item['spare']['part_number']} lead time "
                    f"({item['spare']['lead_time_days']} d) exceeds RUL p10 for "
                    f"{item['component_id']}",
                    "message": item["spare"]["note"] or "No spare available for this component.",
                    "aircraft": item["aircraft"],
                    "component_id": item["component_id"],
                    "advisory_id": item["id"],
                }
            )
    for task in decisions.scheduled_tasks(bundle):
        if task["overdue"]:
            found.append(
                {
                    "key": f"overdue:{task['id']}",
                    "type": "overdue_inspection",
                    "severity": "critical",
                    "title": f"{task['aircraft']}: {task['task']} overdue",
                    "message": f"{-task['remaining_flight_hours']:.0f} flight hours past due. "
                    "Mandatory inspections are never deferred by model output.",
                    "aircraft": task["aircraft"],
                    "component_id": task["component_id"],
                    "advisory_id": None,
                }
            )
    summary = decisions.backlog(bundle, bundle.days - 1, overlay(session))
    bays = sum(int(a["bays"]) for a in bundle.agencies.values())
    if summary["open_work_orders"] > bays:
        found.append(
            {
                "key": f"backlog:{as_of}",
                "type": "backlog",
                "severity": "warning",
                "title": f"Backlog {summary['open_work_orders']} work orders exceeds {bays} bays",
                "message": f"Outstanding effort about {summary['man_hours']:.0f} man-hours.",
                "aircraft": None,
                "component_id": None,
                "advisory_id": None,
            }
        )
    acknowledgements: dict[str, FleetAlertAcknowledgement] = {
        row.alert_key: row for row in session.scalars(select(FleetAlertAcknowledgement)).all()
    }
    for alert in found:
        acknowledgement = acknowledgements.get(alert["key"])
        alert["created_on"] = as_of
        alert["acknowledged_by"] = acknowledgement.actor if acknowledgement else None
        alert["acknowledged_at"] = (
            acknowledgement.created_at.isoformat() if acknowledgement else None
        )
    order = {"critical": 0, "warning": 1, "info": 2}
    _ = offset
    return sorted(found, key=lambda a: (a["acknowledged_by"] is not None, order[a["severity"]]))


def acknowledge_alert(session: Session, key: str, actor: str) -> None:
    if not any(alert["key"] == key for alert in alerts(session)):
        raise LookupError(key)
    exists = session.scalar(
        select(FleetAlertAcknowledgement).where(FleetAlertAcknowledgement.alert_key == key)
    )
    if exists is None:
        session.add(FleetAlertAcknowledgement(alert_key=key, actor=actor))
        session.add(
            AuditEvent(
                actor=actor, action="fleet.alert_acknowledged", subject_id=key[:80], details={}
            )
        )
        session.commit()


# Ingestion ----------------------------------------------------------------------------------
def ingest(
    session: Session, actor: str, source: str, readings: list[dict[str, Any]]
) -> dict[str, Any]:
    lock_fleet_commitments(session)
    bundle = active_bundle(session)
    earliest = bundle.as_of - timedelta(days=365)
    errors: list[dict[str, Any]] = []
    accepted: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for row_number, row in enumerate(readings):

        def reject(field: str, message: str, row_number: int = row_number) -> None:
            errors.append({"row": row_number, "field": field, "message": message})

        component = str(row.get("component_id", ""))
        if component not in bundle.slot_index:
            reject("component_id", "Unknown component identifier")
            continue
        component_type = bundle.type_by_code[bundle.slots[bundle.slot_index[component]]["type"]]
        parameter = next(
            (
                p
                for p in component_type["parameters"]
                if p["name"].lower() == str(row.get("parameter", "")).lower()
            ),
            None,
        )
        if parameter is None:
            reject("parameter", f"Not a monitored parameter of {component_type['name']}")
            continue
        if row.get("unit") != parameter["unit"]:
            reject("unit", f"Expected {parameter['unit']}; use catalogue units without conversion")
            continue
        try:
            reading_date = date.fromisoformat(str(row.get("date")))
        except ValueError:
            reject("date", "Date must be ISO 8601 (YYYY-MM-DD)")
            continue
        if not earliest <= reading_date <= bundle.as_of:
            reject("date", f"Date must be between {earliest} and {bundle.as_of}")
            continue
        values = {}
        invalid = False
        for field in ("mean", "max", "min", "std"):
            value = row.get(field)
            if value is None and field != "mean":
                continue
            if (
                not isinstance(value, int | float)
                or isinstance(value, bool)
                or not math.isfinite(float(value))
            ):
                reject(field, "Must be a finite number")
                invalid = True
                break
            values[field] = float(value)
        if invalid:
            continue
        mean = values["mean"]
        if "min" in values and "max" in values and not values["min"] <= mean <= values["max"]:
            reject("mean", "Mean must lie between min and max")
            continue
        if values.get("std", 0.0) < 0:
            reject("std", "Standard deviation cannot be negative")
            continue
        span = 30 * float(parameter["noise"]) + 1.5 * abs(float(parameter["signature"]))
        if abs(mean - float(parameter["baseline"])) > span:
            reject(
                "mean", f"Outside the plausible range for {parameter['name']} ({parameter['unit']})"
            )
            continue
        raw_flag = row.get("quality_flag", 0)
        if not isinstance(raw_flag, int) or isinstance(raw_flag, bool):
            reject("quality_flag", "Quality flag must be an integer")
            continue
        flag = raw_flag
        if flag not in (0, 1, 2, 3):
            reject("quality_flag", "Quality flag must be 0, 1, 2 or 3")
            continue
        key = (component, reading_date.isoformat(), parameter["name"])
        if key in seen or session.scalar(
            select(FleetIngestedReading.id)
            .where(
                FleetIngestedReading.component_id == component,
                FleetIngestedReading.reading_date == reading_date,
                FleetIngestedReading.parameter == parameter["name"],
            )
            .limit(1)
        ):
            reject("parameter", "Duplicate reading for this component, date and parameter")
            continue
        seen.add(key)
        accepted.append(
            {
                "component_id": component,
                "reading_date": reading_date,
                "parameter": parameter["name"],
                "mean": mean,
                "maximum": values.get("max"),
                "minimum": values.get("min"),
                "std": values.get("std"),
                "quality_flag": flag,
            }
        )
    batch = FleetIngestBatch(
        id=f"ing-{uuid.uuid4().hex[:10]}",
        source=source,
        accepted=len(accepted),
        rejected=len(errors),
        errors=errors[:200],
        actor=actor,
    )
    session.add(batch)
    session.flush()
    for row in accepted:
        session.add(FleetIngestedReading(batch_id=batch.id, **row))
    session.add(
        AuditEvent(
            actor=actor,
            action="fleet.readings_ingested",
            subject_id=batch.id,
            details={"accepted": len(accepted), "rejected": len(errors)},
        )
    )
    session.flush()
    from fleet_maintenance.services.ingestion import queue_fleet_batch

    queue_fleet_batch(session, batch, actor)
    session.commit()
    return batch_dict(batch)


def batch_dict(batch: FleetIngestBatch) -> dict[str, Any]:
    return {
        "id": batch.id,
        "source": batch.source,
        "accepted": batch.accepted,
        "rejected": batch.rejected,
        "errors": batch.errors,
        "actor": batch.actor,
        "created_at": batch.created_at.isoformat(),
    }


def ingest_batches(session: Session) -> list[dict[str, Any]]:
    return [
        batch_dict(b)
        for b in session.scalars(
            select(FleetIngestBatch).order_by(FleetIngestBatch.created_at.desc()).limit(20)
        ).all()
    ]


# Read models for screens --------------------------------------------------------------------
def _clean(values: Any) -> list[float | None]:
    return [
        None if value is None or math.isnan(float(value)) else round(float(value), 4)
        for value in values
    ]


def component_health(
    session: Session, component_id: str, as_of: date | None, days: int = 180
) -> dict[str, Any]:
    bundle = active_bundle(session)
    if component_id not in bundle.slot_index:
        raise LookupError(component_id)
    offset = offset_for(bundle, as_of)
    replay = _replaying(bundle, offset)
    current = overlay(session) if not replay else decisions.EMPTY_OVERLAY
    slot = bundle.slot_index[component_id]
    record = bundle.slots[slot]
    component_type = bundle.type_by_code[record["type"]]
    day = bundle.replay_start_day + offset
    recent_index = day - bundle.recent_start_day
    first = max(0, recent_index - days + 1)
    window = slice(first, recent_index + 1)
    arrays = bundle.arrays
    sensors = []
    for k, parameter in enumerate(component_type["parameters"]):
        flags = arrays["flags"][slot, window, k]
        sensors.append(
            {
                "name": parameter["name"],
                "unit": parameter["unit"],
                "direction": parameter["direction"],
                "values": _clean(arrays["readings"][slot, window, k]),
                "normalised": _clean(arrays["z"][slot, window, k]),
                "cleaned": [int(flag) for flag in flags],
            }
        )
    replay_slice = slice(0, offset + 1)
    state = next(
        row for row in decisions.component_states(bundle, offset, current) if row["slot"] == slot
    )
    advisory = next(
        (
            item
            for item in decisions.build_advisories(bundle, offset, current)
            if item["component_id"] == component_id
        ),
        None,
    )
    history = []
    for instance in bundle.records["instances"]:
        if instance["slot"] == slot:
            history.append(
                {
                    "date": instance["installed"],
                    "kind": "installed",
                    "label": f"Installed {instance['serial']}",
                }
            )
            if instance["removed"]:
                history.append(
                    {
                        "date": instance["removed"],
                        "kind": "removed",
                        "label": f"Removed {instance['serial']} ({instance['reason']})",
                    }
                )
    for wo in bundle.records["work_orders"]:
        if wo["slot"] == slot:
            history.append(
                {
                    "date": wo["opened"],
                    "kind": f"work_order_{wo['kind']}",
                    "label": f"{wo['id']}: {wo['finding']}",
                    "work_order": wo["id"],
                }
            )
    for fault in bundle.records["faults"]:
        if fault["slot"] == slot:
            history.append(
                {
                    "date": bundle.date_of(fault["day"]).isoformat(),
                    "kind": "fault" if fault["severity"] >= 4 else "bit_message",
                    "label": f"{fault['code']}: {fault['description']}",
                }
            )
    for work in current.planned_work:
        if work["component_id"] == component_id:
            history.append(
                {
                    "date": str(work["planned_start"]),
                    "kind": "planned",
                    "label": f"{work['id']}: {work['title']} ({work['status']})",
                }
            )
    history = sorted(
        (h for h in history if h["date"] <= bundle.date_of(day + 60).isoformat()),
        key=lambda h: h["date"],
        reverse=True,
    )
    rul = arrays["rul"][slot, offset]
    hi_now = float(arrays["hi"][slot, offset])
    projection = {
        "threshold": 0.0,
        "crossing_p10": bundle.date_of(day + int(round(float(rul[0])))).isoformat(),
        "crossing_p50": bundle.date_of(day + int(round(float(rul[1])))).isoformat(),
        "crossing_p90": bundle.date_of(day + int(round(float(rul[2])))).isoformat(),
        "capped": bool(float(rul[2]) >= 60.0),
        "health_index_now": round(hi_now, 1),
        "note": "Projection connects today's health index to the RUL quantiles; values beyond "
        "60 days are reported as 'at least 60 days'.",
    }
    truth = None
    hidden = bundle.truth["future_failure_days"].get(str(slot))
    if hidden is not None:
        truth = {
            "scripted_failure_date": bundle.date_of(int(hidden)).isoformat(),
            "label": "Hidden simulation truth for this scripted demonstration component. "
            "Shown only to evaluate warning lead time; never used by the models.",
        }
    replay_first = bundle.replay_start_day
    response: dict[str, Any] = {
        "component": {
            **record,
            "name": component_type["name"],
            "system": component_type["system"],
            "system_name": bundle.systems[component_type["system"]],
            "criticality": component_type["criticality"],
            "part_number": component_type["part_number"],
            "mean_life_fh": component_type["mean_life_fh"],
            "hard_time_fh": component_type["hard_time_fh"],
        },
        "as_of": bundle.date_of(day).isoformat(),
        "replay": replay,
        "dates": [
            bundle.date_of(bundle.recent_start_day + i).isoformat()
            for i in range(first, recent_index + 1)
        ],
        "sensors": sensors,
        "ambient": _clean(arrays["ambient"][bundle.slot_aircraft_index[slot], window]),
        "health_index": [round(float(v), 1) for v in arrays["hi_recent"][slot, window]],
        "replay_dates": [bundle.date_of(replay_first + i).isoformat() for i in range(offset + 1)],
        "risk14": [round(float(v), 4) for v in arrays["risk14"][slot, replay_slice]],
        "risk30": [round(float(v), 4) for v in arrays["risk30"][slot, replay_slice]],
        "rul": [
            {
                "p10": round(float(r[0]), 1),
                "p50": round(float(r[1]), 1),
                "p90": round(float(r[2]), 1),
            }
            for r in arrays["rul"][slot, replay_slice]
        ],
        "anomaly": [round(float(v), 4) for v in arrays["anomaly"][slot, replay_slice]],
        "anomaly_alert": [bool(v) for v in arrays["alert"][slot, replay_slice]],
        "anomaly_threshold": float(bundle.evaluation["training"]["anomaly_threshold_percentile"]),
        "advisory": advisory,
        "state": state["state"],
        "history": history[:60],
        "projection": projection,
        "simulation_truth": truth,
    }

    assessment = current.assessments.get(component_id)
    response["assessment"] = assessment
    if not replay:
        dates = response["dates"]
        for reading in session.scalars(
            select(FleetIngestedReading).where(FleetIngestedReading.component_id == component_id)
        ):
            iso = reading.reading_date.isoformat()
            if iso not in dates:
                continue
            index = dates.index(iso)
            for sensor in sensors:
                if sensor["name"] == reading.parameter:
                    sensor["values"][index] = reading.mean if reading.quality_flag == 0 else None
                    sensor["cleaned"][index] = reading.quality_flag
        if assessment and assessment.get("state") == "available":
            response["health_index"][-1] = assessment["health_index"]
            response["risk14"][-1] = assessment["risk14"]
            response["risk30"][-1] = assessment["risk30"]
            response["rul"][-1] = assessment["rul"]
            response["anomaly"][-1] = assessment["anomaly"]
            for index, sensor in enumerate(sensors):
                sensor["normalised"][-1] = assessment["normalised"][index]
    return response


def aircraft_list(session: Session, as_of: date | None) -> list[dict[str, Any]]:
    bundle, offset, items = advisories(session, as_of)
    current = overlay(session) if not _replaying(bundle, offset) else decisions.EMPTY_OVERLAY
    grid = decisions.heat_grid(bundle, offset, current)
    by_aircraft: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        if item["status"] not in ("completed", "dismissed"):
            by_aircraft.setdefault(item["aircraft"], []).append(item)
    rows = []
    for row, aircraft in zip(grid["rows"], bundle.aircraft, strict=True):
        open_items = by_aircraft.get(aircraft["id"], [])
        rows.append(
            {
                "id": aircraft["id"],
                "base": aircraft["base"],
                "state": row["state"],
                "availability_state": row["availability_state"],
                "health_index": row["health_index"],
                "driver": row["driver"],
                "open_advisories": len(open_items),
                "top_priority": min((i["priority"]["level"] for i in open_items), default=None),
                "total_flight_hours": aircraft["total_flight_hours"],
                "utilisation_flights_per_day": aircraft["utilisation_flights_per_day"],
            }
        )
    return rows


def aircraft_detail(session: Session, aircraft_id: str, as_of: date | None) -> dict[str, Any]:
    bundle, offset, items = advisories(session, as_of)
    if aircraft_id not in bundle.aircraft_index:
        raise LookupError(aircraft_id)
    current = overlay(session) if not _replaying(bundle, offset) else decisions.EMPTY_OVERLAY
    twin = decisions.twin_aircraft(bundle, offset, aircraft_id, overlay=current)
    day = bundle.replay_start_day + offset
    index = bundle.aircraft_index[aircraft_id]
    orders = [
        {
            "id": wo["id"],
            "kind": wo["kind"],
            "finding": wo["finding"],
            "opened": wo["opened"],
            "status": "open" if wo["done_day"] is None or wo["done_day"] > day else "closed",
            "completed": (
                bundle.date_of(wo["done_day"]).isoformat()
                if wo["done_day"] is not None and wo["done_day"] <= day
                else None
            ),
            "agency": wo["agency"],
            "component_id": bundle.slots[wo["slot"]]["id"] if wo["slot"] is not None else None,
            "delay_reason": wo["delay_reason"],
        }
        for wo in bundle.records["work_orders"]
        if wo["aircraft"] == aircraft_id and wo["opened_day"] <= day
    ][-25:]
    timeline = []
    for wo in orders:
        timeline.append(
            {
                "date": wo["opened"],
                "kind": wo["kind"],
                "label": wo["finding"],
                "component_id": wo["component_id"],
                "reference": wo["id"],
            }
        )
    for fault in bundle.records["faults"]:
        if fault["aircraft"] == aircraft_id and fault["severity"] >= 4 and fault["day"] <= day:
            timeline.append(
                {
                    "date": bundle.date_of(fault["day"]).isoformat(),
                    "kind": "fault",
                    "label": fault["description"],
                    "component_id": bundle.slots[fault["slot"]]["id"],
                    "reference": fault["code"],
                }
            )
    state = bundle.arrays["aircraft_state"][index]
    names = decisions.AVAILABILITY_STATES
    return {
        "aircraft": bundle.aircraft[index],
        "as_of": bundle.date_of(day).isoformat(),
        "replay": _replaying(bundle, offset),
        **{
            k: twin[k] for k in ("state", "availability_state", "health_index", "driver", "systems")
        },
        "advisories": [i for i in items if i["aircraft"] == aircraft_id],
        "work_orders": list(reversed(orders)),
        "timeline": sorted(timeline, key=lambda t: t["date"], reverse=True)[:40],
        "availability_90d": [
            {"date": bundle.date_of(d).isoformat(), "state": names[int(state[d])]}
            for d in range(max(0, day - 89), day + 1)
        ],
        "tasks": [t for t in decisions.scheduled_tasks(bundle) if t["aircraft"] == aircraft_id],
    }


def summary(session: Session, as_of: date | None) -> dict[str, Any]:
    bundle, offset, items = advisories(session, as_of)
    current = overlay(session) if not _replaying(bundle, offset) else decisions.EMPTY_OVERLAY
    result = decisions.fleet_summary(bundle, offset, current, items)
    projected = forecast(bundle, offset, current)
    result["forecast_30d"] = {
        k: projected[k]
        for k in (
            "availability_mean",
            "availability_p10",
            "availability_p50",
            "availability_p90",
            "aircraft_days_lost",
            "by_cause",
            "expected_failures",
            "horizon_days",
            "runs",
        )
    }
    result["alerts_open"] = (
        sum(1 for alert in alerts(session) if not alert["acknowledged_by"])
        if not _replaying(bundle, offset)
        else 0
    )
    return result


def cannibalize_strategy(session: Session, as_of: date | None) -> dict[str, Any]:
    bundle = active_bundle(session)
    offset = offset_for(bundle, as_of)
    replaying = _replaying(bundle, offset)
    current = overlay(session) if not replaying else decisions.EMPTY_OVERLAY
    result = cannibalize.strategy(bundle, offset, current)
    result["replay"] = replaying
    # When nothing is blocked today, point to replay days that show the solver at work.
    examples: list[str] = []
    if not (result["swaps"] or result["unmet"]):
        previous: list[str] = []
        for earlier in range(bundle.replay_offset(None) - 1, -1, -1):
            if len(examples) == 6:
                break
            swaps = [
                s["text"]
                for s in cannibalize.strategy(bundle, earlier, decisions.EMPTY_OVERLAY)["swaps"]
            ]
            if swaps and swaps != previous:  # one day per distinct situation
                examples.append(bundle.date_of(bundle.replay_start_day + earlier).isoformat())
            previous = swaps
    result["days_with_blocked_aircraft"] = examples
    return result


def availability_trend(session: Session, as_of: date | None) -> dict[str, Any]:
    bundle = active_bundle(session)
    offset = offset_for(bundle, as_of)
    day = bundle.replay_start_day + offset
    current = overlay(session) if not _replaying(bundle, offset) else decisions.EMPTY_OVERLAY
    projected = forecast(bundle, offset, current)
    curve = projected["curve"]
    return {
        "history": decisions.availability_history(bundle, 180, day, current),
        "forecast": [
            {
                "date": bundle.date_of(day + i + 1).isoformat(),
                "p10": curve["p10"][i],
                "p50": curve["p50"][i],
                "p90": curve["p90"][i],
                "mean": curve["mean"][i],
            }
            for i in range(len(curve["p50"]))
        ],
        "downtime_by_month": decisions.downtime_by_month(bundle),
        "definition": "Fleet availability = aircraft-days in the available state / all "
        "aircraft-days. Forecast: Monte Carlo P10/P50/P90 across runs.",
    }


# Logistics: parts requests ---------------------------------------------------------------------
PART_TRANSITIONS = {
    "open": {"reserved", "ordered", "cancelled"},
    "reserved": {"received", "cancelled"},
    "ordered": {"received", "cancelled"},
    "received": set(),
    "cancelled": set(),
}


def part_requests(session: Session, include_closed: bool = False) -> list[dict[str, Any]]:
    bundle = active_bundle(session)
    current = overlay(session)
    positions = decisions.spare_position(bundle, bundle.replay_offset(None), current)
    orders = {row.id: row for row in session.scalars(select(FleetWorkOrder)).all()}
    query = select(FleetPartRequest).order_by(FleetPartRequest.needed_by)
    if not include_closed:
        query = query.where(FleetPartRequest.status.in_(["open", "reserved", "ordered"]))
    rows = []
    for row in session.scalars(query).all():
        work = orders.get(row.work_order_id)
        component_type = bundle.types[bundle.part_index[row.part]]
        lead = bundle.lead_time(bundle.part_index[row.part])
        earliest = bundle.as_of + timedelta(days=lead)
        arrives = row.eta if row.status == "ordered" else None
        at_risk = (row.status == "open" and earliest > row.needed_by) or (
            arrives is not None and arrives > row.needed_by
        )
        rows.append(
            {
                "id": row.id,
                "work_order_id": row.work_order_id,
                "aircraft": work.aircraft if work else "",
                "component_id": work.component_id if work else None,
                "component_name": component_type["name"],
                "part": row.part,
                "description": component_type["name"],
                "quantity": row.quantity,
                "received_quantity": row.received_quantity,
                "needed_by": row.needed_by.isoformat(),
                "status": row.status,
                "eta": row.eta.isoformat() if row.eta else None,
                "note": row.note,
                "available_now": int(positions[row.part]["available"])
                + (row.quantity if row.status == "reserved" else 0),
                "lead_time_days": lead,
                "earliest_order_arrival": earliest.isoformat(),
                "additive_printable": bool(bundle.printable[bundle.part_index[row.part]]),
                "at_risk": bool(at_risk),
                "updated_by": row.updated_by,
                "updated_at": row.updated_at.isoformat(),
                "version": row.version,
            }
        )
    return rows


def lock_fleet_commitments(session: Session) -> None:
    """Serialize fleet stock/resource transitions on PostgreSQL, before row locks."""
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(hashtext('fleet-case-approval'))"))


def update_part_request(
    session: Session,
    request_id: str,
    status: str,
    eta: date | None,
    note: str,
    expected_version: int,
    actor: str,
    received_quantity: int | None = None,
) -> dict[str, Any]:
    lock_fleet_commitments(session)
    bundle = active_bundle(session)
    row = session.get(FleetPartRequest, request_id, with_for_update=True)
    if row is None:
        raise LookupError(request_id)
    if (
        status == "received"
        and received_quantity is not None
        and received_quantity == row.received_quantity
    ):
        return next(
            item for item in part_requests(session, include_closed=True) if item["id"] == request_id
        )
    if (
        row.status == status
        and status != "received"
        and (eta is None or row.eta == eta)
        and (not note or row.note == note)
    ):
        return next(
            item for item in part_requests(session, include_closed=True) if item["id"] == request_id
        )
    if row.version != expected_version:
        if row.status == "received" and row.received_quantity == row.quantity:
            return next(
                item
                for item in part_requests(session, include_closed=True)
                if item["id"] == request_id
            )
        raise FleetConflict("Parts request changed; refresh before updating it.")
    if status != row.status and status not in PART_TRANSITIONS[row.status]:
        raise FleetConflict(f"Cannot move a parts request from '{row.status}' to '{status}'.")
    if status == "ordered":
        if eta is None or eta <= bundle.as_of:
            raise ValueError("An order needs an expected arrival date after the as-of date")
        row.eta = eta
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": row.part})
    if status == "received":
        target_received = row.quantity if received_quantity is None else received_quantity
        if target_received < row.received_quantity or target_received > row.quantity:
            raise ValueError("Receipt is cumulative: between previous receipt and ordered quantity")
        row.received_quantity = target_received
        if target_received < row.quantity:
            status = "ordered"
            if row.eta is None:
                raise ValueError("A partial receipt requires the remaining delivery ETA")
    if status == "reserved":
        available = decisions.spare_position(bundle, bundle.replay_offset(None), overlay(session))[
            row.part
        ]["available"]
        if available < row.quantity:
            raise FleetConflict(f"No unreserved {row.part} on hand; order the part instead.")
    row.status = status
    row.note = note or row.note
    row.updated_by = actor
    row.updated_at = datetime.now(UTC)
    row.version += 1
    session.add(
        AuditEvent(
            actor=actor,
            action=f"fleet.part_request_{status}",
            subject_id=row.id,
            details={"eta": str(eta) if eta else None},
        )
    )
    session.commit()
    return next(
        item for item in part_requests(session, include_closed=True) if item["id"] == request_id
    )


def backfill_part_requests(session: Session) -> int:
    """Give planned work created before parts requests existed its logistics task (idempotent)."""
    covered = set(session.scalars(select(FleetPartRequest.work_order_id)).all())
    missing = session.scalars(
        select(FleetWorkOrder).where(
            FleetWorkOrder.status.in_(
                ["planned", "approved", "in_progress", "awaiting_verification"]
            ),
            FleetWorkOrder.part.is_not(None),
        )
    ).all()
    created = 0
    for work in missing:
        if work.id in covered or work.part is None:
            continue
        reserved_first = bool(work.impact.get("spare_on_hand", 0)) and not work.impact.get(
            "spare_waits", False
        )
        session.add(
            FleetPartRequest(
                id=f"PRQ-{uuid.uuid4().hex[:8].upper()}",
                work_order_id=work.id,
                part=work.part,
                needed_by=work.planned_start,
                status="reserved" if reserved_first else "open",
                updated_by="system",
            )
        )
        created += 1
    session.commit()
    return created


def return_to_service(
    session: Session, work_order_id: str, actor: str, note: str, action: str = "verify"
) -> None:
    """Close an open agency work order: the aircraft is available again and, where the order
    replaced a component, the position carries a new part."""
    lock_fleet_commitments(session)
    if not note.strip():
        raise ValueError("A work outcome / verification note is required")
    bundle = active_bundle(session)
    open_ids = {wo["id"]: wo for wo in bundle.open_work_orders(bundle.days - 1)}
    if work_order_id not in open_ids:
        raise LookupError(work_order_id)
    if session.get(FleetRecordedClosure, work_order_id) is not None:
        return
    wo = open_ids[work_order_id]
    executed = session.scalar(
        select(AuditEvent)
        .where(
            AuditEvent.subject_id == work_order_id, AuditEvent.action == "fleet.recorded_execution"
        )
        .limit(1)
    )
    if action == "execute":
        if wo["phase"] != "in_work":
            raise FleetConflict(
                "Agency work is not in execution; reconcile parts and agency readiness first"
            )
        if executed is None:
            session.add(
                AuditEvent(
                    actor=actor,
                    action="fleet.recorded_execution",
                    subject_id=work_order_id,
                    details={
                        "aircraft": wo["aircraft"],
                        "notes": note.strip(),
                        "source": "Supervisor-reported outcome for recorded agency work",
                    },
                )
            )
            session.commit()
        return
    if action != "verify" or executed is None:
        raise FleetConflict("Record agency execution completed before separate verification")
    from fleet_maintenance.persistence.models import WorkVerification

    session.add(
        WorkVerification(
            kind="recorded",
            work_id=work_order_id,
            work_version=1,
            outcome="passed",
            notes=note.strip(),
            actor=actor,
        )
    )
    session.add(
        FleetRecordedClosure(
            work_order_id=work_order_id, aircraft=wo["aircraft"], note=note, actor=actor
        )
    )
    session.add(
        AuditEvent(
            actor=actor,
            action="fleet.returned_to_service",
            subject_id=work_order_id,
            details={"aircraft": wo["aircraft"]},
        )
    )
    session.commit()


def reschedule_work_order(
    session: Session,
    work_order_id: str,
    planned_start: date,
    agency_id: str,
    expected_version: int,
    actor: str,
) -> dict[str, Any]:
    """Move a planned work order to another day or agency (e.g. dragged on the bay timeline)."""
    bundle = active_bundle(session)
    if agency_id not in bundle.agencies:
        raise ValueError("Unknown agency")
    if planned_start < bundle.as_of or planned_start > bundle.as_of + timedelta(days=60):
        raise ValueError("Planned start must be within 60 days of the fleet as-of date")
    work = session.get(FleetWorkOrder, work_order_id)
    if work is None:
        raise LookupError(work_order_id)
    if work.status != "planned":
        raise FleetConflict("Only planned (not started) work can be moved.")
    # Preview outside any lock: the impact of the plan with this order moved.
    current = overlay(session)
    moved = decisions.Overlay(
        current.advisory_status,
        [w for w in current.planned_work if w["id"] != work_order_id],
        current.part_requests,
        current.closed_recorded,
        current.replaced_components,
    )
    impact = (
        scenario_preview(
            bundle, moved, bundle.slot_index[work.component_id], (planned_start - bundle.as_of).days
        )
        if work.component_id
        else {}
    )
    session.rollback()
    work = session.get(FleetWorkOrder, work_order_id, with_for_update=True)
    if work is None or work.version != expected_version:
        raise FleetConflict("Work order changed; refresh before moving it.")
    previous = (work.planned_start, work.agency_id)
    work.planned_start, work.agency_id = planned_start, agency_id
    work.impact = {**work.impact, **impact}
    work.version += 1
    for request in session.scalars(
        select(FleetPartRequest).where(
            FleetPartRequest.work_order_id == work.id,
            FleetPartRequest.status.in_(["open", "reserved", "ordered"]),
        )
    ):
        request.needed_by = planned_start
        request.version += 1
    session.add(
        AuditEvent(
            actor=actor,
            action="fleet.work_order_rescheduled",
            subject_id=work.id,
            details={
                "from": [str(previous[0]), previous[1]],
                "to": [str(planned_start), agency_id],
            },
        )
    )
    session.commit()
    return work_order_dict(work)


def verify_work_order(
    session: Session, work_order_id: str, expected_version: int, actor: str, notes: str
) -> dict[str, Any]:
    from fleet_maintenance.persistence.models import WorkVerification
    from fleet_maintenance.services.fleet_planning import release

    lock_fleet_commitments(session)
    work = session.get(FleetWorkOrder, work_order_id, with_for_update=True)
    if work is None:
        raise LookupError(work_order_id)
    prior = session.scalar(
        select(WorkVerification).where(
            WorkVerification.kind == "operational",
            WorkVerification.work_id == work.id,
            WorkVerification.work_version == expected_version,
        )
    )
    if prior is not None:
        return work_order_dict(work)
    if not notes.strip():
        raise ValueError("Verification requires a recorded outcome note")
    if work.version != expected_version or work.status != "awaiting_verification":
        raise FleetConflict("Only the current executed work can be verified")
    session.add(
        WorkVerification(
            kind="operational",
            work_id=work.id,
            work_version=work.version,
            outcome="passed",
            notes=notes.strip(),
            actor=actor,
        )
    )
    work.status = "completed"
    work.version += 1
    release(session, work)
    if work.advisory_id:
        session.add(
            FleetAdvisoryDecision(
                advisory_id=work.advisory_id,
                component_id=work.component_id or "",
                status="completed",
                work_order_id=work.id,
                actor=actor,
                reason=notes.strip(),
                snapshot={"work_version": work.version, "verification": "passed"},
            )
        )
    session.add(
        AuditEvent(
            actor=actor,
            action="fleet.work_verified",
            subject_id=work.id,
            details={
                "version": work.version,
                "notes": notes.strip(),
                "availability": (
                    "Derived from remaining work/restrictions; demonstrator availability"
                ),
            },
        )
    )
    session.commit()
    return work_order_dict(work)
