"""Connected cases: dataset identity is authoritative; status is derived from linked records."""

import uuid
from contextlib import suppress
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from fleet_maintenance.persistence.models import (
    Alert,
    Assessment,
    AuditEvent,
    CaseLink,
    CaseReview,
    Component,
    FleetAssessment,
    FleetCapacityBooking,
    FleetPartRequest,
    FleetProposal,
    FleetWorkOrder,
    MaintenanceCase,
    MaintenanceTask,
    WorkRecord,
)
from fleet_maintenance.science.fleet import decisions
from fleet_maintenance.services.approvals import ApprovalConflict


def dataset_for(component: Component) -> str:
    return (
        f"trial:{component.id.removesuffix('-engine')}"
        if component.id.startswith("trial-")
        else "engine-research:FD001"
    )


def case_id(dataset: str, source: str) -> str:
    return f"CASE-{uuid.uuid5(uuid.NAMESPACE_URL, dataset + ':' + source).hex[:24]}"


def link(
    session: Session,
    case: MaintenanceCase,
    kind: str,
    record_id: str,
    version: str | None = None,
    evidence: dict[str, Any] | None = None,
) -> None:
    existing = session.scalar(
        select(CaseLink).where(
            CaseLink.case_id == case.id, CaseLink.kind == kind, CaseLink.record_id == record_id
        )
    )
    if existing is None:
        if (
            kind in {"assessment", "fleet_assessment"}
            and session.scalar(
                select(CaseLink.id)
                .where(CaseLink.case_id == case.id, CaseLink.kind == kind)
                .limit(1)
            )
            is not None
        ):
            case.version += 1
            session.add(
                AuditEvent(
                    actor="assessment-worker",
                    action="case.evidence_changed",
                    subject_id=case.id,
                    details={"kind": kind, "record": record_id, "version": version},
                )
            )
        session.add(
            CaseLink(
                case_id=case.id,
                kind=kind,
                record_id=record_id,
                record_version=version,
                evidence=evidence or {},
            )
        )
        session.flush()


def ensure_case(
    session: Session,
    dataset: str,
    source: str,
    aircraft: str,
    component: str | None,
    title: str,
    actor: str,
    deadline: date | None = None,
) -> MaintenanceCase:
    identifier = case_id(dataset, source)
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": identifier})
    case = session.get(MaintenanceCase, identifier)
    if case is None:
        case = MaintenanceCase(
            id=identifier,
            dataset=dataset,
            source_key=source,
            aircraft_id=aircraft,
            component_id=component,
            title=title,
            owner_team="Maintenance engineer",
            deadline=deadline,
        )
        session.add(case)
        session.flush()
        session.add(
            AuditEvent(
                actor=actor,
                action="case.created",
                subject_id=case.id,
                details={"dataset": dataset, "source": source},
            )
        )
    return case


def fleet_cases(session: Session) -> None:
    from fleet_maintenance.services import fleet_health as fleet

    bundle, _, findings = fleet.advisories(session, None)
    dataset = f"operational:{fleet.run_id_of(bundle)}"
    for finding in findings:
        within = finding["action"].get("within_days")
        deadline = (
            bundle.as_of + timedelta(days=int(within))
            if within is not None and int(within) > 0
            else None
        )
        case = ensure_case(
            session,
            dataset,
            str(finding["id"]),
            str(finding["aircraft"]),
            str(finding["component_id"]),
            str(finding["component_name"]),
            "system",
            deadline,
        )
        link(
            session,
            case,
            "finding",
            str(finding["id"]),
            fleet.run_id_of(bundle),
            {
                "as_of": finding["as_of"],
                "risk_14d": finding["risk_14d"],
                "rul_days": finding["rul_days"],
                "priority": finding["priority"],
                "deadline_basis": ("Synthetic action window; mandatory tasks remain separate"),
            },
        )
        for work in session.scalars(
            select(FleetWorkOrder).where(FleetWorkOrder.advisory_id == finding["id"])
        ):
            link(session, case, "fleet_work", work.id, str(work.version))
            for request in session.scalars(
                select(FleetPartRequest).where(FleetPartRequest.work_order_id == work.id)
            ):
                link(session, case, "fleet_request", request.id, str(request.version))
    for task in decisions.scheduled_tasks(bundle):
        if task["due_in_days"] > 45:
            continue
        mandatory = ensure_case(
            session,
            dataset,
            task["id"],
            task["aircraft"],
            task["component_id"],
            task["task"],
            "system",
            date.fromisoformat(task["due_date"]),
        )
        link(session, mandatory, "mandatory_task", task["id"], fleet.run_id_of(bundle), dict(task))
    session.flush()


