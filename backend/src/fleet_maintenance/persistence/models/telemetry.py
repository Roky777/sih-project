"""Bounded, persisted live replay state; immutable imports remain assessment authority."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from fleet_maintenance.persistence.database import Base


class TelemetryStream(Base):
    __tablename__ = "telemetry_streams"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    component_id: Mapped[str] = mapped_column(ForeignKey("components.id"), unique=True)
    model_id: Mapped[str] = mapped_column(ForeignKey("model_registrations.id"))
    source_sha256: Mapped[str] = mapped_column(String(64))
    engine_identity: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(24), default="running")
    rows: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    rejection_count: Mapped[int] = mapped_column(default=0)
    rejections: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    import_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    process_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_received_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
    created_by: Mapped[str] = mapped_column(String(64))
