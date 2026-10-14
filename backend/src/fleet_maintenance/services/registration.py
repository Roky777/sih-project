"""Registration and immutable source records; no synthetic assessment is assigned."""

import hashlib
import json
import uuid
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
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


class RegistrationConflict(ValueError):
    pass


def registration(session: Session, identifier: str) -> AircraftRegistration:
    row = session.get(AircraftRegistration, identifier)
    if row is None:
        raise LookupError("Registered aircraft not found")
    return row


def detail(session: Session, identifier: str, cutoff: date | None = None) -> dict[str, Any]:
    row = registration(session, identifier)
    aircraft = session.get(Aircraft, identifier)
    assert aircraft is not None
    day = cutoff or datetime.now(ZoneInfo("Asia/Kolkata")).date()
    if row.fleet_entry_date > day:
        raise LookupError("Aircraft had not joined the fleet at this cutoff")
    components = session.execute(
        select(Component, ComponentInstallation)
        .join(ComponentInstallation, ComponentInstallation.id == Component.id)
        .where(
            ComponentInstallation.aircraft_id == identifier,
            ComponentInstallation.installed_on <= day,
        )
    ).all()
    records = session.scalars(
        select(AircraftSourceRecord)
        .where(
            AircraftSourceRecord.aircraft_id == identifier,
            AircraftSourceRecord.effective_date <= day,
        )
        .order_by(AircraftSourceRecord.effective_date, AircraftSourceRecord.created_at)
    ).all()
    usage = next((record.payload for record in reversed(records) if record.kind == "usage"), {})
    return {
        "id": row.id,
        "tail_number": aircraft.tail_number,
        "serial_number": row.serial_number,
        "aircraft_type": row.aircraft_type,
        "base": row.base,
        "fleet_entry_date": row.fleet_entry_date.isoformat(),
        "as_of": day.isoformat(),
        "provenance": "user_supplied",
        "availability_state": "unknown",
        "health_index": None,
        "assessment_status": "not_assessed",
        "flight_hours": usage.get("flight_hours"),
        "cycles": usage.get("cycles"),
        "components": [
            {
                "id": c.id,
                "serial_number": c.serial_number,
                "kind": c.kind,
                "position": i.position,
                "installed_on": i.installed_on.isoformat(),
                "assessment_status": "unsupported",
            }
            for c, i in components
        ],
        "records": [
            {
                "id": r.id,
                "source": r.source,
                "kind": r.kind,
                "effective_date": r.effective_date.isoformat(),
                "payload": r.payload,
                "created_at": r.created_at.isoformat(),
            }
            for r in records
        ],
        "limitations": "User-entered records have no qualified prediction model or recorded "
        "availability assessment. Mandatory requirements are retained; planning needs validated "
        "task durations, resources and permissions. Registration is not flight clearance.",
    }


def list_registered(
    session: Session, cutoff: date | None = None, *, q: str = "", limit: int = 25, offset: int = 0
) -> dict[str, Any]:
    day = cutoff or datetime.now(ZoneInfo("Asia/Kolkata")).date()
    conditions = [AircraftRegistration.fleet_entry_date <= day]
    if q.strip():
        conditions.append(
            or_(
                Aircraft.tail_number.icontains(q, autoescape=True),
                AircraftRegistration.aircraft_type.icontains(q, autoescape=True),
                AircraftRegistration.base.icontains(q, autoescape=True),
            )
        )
    query = (
        select(AircraftRegistration, Aircraft)
        .join(Aircraft, Aircraft.id == AircraftRegistration.id)
        .where(*conditions)
    )
    total = (
        session.scalar(
            select(func.count())
            .select_from(AircraftRegistration)
            .join(Aircraft, Aircraft.id == AircraftRegistration.id)
            .where(*conditions)
        )
        or 0
    )
    rows = session.execute(query.order_by(Aircraft.tail_number).offset(offset).limit(limit)).all()
    ids = [r.id for r, _ in rows]
    counts = (
        dict(
            session.execute(
                select(ComponentInstallation.aircraft_id, func.count())
                .where(
                    ComponentInstallation.aircraft_id.in_(ids),
                    ComponentInstallation.installed_on <= day,
                )
                .group_by(ComponentInstallation.aircraft_id)
            ).all()
        )
        if ids
        else {}
    )
    items = [
        {
            "id": r.id,
            "tail_number": a.tail_number,
            "serial_number": r.serial_number,
            "aircraft_type": r.aircraft_type,
            "base": r.base,
            "fleet_entry_date": r.fleet_entry_date.isoformat(),
            "as_of": day.isoformat(),
            "component_count": counts.get(r.id, 0),
            "assessment_status": "not_assessed",
            "availability_state": "unknown",
        }
        for r, a in rows
    ]
    return {
        "as_of": day.isoformat(),
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "unknown_availability": total,
        "data": "user_supplied",
    }