def assessment_case(session: Session, assessment: Assessment) -> MaintenanceCase:
    component = session.get(Component, assessment.component_id)
    if component is None:
        raise LookupError(assessment.component_id)
    alert = session.scalar(select(Alert).where(Alert.assessment_id == assessment.id))
    source = alert.episode_id if alert and alert.episode_id else f"evidence:{component.id}"
    case = ensure_case(
        session,
        dataset_for(component),
        source,
        component.aircraft_id,
        component.id,
        f"Engine evidence · {component.serial_number}",
        "system",
    )
    link(
        session,
        case,
        "assessment",
        assessment.id,
        assessment.input_version,
        {
            "model_id": assessment.model_version,
            "cutoff_cycles": assessment.cutoff_cycle,
            "state": assessment.state,
            "input_id": assessment.input_version,
        },
    )
    if alert:
        link(session, case, "research_alert", alert.id, alert.policy_version)
    for task in session.scalars(
        select(MaintenanceTask).where(MaintenanceTask.component_id == component.id)
    ):
        link(session, case, "task", task.id, str(task.version))
        for work in session.scalars(select(WorkRecord).where(WorkRecord.task_id == task.id)):
            link(session, case, "research_work", work.id, str(work.version))
            link(session, case, "research_plan", work.plan_id)
    return case


def backfill(session: Session) -> None:
    from fleet_maintenance.services.fleet_health import EngineNotReady

    with suppress(EngineNotReady):
        fleet_cases(session)
    for assessment in session.scalars(select(Assessment).order_by(Assessment.created_at)):
        assessment_case(session, assessment)
    session.commit()


def records(session: Session, identifier: str) -> tuple[MaintenanceCase, list[CaseLink]]:
    case = session.get(MaintenanceCase, identifier)
    if case is None:
        raise LookupError(identifier)
    return case, list(
        session.scalars(
            select(CaseLink).where(CaseLink.case_id == identifier).order_by(CaseLink.id)
        )
    )


