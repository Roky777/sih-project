"""Customer-entered aircraft metadata, separate from generated scientific fixtures."""

from datetime import UTC, date, datetime

from sqlalchemy import JSON, Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from fleet_maintenance.persistence.database import Base


class AircraftRegistration(Base):
    __tablename__ = "aircraft_registrations"
    id: Mapped[str] = mapped_column(ForeignKey("aircraft.id"), primary_key=True)
    serial_number: Mapped[str] = mapped_column(String(80), unique=True)
    aircraft_type: Mapped[str] = mapped_column(String(100))
    base: Mapped[str] = mapped_column(String(80))
    fleet_entry_date: Mapped[date] = mapped_column(Date, index=True)
    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))


class ComponentInstallation(Base):
    __tablename__ = "component_installations"
    __table_args__ = (UniqueConstraint("aircraft_id", "position", name="uq_installation_position"),)
    id: Mapped[str] = mapped_column(ForeignKey("components.id"), primary_key=True)
    aircraft_id: Mapped[str] = mapped_column(ForeignKey("aircraft_registrations.id"), index=True)
    position: Mapped[str] = mapped_column(String(80))
    installed_on: Mapped[date] = mapped_column(Date)


class AircraftSourceRecord(Base):
    __tablename__ = "aircraft_source_records"
    __table_args__ = (
        UniqueConstraint("aircraft_id", "fingerprint", name="uq_aircraft_source_record"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    aircraft_id: Mapped[str] = mapped_column(ForeignKey("aircraft_registrations.id"), index=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(32))
    effective_date: Mapped[date] = mapped_column(Date)
    payload: Mapped[dict[str, object]] = mapped_column(JSON)
    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
