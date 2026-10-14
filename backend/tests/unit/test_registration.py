from datetime import date

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from fleet_maintenance.domain.contracts.registration import (
    AircraftCreate,
    ComponentCreate,
    RecordsImport,
)
from fleet_maintenance.persistence.models import (
    Aircraft,
    AircraftRegistration,
    AircraftSourceRecord,
    AuditEvent,
    Component,
    ComponentInstallation,
)
from fleet_maintenance.services import fleet_health, registration


@pytest.fixture
def session(monkeypatch: pytest.MonkeyPatch):
    engine = create_engine("sqlite://")
    for model in (
        Aircraft,
        Component,
        AircraftRegistration,
        ComponentInstallation,
        AircraftSourceRecord,
        AuditEvent,
    ):
        model.__table__.create(engine)

    def unavailable(_):
        raise fleet_health.EngineNotReady("No synthetic bundle")

    monkeypatch.setattr(fleet_health, "active_bundle", unavailable)
    with Session(engine) as session:
        yield session
    engine.dispose()


def create(session: Session) -> str:
    return registration.create_aircraft(
        session,
        AircraftCreate(
            tail_number="vt-test",
            serial_number="AIR-1",
            aircraft_type="Customer airframe",
            base="Base A",
            fleet_entry_date=date(2026, 10, 1),
        ),
        "tester",
    )["id"]


def test_registration_does_not_invent_health_or_historical_membership(session: Session) -> None:
    identifier = create(session)
    row = registration.detail(session, identifier, date(2026, 10, 2))
    assert row["tail_number"] == "VT-TEST"
    assert row["availability_state"] == "unknown" and row["health_index"] is None
    assert row["flight_hours"] is None and row["components"] == []
    assert registration.list_registered(session, date(2026, 9, 30))["total"] == 0
    with pytest.raises(LookupError):
        registration.detail(session, identifier, date(2026, 9, 30))


def test_duplicate_tail_is_not_inserted_twice(session: Session) -> None:
    create(session)
    with pytest.raises((IntegrityError, registration.RegistrationConflict)):
        create(session)
    session.rollback()
    assert len(session.scalars(select(AircraftRegistration)).all()) == 1


def test_preview_is_read_only_and_committed_import_is_idempotent(session: Session) -> None:
    identifier = create(session)
    body = RecordsImport(
        source="LOG-1",
        records=[
            {"kind": "usage", "effective_date": "2026-10-02", "flight_hours": 100, "cycles": 50}
        ],
    )
    assert registration.import_records(session, identifier, body, "tester")["accepted"] == 1
    assert session.scalars(select(AircraftSourceRecord)).all() == []
    saved = body.model_copy(update={"preview": False})
    registration.import_records(session, identifier, saved, "tester")
    assert registration.import_records(session, identifier, saved, "tester")["duplicates"] == 1
    assert registration.detail(session, identifier, date(2026, 10, 2))["flight_hours"] == 100
    assert registration.detail(session, identifier, date(2026, 10, 1))["flight_hours"] is None


def test_invalid_component_and_decreasing_usage_reject_whole_batch(session: Session) -> None:
    identifier = create(session)
    with pytest.raises(ValueError, match="not installed"):
        registration.import_records(
            session,
            identifier,
            RecordsImport(
                source="LOG",
                preview=False,
                records=[
                    {
                        "kind": "technical_history",
                        "effective_date": "2026-10-02",
                        "title": "Inspection",
                        "component_id": "wrong",
                    }
                ],
            ),
            "tester",
        )
    with pytest.raises(ValueError, match="must not decrease"):
        registration.import_records(
            session,
            identifier,
            RecordsImport(
                source="LOG",
                preview=False,
                records=[
                    {
                        "kind": "usage",
                        "effective_date": "2026-10-02",
                        "flight_hours": 100,
                        "cycles": 50,
                    },
                    {
                        "kind": "usage",
                        "effective_date": "2026-10-03",
                        "flight_hours": 90,
                        "cycles": 55,
                    },
                ],
            ),
            "tester",
        )
    assert session.scalars(select(AircraftSourceRecord)).all() == []


def test_component_position_and_serial_are_unique(session: Session) -> None:
    identifier = create(session)
    body = ComponentCreate(
        serial_number="ENG-1", kind="Engine", position="Engine 1", installed_on=date(2026, 10, 1)
    )
    registration.install_component(session, identifier, body, "tester")
    with pytest.raises((registration.RegistrationConflict, IntegrityError)):
        registration.install_component(
            session, identifier, body.model_copy(update={"serial_number": "ENG-2"}), "tester"
        )
    session.rollback()
    assert len(registration.detail(session, identifier)["components"]) == 1


def test_registration_api_enforces_roles_and_replay(session: Session) -> None:
    from fastapi import Depends, FastAPI
    from fastapi.testclient import TestClient

    from fleet_maintenance.api.dependencies import Actor, current_actor
    from fleet_maintenance.api.routes.registration import router
    from fleet_maintenance.persistence.database import get_session

    app = FastAPI()
    app.include_router(router, dependencies=[Depends(current_actor)])
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[current_actor] = lambda: Actor("viewer", "viewer")
    payload = {
        "tail_number": "VT-PERM",
        "serial_number": "PERM-1",
        "aircraft_type": "Test aircraft",
        "base": "Test",
        "fleet_entry_date": "2026-10-01",
    }
    with TestClient(app) as client:
        assert client.post("/aircraft-registry", json=payload).status_code == 403
        app.dependency_overrides[current_actor] = lambda: Actor("planner", "planner")
        assert (
            client.post(
                "/aircraft-registry", json=payload, headers={"X-Fleet-Replay-Date": "2026-09-30"}
            ).status_code
            == 409
        )
    assert session.scalars(select(AircraftRegistration)).all() == []


def test_register_list_is_searchable_and_does_not_fetch_source_histories(session: Session) -> None:
    identifier = create(session)
    result = registration.list_registered(session, date(2026, 10, 2), q="vt-test", limit=1)
    assert result["total"] == 1 and result["items"][0]["id"] == identifier
    assert result["items"][0]["component_count"] == 0
    assert "records" not in result["items"][0]
    assert registration.list_registered(session, date(2026, 10, 2), offset=1)["items"] == []