def serialize(session: Session, case: MaintenanceCase) -> dict[str, Any]:
    _, links = records(session, case.id)
    review = session.scalar(
        select(CaseReview)
        .where(CaseReview.case_id == case.id)
        .order_by(CaseReview.id.desc())
        .limit(1)
    )
    operational = case.dataset.startswith("operational:")
    work_kind, work_class = (
        ("fleet_work", FleetWorkOrder) if operational else ("research_work", WorkRecord)
    )
    works: list[Any] = [
        work
        for item in links
        if item.kind == work_kind
        if (work := session.get(work_class, item.record_id)) is not None
    ]
    requests = [
        request
        for item in links
        if item.kind == "fleet_request"
        if (request := session.get(FleetPartRequest, item.record_id)) is not None
    ]
    assessments = [
        assessment
        for item in links
        if item.kind == "assessment"
        if (assessment := session.get(Assessment, item.record_id)) is not None
    ]
    proposals = (
        list(
            session.scalars(
                select(FleetProposal)
                .where(FleetProposal.case_id == case.id)
                .order_by(FleetProposal.created_at.desc())
            )
        )
        if operational
        else []
    )
    states = {work.status for work in works}
    blocker: str | None = None
    action, target, role = (
        "Review evidence",
        (f"/health/{case.component_id}" if operational else f"/components/{case.component_id}"),
        "Maintenance engineer",
    )
    state = "awaiting_review"
    if assessments and assessments[-1].state != "available":
        state, blocker, action = (
            "evidence_unavailable",
            "Eligible evidence is unavailable",
            "Inspect data-quality issue",
        )
    if any(item.kind == "mandatory_task" for item in links) and not works:
        state, action, role, target = (
            "needs_planning",
            "Prepare mandatory maintenance plan",
            "Maintenance supervisor",
            f"/maintenance?case={case.id}",
        )
    if review:
        state = {
            "maintenance_required": "needs_planning",
            "monitor": "monitoring",
            "dismiss": "closed",
            "investigate": "investigating",
        }[review.decision]
        action = {
            "maintenance_required": "Prepare maintenance plan",
            "monitor": "View follow-up and evidence",
            "dismiss": "View outcome and history",
            "investigate": "Inspect data-quality issue",
        }[review.decision]
        if review.decision == "maintenance_required":
            target, role = (
                (
                    f"/maintenance?case={case.id}"
                    if operational
                    else f"/planning?case={case.id}&component={case.component_id}"
                ),
                "Maintenance supervisor",
            )
    if "awaiting_verification" in states:
        state, action, role = (
            "awaiting_verification",
            "Record verification",
            "Maintenance supervisor",
        )
    elif "in_progress" in states:
        state, action, role = (
            "in_progress",
            "Record progress / Complete work",
            "Maintenance supervisor",
        )
    elif works and states <= {"completed", "cancelled"}:
        state, action = (
            ("closed", "View outcome and history")
            if "completed" in states
            else ("cancelled", "View outcome and history")
        )
    elif works:
        missing = next(
            (request for request in requests if request.status not in {"reserved", "received"}),
            None,
        )
        if missing:
            state, blocker, action, role = (
                "blocked",
                f"{missing.part}: required stock is not secured",
                "Open linked parts request",
                "Logistics team",
            )
            target = f"/spares?view=requests&request={missing.id}&case={case.id}"
            if missing.eta and case.deadline and missing.eta > case.deadline:
                blocker, action = (
                    "Delivery is later than the case deadline",
                    "Resolve delivery conflict",
                )
        elif states & {"approved"}:
            state, action, role = "ready", "Start work", "Maintenance supervisor"
        else:
            state, action, role = "tentative", "Review proposal", "Maintenance supervisor"
    if not review and operational:
        from fleet_maintenance.persistence.models import FleetAdvisoryDecision

        prior = session.scalar(
            select(FleetAdvisoryDecision)
            .where(FleetAdvisoryDecision.advisory_id == case.source_key)
            .order_by(FleetAdvisoryDecision.id.desc())
            .limit(1)
        )
        if prior is not None and prior.status == "accepted" and not works:
            state, action, role = (
                "needs_planning",
                "Prepare maintenance plan",
                "Maintenance supervisor",
            )
            target = f"/maintenance?case={case.id}"
        elif prior is not None and prior.status == "dismissed" and not works:
            state, action = "closed", "View outcome and history"
    if operational and proposals and proposals[0].status in {"proposed", "blocked"}:
        from fleet_maintenance.services.fleet_health import EngineNotReady
        from fleet_maintenance.services.fleet_planning import fingerprint

        with suppress(EngineNotReady):
            if fingerprint(session, case) != proposals[0].input_version:
                state, blocker, action, role = (
                    "stale",
                    "Planning inputs changed",
                    "Recalculate proposal",
                    "Maintenance supervisor",
                )
            elif proposals[0].status == "proposed":
                state, action, role = "proposal_review", "Review proposal", "Maintenance supervisor"
            elif not blocker:
                state, blocker, action, role = (
                    "blocked",
                    "; ".join(proposals[0].diagnostics),
                    "Resolve readiness blocker",
                    "Maintenance supervisor",
                )
    if review and not states & {"in_progress", "awaiting_verification", "completed"}:
        reviewed = {(ref.get("kind"), ref.get("id")) for ref in review.evidence_refs}
        if any(
            item.kind in {"assessment", "fleet_assessment"}
            and (item.kind, item.record_id) not in reviewed
            for item in links
        ):
            state, blocker, action, role = (
                "awaiting_review",
                "New evidence has not been reviewed",
                "Review updated evidence",
                "Maintenance engineer",
            )
            target = f"/cases/{case.id}"
    if operational and state == "ready":
        for work in works:
            if work.status != "approved":
                continue
            bookings = list(
                session.scalars(
                    select(FleetCapacityBooking).where(FleetCapacityBooking.work_id == work.id)
                )
            )
            if {b.kind for b in bookings} != {"crew", "bay"}:
                state, blocker, action = (
                    "blocked",
                    "Approved crew and bay commitments missing",
                    "Resolve readiness blocker",
                )
                break
    fleet_assessments = [
        a
        for item in links
        if item.kind == "fleet_assessment"
        if (a := session.get(FleetAssessment, item.record_id)) is not None
    ]
    if (
        fleet_assessments
        and fleet_assessments[-1].state != "available"
        and not states & {"in_progress", "awaiting_verification"}
    ):
        state, blocker, action, role = (
            "evidence_unavailable",
            str(fleet_assessments[-1].result.get("reason", "Evidence is unavailable")),
            "Inspect data-quality issue",
            "Maintenance engineer",
        )

    if state in {
        "in_progress",
        "awaiting_verification",
        "ready",
        "tentative",
        "proposal_review",
        "stale",
    }:
        target = (
            f"/maintenance?case={case.id}"
            if operational
            else f"/planning?case={case.id}&component={case.component_id}"
        )
    versions = [
        str(item.record_version)
        for item in links
        if item.kind in {"assessment", "finding", "fleet_assessment"}
    ]
    subjects = [case.id, *(item.record_id for item in links)]
    audit = list(
        session.scalars(
            select(AuditEvent)
            .where(AuditEvent.subject_id.in_(subjects))
            .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
            .limit(100)
        )
    )
    return {
        "id": case.id,
        "dataset": case.dataset,
        "aircraft_id": case.aircraft_id,
        "component_id": case.component_id,
        "title": case.title,
        "state": state,
        "owner": case.owner_id,
        "owner_team": role,
        "deadline": case.deadline,
        "blocker": blocker,
        "version": case.version,
        "created_at": case.created_at,
        "next_action": {"label": action, "to": target, "role": role},
        "evidence_versions": versions,
        "links": [
            {
                "kind": item.kind,
                "id": item.record_id,
                "version": item.record_version,
                "evidence": item.evidence,
            }
            for item in links
        ],
        "review": None
        if review is None
        else {
            "decision": review.decision,
            "reason": review.reason,
            "follow_up": review.follow_up,
            "actor": review.actor,
            "at": review.created_at,
        },
        "work": [{"id": work.id, "status": work.status, "version": work.version} for work in works],
        "proposals": [
            {
                "id": p.id,
                "status": p.status,
                "solver_status": p.solver_status,
                "input_version": p.input_version,
                "assignments": p.assignments,
                "diagnostics": p.diagnostics,
                "objective": p.objective,
                "best_bound": p.best_bound,
            }
            for p in proposals
        ],
        "audit": [
            {
                "actor": event.actor,
                "event": event.action,
                "at": event.created_at,
                "record": event.subject_id,
                "references": event.details,
            }
            for event in audit
        ],
    }


