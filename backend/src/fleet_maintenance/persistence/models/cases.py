"""Dataset-isolated maintenance cases linking authoritative records without copying them."""

from datetime import UTC, date, datetime

from sqlalchemy import JSON, CheckConstraint, Date, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from fleet_maintenance.persistence.database import Base


def now() -> datetime:
    return datetime.now(UTC)


class MaintenanceCase(Base):
    __tablename__ = "maintenance_cases"
    __table_args__ = (UniqueConstraint("dataset", "source_key", name="uq_case_dataset_source"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset: Mapped[str] = mapped_column(String(128), index=True)
    source_key: Mapped[str] = mapped_column(String(160))
    aircraft_id: Mapped[str] = mapped_column(String(64), index=True)
    component_id: Mapped[str | None] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(240))
    owner_team: Mapped[str | None] = mapped_column(String(64))
    owner_id: Mapped[str | None] = mapped_column(String(64))
    deadline: Mapped[date | None] = mapped_column(Date)
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(default=now)


class CaseLink(Base):
    __tablename__ = "maintenance_case_links"
    __table_args__ = (UniqueConstraint("case_id", "kind", "record_id", name="uq_case_link"),)
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("maintenance_cases.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    record_id: Mapped[str] = mapped_column(String(128))
    record_version: Mapped[str | None] = mapped_column(String(128))
    evidence: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=now)


class CaseReview(Base):
    __tablename__ = "maintenance_case_reviews"
    __table_args__ = (
        CheckConstraint(
            "decision IN ('maintenance_required','monitor','dismiss','investigate')",
            name="ck_case_decision",
        ),
        CheckConstraint(
            "decision = 'maintenance_required' OR length(reason) > 0", name="ck_case_review_reason"
        ),
        CheckConstraint(
            "decision <> 'monitor' OR follow_up IS NOT NULL", name="ck_case_monitor_followup"
        ),
        UniqueConstraint("case_id", "case_version", name="uq_case_review_version"),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("maintenance_cases.id"), index=True)
    case_version: Mapped[int] = mapped_column()
    decision: Mapped[str] = mapped_column(String(32))
    reason: Mapped[str] = mapped_column(Text, default="")
    follow_up: Mapped[date | None] = mapped_column(Date)
    actor: Mapped[str] = mapped_column(String(64))
    evidence_refs: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(default=now)


class WorkVerification(Base):
    __tablename__ = "work_verifications"
    __table_args__ = (
        UniqueConstraint("kind", "work_id", "work_version", name="uq_work_verification_version"),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(24))
    work_id: Mapped[str] = mapped_column(String(64), index=True)
    work_version: Mapped[int] = mapped_column()
    outcome: Mapped[str] = mapped_column(String(16))
    notes: Mapped[str] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=now)


class FleetProposal(Base):
    __tablename__ = "fleet_maintenance_proposals"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("maintenance_cases.id"), index=True)
    input_version: Mapped[str] = mapped_column(String(64))
    input_snapshot: Mapped[dict[str, object]] = mapped_column(JSON)
    assignments: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    diagnostics: Mapped[list[str]] = mapped_column(JSON, default=list)
    solver_status: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="proposed")
    objective: Mapped[float | None] = mapped_column(nullable=True)
    best_bound: Mapped[float | None] = mapped_column(nullable=True)
    actor: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=now)


class FleetCapacity(Base):
    __tablename__ = "fleet_capacity_configuration"
    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    capabilities: Mapped[list[str]] = mapped_column(JSON)
    crew_capacity: Mapped[int] = mapped_column()
    bay_capacity: Mapped[int] = mapped_column()
    version: Mapped[int] = mapped_column(default=1)
    provenance: Mapped[str] = mapped_column(Text)


class FleetCapacityBooking(Base):
    __tablename__ = "fleet_capacity_bookings"
    __table_args__ = (
        UniqueConstraint("agency_id", "kind", "unit", "day", name="uq_fleet_resource_day"),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    work_id: Mapped[str] = mapped_column(ForeignKey("fleet_work_orders.id"), index=True)
    agency_id: Mapped[str] = mapped_column(ForeignKey("fleet_capacity_configuration.id"))
    kind: Mapped[str] = mapped_column(String(16))
    unit: Mapped[int] = mapped_column()
    day: Mapped[date] = mapped_column(Date)


class IngestionProcess(Base):
    __tablename__ = "ingestion_processes"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset: Mapped[str] = mapped_column(String(128))
    component_id: Mapped[str] = mapped_column(String(64))
    import_id: Mapped[str | None] = mapped_column(String(64))
    batch_id: Mapped[str | None] = mapped_column(String(64))
    job_id: Mapped[str | None] = mapped_column(ForeignKey("jobs.id"))
    model_id: Mapped[str | None] = mapped_column(String(64))
    cutoff: Mapped[int | None] = mapped_column()
    state: Mapped[str] = mapped_column(String(32))
    detail: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=now)


class FleetAssessment(Base):
    __tablename__ = "fleet_component_assessments"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("fleet_engine_runs.id"), index=True)
    component_id: Mapped[str] = mapped_column(String(64), index=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("fleet_ingest_batches.id"))
    cutoff: Mapped[date] = mapped_column(Date)
    input_ids: Mapped[list[int]] = mapped_column(JSON)
    model_hash: Mapped[str] = mapped_column(String(64))
    result: Mapped[dict[str, object]] = mapped_column(JSON)
    state: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(default=now)
