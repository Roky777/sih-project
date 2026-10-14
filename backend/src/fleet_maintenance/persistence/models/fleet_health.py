"""Records for the synthetic fleet-health workspace (docs/plan.md modules 1-9).

Generated histories, predictions and evaluation live in a hash-verified artifact bundle that a
``FleetEngineRun`` registers. PostgreSQL holds the mutable human decisions layered on top:
advisory status changes, planned work orders, saved scenario runs, alert acknowledgements and
ingested readings.
"""

from datetime import UTC, date, datetime

from sqlalchemy import JSON, CheckConstraint, Date, Float, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from fleet_maintenance.persistence.database import Base


def _now() -> datetime:
    return datetime.now(UTC)


class FleetEngineRun(Base):
    __tablename__ = "fleet_engine_runs"
    __table_args__ = (
        CheckConstraint("state IN ('queued', 'succeeded', 'failed')", name="ck_fleet_run_state"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    job_id: Mapped[str | None] = mapped_column(String(64), index=True)
    state: Mapped[str] = mapped_column(String(16), default="queued")
    seed: Mapped[int] = mapped_column(default=42)
    as_of: Mapped[date | None] = mapped_column(Date)
    artifact_directory: Mapped[str | None] = mapped_column(String(255))
    hashes: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    summary: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    requested_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=_now)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)


class FleetAdvisoryDecision(Base):
    """Append-only status history; the latest row per advisory is its current status."""

    __tablename__ = "fleet_advisory_decisions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('proposed', 'accepted', 'scheduled', 'completed', 'dismissed')",
            name="ck_fleet_advisory_status",
        ),
        CheckConstraint(
            "status <> 'dismissed' OR reason IS NOT NULL", name="ck_fleet_dismiss_reason"
        ),
        Index("ix_fleet_advisory_decisions_advisory_created", "advisory_id", "created_at"),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    advisory_id: Mapped[str] = mapped_column(String(96))
    component_id: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16))
    reason: Mapped[str | None] = mapped_column(Text)
    work_order_id: Mapped[str | None] = mapped_column(String(64))
    snapshot: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    actor: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=_now)


class FleetWorkOrder(Base):
    __tablename__ = "fleet_work_orders"
    __table_args__ = (
        CheckConstraint(
            "status IN ('planned', 'approved', 'in_progress', "
            "'awaiting_verification', 'completed', 'cancelled')",
            name="ck_fleet_work_order_status",
        ),
        CheckConstraint("duration_days > 0", name="ck_fleet_work_order_duration"),
        Index("ix_fleet_work_orders_status_agency", "status", "agency_id"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    advisory_id: Mapped[str | None] = mapped_column(String(96), index=True)
    aircraft: Mapped[str] = mapped_column(String(16))
    component_id: Mapped[str | None] = mapped_column(String(64))
    agency_id: Mapped[str] = mapped_column(String(16))
    part: Mapped[str | None] = mapped_column(String(16))
    title: Mapped[str] = mapped_column(String(160))
    planned_start: Mapped[date] = mapped_column(Date)
    duration_days: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(32), default="planned")
    priority: Mapped[str | None] = mapped_column(String(4))
    impact: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=_now)
    version: Mapped[int] = mapped_column(default=1)


class FleetScenarioRun(Base):
    __tablename__ = "fleet_scenario_runs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    engine_run_id: Mapped[str] = mapped_column(String(64), ForeignKey("fleet_engine_runs.id"))
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(32))
    params: Mapped[dict[str, object]] = mapped_column(JSON)
    horizon_days: Mapped[int] = mapped_column()
    runs: Mapped[int] = mapped_column()
    seed: Mapped[int] = mapped_column()
    results: Mapped[dict[str, object]] = mapped_column(JSON)
    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=_now)


class FleetAlertAcknowledgement(Base):
    __tablename__ = "fleet_alert_acknowledgements"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    alert_key: Mapped[str] = mapped_column(String(128), index=True)
    actor: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=_now)


class FleetIngestBatch(Base):
    __tablename__ = "fleet_ingest_batches"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source: Mapped[str] = mapped_column(String(64))
    accepted: Mapped[int] = mapped_column()
    rejected: Mapped[int] = mapped_column()
    errors: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    actor: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=_now)


class FleetIngestedReading(Base):
    __tablename__ = "fleet_ingested_readings"
    __table_args__ = (
        CheckConstraint("quality_flag IN (0, 1, 2, 3)", name="ck_fleet_reading_quality"),
        Index("ix_fleet_ingested_component_date", "component_id", "reading_date"),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    batch_id: Mapped[str] = mapped_column(String(64), ForeignKey("fleet_ingest_batches.id"))
    component_id: Mapped[str] = mapped_column(String(64))
    reading_date: Mapped[date] = mapped_column(Date)
    parameter: Mapped[str] = mapped_column(String(64))
    mean: Mapped[float] = mapped_column(Float)
    maximum: Mapped[float | None] = mapped_column(Float)
    minimum: Mapped[float | None] = mapped_column(Float)
    std: Mapped[float | None] = mapped_column(Float)
    quality_flag: Mapped[int] = mapped_column(default=0)


class FleetPartRequest(Base):
    """Logistics task created for planned work: secure one part by its needed-by date."""

    __tablename__ = "fleet_part_requests"
    __table_args__ = (
        CheckConstraint(
            "status IN ('open', 'reserved', 'ordered', 'received', 'cancelled')",
            name="ck_fleet_part_request_status",
        ),
        CheckConstraint("status <> 'ordered' OR eta IS NOT NULL", name="ck_fleet_part_eta"),
        CheckConstraint("quantity > 0", name="ck_fleet_part_quantity"),
        CheckConstraint(
            "received_quantity >= 0 AND received_quantity <= quantity",
            name="ck_fleet_received_quantity",
        ),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    work_order_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("fleet_work_orders.id"), index=True
    )
    part: Mapped[str] = mapped_column(String(16), index=True)
    quantity: Mapped[int] = mapped_column(default=1)
    received_quantity: Mapped[int] = mapped_column(default=0, server_default="0")
    needed_by: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="open")
    eta: Mapped[date | None] = mapped_column(Date)
    note: Mapped[str] = mapped_column(Text, default="")
    updated_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now)
    version: Mapped[int] = mapped_column(default=1)


class FleetRecordedClosure(Base):
    """A supervisor returned an aircraft to service by closing an agency work order."""

    __tablename__ = "fleet_recorded_closures"
    work_order_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    aircraft: Mapped[str] = mapped_column(String(16))
    note: Mapped[str] = mapped_column(Text, default="")
    actor: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=_now)
