"""Durable records for immutable scientific inputs and operational lifecycles."""

from datetime import UTC, datetime

from sqlalchemy import JSON, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from fleet_maintenance.persistence.database import Base


class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    workspace: Mapped[str | None] = mapped_column(String(32), nullable=True)
    csrf_token: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))


class ImportRecord(Base):
    __tablename__ = "import_records"
    __table_args__ = (UniqueConstraint("component_id", "source_version", name="uq_import_version"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    component_id: Mapped[str] = mapped_column(ForeignKey("components.id"), index=True)
    source_version: Mapped[str] = mapped_column(String(80))
    engine_identity: Mapped[str] = mapped_column(String(120))
    sha256: Mapped[str] = mapped_column(String(64))
    rows: Mapped[list[dict[str, object]]] = mapped_column(JSON)
    previous_id: Mapped[str | None] = mapped_column(ForeignKey("import_records.id"), nullable=True)
    actor: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))


class ModelRegistration(Base):
    __tablename__ = "model_registrations"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    artifact_directory: Mapped[str] = mapped_column(String(240))
    hashes: Mapped[dict[str, str]] = mapped_column(JSON)
    manifest: Mapped[dict[str, object]] = mapped_column(JSON)
    actor: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))


class WorkRecord(Base):
    __tablename__ = "work_records"
    __table_args__ = (UniqueConstraint("plan_id", "task_id", name="uq_plan_work_task"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    plan_id: Mapped[str] = mapped_column(ForeignKey("plans.id"), index=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("maintenance_tasks.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="approved")
    version: Mapped[int] = mapped_column(default=1)
    consumed_quantity: Mapped[int] = mapped_column(default=0)
    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    notes: Mapped[str] = mapped_column(String(1000), default="")


class CommandRecord(Base):
    __tablename__ = "command_records"
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    actor: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(48))
    payload_hash: Mapped[str] = mapped_column(String(64))
    result_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