def review_case(
    session: Session,
    identifier: str,
    decision: str,
    reason: str,
    follow_up: date | None,
    expected_version: int,
    actor: str,
) -> dict[str, Any]:
    case = session.get(MaintenanceCase, identifier, with_for_update=True)
    if case is None:
        raise LookupError(identifier)
    prior = session.scalar(
        select(CaseReview).where(
            CaseReview.case_id == case.id, CaseReview.case_version == expected_version
        )
    )
    if (
        prior
        and prior.decision == decision
        and prior.reason == reason.strip()
        and prior.follow_up == follow_up
    ):
        return serialize(session, case)
    if case.version != expected_version:
        raise ApprovalConflict("Case changed; refresh before recording the decision")
    if decision not in {"maintenance_required", "monitor", "dismiss", "investigate"}:
        raise ValueError("Unsupported engineering decision")
    if decision != "maintenance_required" and not reason.strip():
        raise ValueError("This decision requires a reason")
    if decision == "monitor" and follow_up is None:
        raise ValueError("Monitoring requires a follow-up date")
    if follow_up is not None:
        from fleet_maintenance.services.fleet_health import active_bundle

        current = (
            active_bundle(session).as_of
            if case.dataset.startswith("operational:")
            else date.today()
        )
        if follow_up <= current:
            raise ValueError("Follow-up must be after the current dataset date")
    _, links = records(session, case.id)
    if any(item.kind == "mandatory_task" for item in links):
        raise ApprovalConflict(
            "Mandatory tasks are not predictive findings and cannot be dismissed or monitored"
        )
    if case.dataset.startswith("operational:"):
        from fleet_maintenance.services import fleet_health as fleet

        if case.dataset != f"operational:{fleet.run_id_of(fleet.active_bundle(session))}":
            raise ApprovalConflict(
                "This case belongs to historical inputs; review the current case"
            )
        status = (
            "accepted"
            if decision == "maintenance_required"
            else "dismissed"
            if decision == "dismiss"
            else "proposed"
        )
        for item in links:
            if item.kind == "finding":
                fleet.update_advisory(
                    session, item.record_id, status, reason or None, None, actor, commit=False
                )
    session.add(
        CaseReview(
            case_id=case.id,
            case_version=case.version,
            decision=decision,
            reason=reason.strip(),
            follow_up=follow_up,
            actor=actor,
            evidence_refs=[
                {"kind": item.kind, "id": item.record_id, "version": item.record_version}
                for item in links
                if item.kind in {"assessment", "finding", "fleet_assessment"}
            ],
        )
    )
    case.version += 1
    case.owner_team = (
        "Maintenance supervisor" if decision == "maintenance_required" else "Maintenance engineer"
    )
    session.add(
        AuditEvent(
            actor=actor,
            action="case.reviewed",
            subject_id=case.id,
            details={
                "decision": decision,
                "reason": reason.strip(),
                "version": case.version,
                "follow_up": follow_up.isoformat() if follow_up else None,
            },
        )
    )
    session.commit()
    return serialize(session, case)
