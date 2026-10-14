from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from fleet_maintenance.api.dependencies import Actor
from fleet_maintenance.api.routes import telemetry as routes
from fleet_maintenance.domain.contracts.health import HistoryImport
from fleet_maintenance.persistence.database import Base
from fleet_maintenance.persistence.models import ImportRecord, Job, ModelRegistration
from fleet_maintenance.services import telemetry


@pytest.fixture
def session(monkeypatch):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    history = HistoryImport.model_validate(
        {
            "source_version": "fixture",
            "engine_identity": "NASA_CMAPSS:FD001:train:1",
            "rows": [{"cycle": i, "values": [float(i)] * 24} for i in range(1, 181)],
        }
    )
    sample = SimpleNamespace(
        available=True,
        history=history,
        model_id="test-model",
        source_sha256="a" * 64,
        reason="fixture",
    )
    monkeypatch.setattr(telemetry, "catalog", lambda _: sample)
    with Session(engine, expire_on_commit=False) as session:
        session.add(
            ModelRegistration(
                id="test-model", artifact_directory="fixture", hashes={}, manifest={}, actor="test"
            )
        )
        session.commit()
        yield session
    engine.dispose()


def frame(cycle, **changes):
    return {
        "cycle": cycle,
        "values": [1.0] * 24,
        "observed_at": datetime.now(UTC).isoformat(),
        **changes,
    }


def test_order_timestamp_and_invalid_values_never_reach_history(session):
    row = telemetry.get_stream(session, telemetry.create(session, "engineer")["id"])
    telemetry.receive(session, row, [frame(1)], "engineer")
    bad = [
        frame(1),
        frame(3),
        frame(2, values=[float("nan")] * 24),
        frame(2, observed_at=(datetime.now(UTC) + timedelta(minutes=2)).isoformat()),
        frame(2, observed_at="2026-01-01T00:00:00"),
    ]
    result = telemetry.receive(session, row, bad, "engineer")
    assert result["accepted_cycles"] == 1 and result["rejection_count"] == 5
    assert session.scalars(select(ImportRecord)).all() == []
    assert session.scalars(select(Job)).all() == []


def test_snapshot_job_uses_only_accepted_rows_and_correction_ancestry(session):
    row = telemetry.get_stream(session, telemetry.create(session, "engineer")["id"])
    for _ in range(3):
        telemetry.replay(session, row, 10, False, "engineer")
    first = session.get(ImportRecord, row.import_id)
    assert len(first.rows) == 30 and first.previous_id is None
    assert session.scalars(select(Job)).one().input_payload["import_id"] == first.id
    telemetry.replay(session, row, 5, False, "engineer")
    assert len(session.scalars(select(ImportRecord)).all()) == 1
    telemetry.replay(session, row, 10, False, "engineer")
    telemetry.replay(session, row, 10, False, "engineer")
    telemetry.replay(session, row, 5, False, "engineer")
    second = session.get(ImportRecord, row.import_id)
    assert len(second.rows) == 60 and second.previous_id == first.id
    assert len(first.rows) == 30


def test_pause_stale_and_completed_do_not_imply_health(session):
    row = telemetry.get_stream(session, telemetry.create(session, "engineer")["id"])
    assert telemetry.detail(session, row)["assessment"] is None
    telemetry.replay(session, row, 5, False, "engineer")
    row.last_received_at = datetime.now(UTC) - timedelta(seconds=16)
    assert telemetry.detail(session, row)["freshness"] == "stale"
    row.status = "paused"
    with pytest.raises(ValueError, match="Resume"):
        telemetry.replay(session, row, 5, False, "engineer")
    with pytest.raises(Exception) as exc:
        routes.writer(SimpleNamespace(headers={}, query_params={}), Actor("viewer", "viewer"))
    assert exc.value.status_code == 403
    with pytest.raises(Exception) as exc:
        routes.writer(
            SimpleNamespace(headers={"X-Fleet-Replay-Date": "2026-09-01"}, query_params={}),
            Actor("e", "engineer"),
        )
    assert exc.value.status_code == 409


def test_completed_replay_is_closed_and_obsolete_transport_is_stale(session):
    row = telemetry.get_stream(session, telemetry.create(session, "engineer")["id"])
    telemetry.receive(session, row, [frame(1, observed_at="2026-01-01T00:00:00Z")], "engineer")
    assert telemetry.detail(session, row)["freshness"] == "stale"
    for _ in range(18):
        telemetry.replay(session, row, 10, False, "engineer")
    assert row.status == "completed" and len(row.rows) == 180
    with pytest.raises(ValueError):
        telemetry.receive(session, row, [frame(181)], "engineer")
    assert telemetry.detail(session, row)["assessment"] is None


def test_simulator_is_not_exposed_as_production_device_adapter(monkeypatch):
    from fleet_maintenance.api.routes import demo

    monkeypatch.setattr(
        demo,
        "get_settings",
        lambda: SimpleNamespace(environment="production", authentication_mode="session"),
    )
    with pytest.raises(Exception) as exc:
        routes.local_demo()
    assert exc.value.status_code == 403
