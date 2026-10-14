"""Operational proposals retain exact inputs and exclusive commitments on PostgreSQL."""

import os
import threading
import uuid
from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from fleet_maintenance.domain.contracts.planning import PlanningInput, ResourceInput, TaskInput
from fleet_maintenance.persistence.models import (
    FleetCapacity,
    FleetCapacityBooking,
    FleetPartRequest,
    FleetProposal,
    FleetWorkOrder,
    MaintenanceCase,
)
from fleet_maintenance.services import cases, fleet_health, fleet_planning
from fleet_maintenance.services.approvals import ApprovalConflict


@pytest.mark.integration
def test_operational_competing_approvals_commit_stock_and_resources_once(monkeypatch):
    url = os.environ.get("FLEET_DATABASE_URL", "")
    if not url.startswith("postgresql"):
        pytest.skip("Requires an isolated PostgreSQL database")
    engine = create_engine(url)
    prefix = uuid.uuid4().hex[:8]
    agency = f"AG-{prefix}"
    part = f"KIT-{prefix}"
    bundle = SimpleNamespace(
        as_of=date(2026, 9, 30),
        manifest={"run_id": f"approval-test-{prefix}"},
        replay_offset=lambda _: 0,
    )
    monkeypatch.setattr(fleet_health, "active_bundle", lambda _: bundle)
    monkeypatch.setattr(cases, "serialize", lambda session, case: {"id": case.id})
    monkeypatch.setattr(
        fleet_planning.decisions,
        "spare_position",
        lambda bundle, offset, overlay: {
            part: {
                "available": 1
                - sum(
                    r["quantity"]
                    for r in overlay.part_requests
                    if r["status"] == "reserved" and r["part"] == part
                )
            }
        },
    )

    def source(session, case):
        work = session.get(FleetWorkOrder, f"work-{prefix}-{case.source_key}")
        return PlanningInput(
            7,
            (
                TaskInput(
                    work.id,
                    1,
                    0,
                    7,
                    "engine",
                    part_id=part,
                    part_quantity=1,
                    aircraft_id=work.aircraft,
                ),
            ),
            {"engine": 1},
            {part: 1},
            resources=tuple(
                ResourceInput(f"{agency}:{kind}:0", kind, ("engine",), ((0, 7),), valid_until=7)
                for kind in ("crew", "bay")
            ),
        )

    monkeypatch.setattr(fleet_planning, "source_for", source)
    with Session(engine) as session:
        session.add(
            FleetCapacity(
                id=agency,
                capabilities=["engine"],
                crew_capacity=1,
                bay_capacity=1,
                provenance="Isolated race fixture",
            )
        )
        for number in (1, 2):
            case = MaintenanceCase(
                id=f"case-{prefix}-{number}",
                dataset=f"operational:approval-test-{prefix}",
                source_key=str(number),
                aircraft_id=f"AC-{number}",
                title="Test maintenance",
            )
            work = FleetWorkOrder(
                id=f"work-{prefix}-{number}",
                aircraft=f"AC-{number}",
                agency_id=agency,
                part=part,
                title="Test work",
                planned_start=bundle.as_of,
                duration_days=1,
                status="planned",
                created_by="test",
            )
            session.add_all([case, work])
            session.flush()
            session.add(
                FleetPartRequest(
                    id=f"request-{prefix}-{number}",
                    work_order_id=work.id,
                    part=part,
                    quantity=1,
                    needed_by=bundle.as_of,
                    updated_by="test",
                )
            )
        session.commit()
        for number in (1, 2):
            case = session.get(MaintenanceCase, f"case-{prefix}-{number}")
            session.add(
                FleetProposal(
                    id=f"proposal-{prefix}-{number}",
                    case_id=case.id,
                    input_version=fleet_planning.fingerprint(session, case),
                    input_snapshot={},
                    assignments=[
                        {
                            "task_id": f"work-{prefix}-{number}",
                            "start": 0,
                            "end": 1,
                            "crew_id": f"{agency}:crew:0",
                            "bay_id": f"{agency}:bay:0",
                        }
                    ],
                    diagnostics=[],
                    solver_status="feasible",
                    status="proposed",
                    actor="test",
                )
            )
        session.commit()
    barrier = threading.Barrier(2)
    outcomes = []

    def approve(number):
        with Session(engine) as session:
            proposal = session.get(FleetProposal, f"proposal-{prefix}-{number}")
            version = proposal.input_version
            session.rollback()
            barrier.wait(timeout=10)
            try:
                fleet_planning.approve(session, proposal.id, version, "test-supervisor")
                outcomes.append((number, "approved"))
            except ApprovalConflict:
                session.rollback()
                outcomes.append((number, "conflict"))

    threads = [threading.Thread(target=approve, args=(number,)) for number in (1, 2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)
    assert all(not thread.is_alive() for thread in threads)
    assert sorted(state for _, state in outcomes) == ["approved", "conflict"]
    winner = next(number for number, state in outcomes if state == "approved")
    with Session(engine) as session:
        proposal = session.get(FleetProposal, f"proposal-{prefix}-{winner}")
        fleet_planning.approve(session, proposal.id, proposal.input_version, "test-supervisor")
        assert (
            len(
                list(
                    session.scalars(
                        select(FleetCapacityBooking).where(FleetCapacityBooking.agency_id == agency)
                    )
                )
            )
            == 2
        )
        requests = list(
            session.scalars(
                select(FleetPartRequest).where(FleetPartRequest.id.startswith(f"request-{prefix}"))
            )
        )
        assert sum(request.quantity for request in requests if request.status == "reserved") == 1
    engine.dispose()
