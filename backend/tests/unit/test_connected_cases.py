from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from fleet_maintenance.persistence.database import Base
from fleet_maintenance.persistence.models import (
    Aircraft,
    CaseReview,
    Component,
    MaintenanceCase,
    MaintenanceTask,
    Part,
    Plan,
    Reservation,
    WorkRecord,
    WorkVerification,
)
from fleet_maintenance.services.approvals import ApprovalConflict
from fleet_maintenance.services.cases import ensure_case, link, review_case, serialize
from fleet_maintenance.services.reservations import update_work


@pytest.fixture
def session():  # type: ignore[no-untyped-def]
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        session.add(Aircraft(id="a1", tail_number="research-1", label="Research record"))
        session.add(
            Component(id="engine-1", aircraft_id="a1", serial_number="engine-serial", kind="engine")
        )
        session.commit()
        yield session
    engine.dispose()


def test_unchanged_source_keeps_one_case_and_trial_isolation(session):  # type: ignore[no-untyped-def]
    first = ensure_case(
        session,
        "engine-research:FD001",
        "finding-1",
        "a1",
        "engine-1",
        "Engine concern",
        "engineer",
    )
    again = ensure_case(
        session,
        "engine-research:FD001",
        "finding-1",
        "a1",
        "engine-1",
        "Engine concern",
        "engineer",
    )
    trial = ensure_case(
        session, "trial:isolated", "finding-1", "a1", "engine-1", "Trial concern", "engineer"
    )
    session.commit()
    assert again.id == first.id
    assert trial.id != first.id
    assert len(list(session.scalars(select(MaintenanceCase)))) == 2


def test_monitor_requires_reason_followup_and_retries_do_not_duplicate_decisions(session):  # type: ignore[no-untyped-def]
    case = ensure_case(
        session,
        "engine-research:FD001",
        "finding-2",
        "a1",
        "engine-1",
        "Engine concern",
        "engineer",
    )
    link(session, case, "assessment", "immutable-assessment", "input-v1")
    session.commit()
    with pytest.raises(ValueError, match="reason"):
        review_case(
            session, case.id, "monitor", "", date.today() + timedelta(days=2), 1, "engineer"
        )
    with pytest.raises(ValueError, match="follow-up"):
        review_case(session, case.id, "monitor", "Inspect next trend", None, 1, "engineer")
    outcome = review_case(
        session,
        case.id,
        "monitor",
        "Inspect next trend",
        date.today() + timedelta(days=2),
        1,
        "engineer",
    )
    assert outcome["state"] == "monitoring"
    again = review_case(
        session,
        case.id,
        "monitor",
        "Inspect next trend",
        date.today() + timedelta(days=2),
        1,
        "engineer",
    )
    assert again["version"] == 2
    assert len(list(session.scalars(select(CaseReview)))) == 1
    assert session.scalar(select(CaseReview)).evidence_refs[0]["version"] == "input-v1"
    with pytest.raises(ApprovalConflict):
        review_case(session, case.id, "dismiss", "Changed decision", None, 1, "engineer")


def test_execution_consumes_once_and_verification_is_separate(session):  # type: ignore[no-untyped-def]
    case = ensure_case(
        session,
        "engine-research:FD001",
        "finding-3",
        "a1",
        "engine-1",
        "Engine concern",
        "engineer",
    )
    session.add(
        MaintenanceTask(
            id="task-1",
            component_id="engine-1",
            title="Inspect",
            duration_slots=1,
            deadline_slot=5,
            required_skill="engine",
            required_part_id="kit",
            required_part_quantity=1,
            status="approved",
        )
    )
    session.add(Part(id="kit", name="Test kit", on_hand=0, lead_time_slots=0))
    session.add(
        Plan(id="plan-1", status="approved", solver_status="feasible", input_version="inputs-v1")
    )
    session.add(Reservation(plan_id="plan-1", part_id="kit", quantity=1))
    session.add(WorkRecord(id="work-1", plan_id="plan-1", task_id="task-1"))
    session.flush()
    link(session, case, "research_work", "work-1", "1")
    session.commit()
    started = update_work(session, "work-1", "start", 1, "supervisor", "Started test work")
    executed = update_work(
        session, "work-1", "complete", started.version, "supervisor", "Inspection performed"
    )
    assert executed.status == "awaiting_verification"
    assert executed.consumed_quantity == 1
    assert serialize(session, case)["state"] == "awaiting_verification"
    assert not list(session.scalars(select(WorkVerification)))
    repeated = update_work(session, "work-1", "complete", 2, "supervisor", "Inspection performed")
    assert repeated.version == executed.version
    assert repeated.consumed_quantity == 1
    verified = update_work(
        session, "work-1", "verify", executed.version, "supervisor", "Outcome checked"
    )
    assert verified.status == "completed"
    assert verified.consumed_quantity == 1
    assert len(list(session.scalars(select(WorkVerification)))) == 1
    assert serialize(session, case)["state"] == "closed"


def test_new_evidence_preserves_review_and_requires_a_new_decision(session):  # type: ignore[no-untyped-def]
    case = ensure_case(
        session, "engine-research:FD001", "evidence-1", "a1", "engine-1", "Evidence", "engineer"
    )
    link(session, case, "assessment", "assessment-v1", "input-v1")
    session.commit()
    review_case(
        session, case.id, "maintenance_required", "Inspection justified", None, 1, "engineer"
    )
    link(session, case, "assessment", "assessment-v2", "input-v2")
    session.commit()
    assert case.version == 3
    assert serialize(session, case)["state"] == "awaiting_review"
    assert len(list(session.scalars(select(CaseReview)))) == 1
    with pytest.raises(ApprovalConflict, match="Case changed"):
        review_case(session, case.id, "dismiss", "Old screen", None, 2, "engineer")


def test_recorded_agency_execution_never_closes_work_before_verification(session, monkeypatch):  # type: ignore[no-untyped-def]
    from types import SimpleNamespace

    from fleet_maintenance.persistence.models import FleetRecordedClosure
    from fleet_maintenance.services import fleet_health

    bundle = SimpleNamespace(
        days=10,
        open_work_orders=lambda day: [
            {"id": "recorded-test", "aircraft": "a1", "phase": "in_work"}
        ],
    )
    monkeypatch.setattr(fleet_health, "active_bundle", lambda _: bundle)
    with pytest.raises(fleet_health.FleetConflict, match="execution completed"):
        fleet_health.return_to_service(session, "recorded-test", "supervisor", "Checked")
    fleet_health.return_to_service(
        session, "recorded-test", "supervisor", "Repair performed", "execute"
    )
    assert session.get(FleetRecordedClosure, "recorded-test") is None
    assert not list(session.scalars(select(WorkVerification)))
    fleet_health.return_to_service(
        session, "recorded-test", "supervisor", "Repair verified", "verify"
    )
    fleet_health.return_to_service(session, "recorded-test", "supervisor", "Retry", "verify")
    assert session.get(FleetRecordedClosure, "recorded-test") is not None
    assert len(list(session.scalars(select(WorkVerification)))) == 1