def _save(session: Session, actor: str, action: str, subject: str) -> None:
    session.add(AuditEvent(actor=actor, action=action, subject_id=subject, details={}))
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise RegistrationConflict(
            "Duplicate tail, serial, installation position or source record"
        ) from exc


def create_aircraft(session: Session, body: AircraftCreate, actor: str) -> dict[str, Any]:
    if body.fleet_entry_date > datetime.now(ZoneInfo("Asia/Kolkata")).date():
        raise ValueError("Future fleet entry is not supported; register on or after its entry date")
    tail = body.tail_number.upper()
    # Existing bundle identities must not be shadowed by customer-entered records.
    from fleet_maintenance.services.fleet_health import EngineNotReady, active_bundle

    try:
        bundle = active_bundle(session)
    except EngineNotReady:
        bundle = None
    if bundle and tail in bundle.aircraft_index:
        raise RegistrationConflict("This tail number already belongs to the demonstration fleet")
    identifier = f"REG-{uuid.uuid4().hex[:20]}"
    session.add(
        Aircraft(
            id=identifier, tail_number=tail, label=body.aircraft_type, provenance="user_supplied"
        )
    )
    session.flush()
    session.add(
        AircraftRegistration(
            id=identifier,
            serial_number=body.serial_number.upper(),
            aircraft_type=body.aircraft_type,
            base=body.base,
            fleet_entry_date=body.fleet_entry_date,
            created_by=actor,
        )
    )
    _save(session, actor, "aircraft.registered", identifier)
    return {
        "id": identifier,
        "tail_number": tail,
        "fleet_entry_date": body.fleet_entry_date.isoformat(),
    }


def install_component(
    session: Session, identifier: str, body: ComponentCreate, actor: str
) -> dict[str, str]:
    registration(session, identifier)
    if body.installed_on > datetime.now(ZoneInfo("Asia/Kolkata")).date():
        raise ValueError("Installation date cannot be in the future")
    component_id = f"CMP-{uuid.uuid4().hex[:20]}"
    session.add(
        Component(
            id=component_id,
            aircraft_id=identifier,
            serial_number=body.serial_number.upper(),
            kind=body.kind,
            status="not_assessed",
        )
    )
    session.flush()
    session.add(
        ComponentInstallation(
            id=component_id,
            aircraft_id=identifier,
            position=body.position.upper(),
            installed_on=body.installed_on,
        )
    )
    _save(session, actor, "component.installed", component_id)
    return {"id": component_id, "assessment_status": "unsupported"}


def import_records(
    session: Session, identifier: str, body: RecordsImport, actor: str
) -> dict[str, Any]:
    registration(session, identifier)
    installed = set(
        session.scalars(select(Component.id).where(Component.aircraft_id == identifier))
    )
    previous = session.scalars(
        select(AircraftSourceRecord).where(AircraftSourceRecord.aircraft_id == identifier)
    ).all()
    hashes = {r.fingerprint for r in previous}
    usage: list[tuple[date, dict[str, Any]]] = [
        (r.effective_date, r.payload) for r in previous if r.kind == "usage"
    ]
    pending: list[tuple[Any, dict[str, Any], str]] = []
    duplicates = 0
    for record in body.records:
        if record.component_id and record.component_id not in installed:
            raise ValueError("Component is not installed on this aircraft")
        payload = record.model_dump(mode="json")
        fingerprint = hashlib.sha256(
            json.dumps({"source": body.source, "payload": payload}, sort_keys=True).encode()
        ).hexdigest()
        if fingerprint in hashes:
            duplicates += 1
            continue
        hashes.add(fingerprint)
        if record.kind == "usage":
            usage.append((record.effective_date, payload))
        pending.append((record, payload, fingerprint))
    usage.sort(key=lambda row: row[0])
    for (before_date, before), (after_date, after) in zip(usage, usage[1:], strict=False):
        if (
            after["flight_hours"] < before["flight_hours"]
            or after["cycles"] < before["cycles"]
            or (
                before_date == after_date
                and (before["flight_hours"], before["cycles"])
                != (after["flight_hours"], after["cycles"])
            )
        ):
            raise ValueError("Cumulative usage must not decrease or conflict at the same date")
    if not body.preview:
        for record, payload, fingerprint in pending:
            session.add(
                AircraftSourceRecord(
                    id=f"SRC-{uuid.uuid4().hex[:20]}",
                    aircraft_id=identifier,
                    fingerprint=fingerprint,
                    source=body.source,
                    kind=record.kind,
                    effective_date=record.effective_date,
                    payload=payload,
                    created_by=actor,
                )
            )
        _save(session, actor, "aircraft.records_imported", identifier)
    return {
        "preview": body.preview,
        "accepted": len(pending),
        "duplicates": duplicates,
        "assessment_status": "not_assessed",
        "source": body.source,
        "message": "Records validated. No prediction or operational clearance is inferred.",
    }
