"""FD001 replay frames -> immutable imports -> existing assessment jobs and reviewed cases."""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from fleet_maintenance.domain.contracts.telemetry import TelemetryFrame
from fleet_maintenance.persistence.models import (
    Aircraft,
    Alert,
    Assessment,
    AuditEvent,
    Component,
    IngestionProcess,
    Job,
    TelemetryStream,
)
from fleet_maintenance.services.customer_trials import catalog
from fleet_maintenance.services.ingestion import ingest_engine, process_dict

STALE_SECONDS = 15
MAX_CYCLES = 180


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def get_stream(session: Session, identifier: str, *, lock: bool = False) -> TelemetryStream:
    query = select(TelemetryStream).where(TelemetryStream.id == identifier)
    row = session.scalar(query.with_for_update() if lock else query)
    if row is None:
        raise LookupError("Telemetry stream not found")
    return row


def create(session: Session, actor: str) -> dict[str, Any]:
    sample = catalog(session)
    if (
        not sample.available
        or not sample.history
        or not sample.model_id
        or not sample.source_sha256
    ):
        raise ValueError(sample.reason)
    identifier = f"stream-{uuid4().hex}"
    aircraft = Aircraft(
        id=identifier,
        tail_number=f"REPLAY-{identifier[7:19]}",
        label="Live FD001 replay demonstration",
        provenance="synthetic",
    )
    session.add(aircraft)
    session.flush()
    component = Component(
        id=f"{identifier}-engine",
        aircraft_id=identifier,
        serial_number=f"{identifier}-engine",
        kind="engine",
    )
    session.add(component)
    session.flush()
    row = TelemetryStream(
        id=identifier,
        component_id=component.id,
        model_id=sample.model_id,
        source_sha256=sample.source_sha256,
        engine_identity=sample.history.engine_identity,
        created_by=actor,
        rows=[],
        rejections=[],
        rejection_count=0,
        status="running",
    )
    session.add(row)
    session.add(
        AuditEvent(
            actor=actor,
            action="telemetry.created",
            subject_id=identifier,
            details={"source_sha256": sample.source_sha256, "adapter": "FD001-replay-v1"},
        )
    )
    session.commit()
    return detail(session, row)


def detail(session: Session, row: TelemetryStream) -> dict[str, Any]:
    now = datetime.now(UTC)
    freshness = "waiting"
    if row.last_received_at:
        freshness = (
            "stale"
            if (
                now
                - min(
                    utc(row.last_received_at),
                    datetime.fromisoformat(row.rows[-1]["observed_at"]) if row.rows else now,
                )
            ).total_seconds()
            > STALE_SECONDS
            else "fresh"
        )
    process = session.get(IngestionProcess, row.process_id) if row.process_id else None
    job = session.get(Job, process.job_id) if process and process.job_id else None
    assessment = (
        session.get(Assessment, str(job.result_payload.get("assessment_id")))
        if job and job.result_payload
        else None
    )
    if assessment and assessment.input_version != row.import_id:
        assessment = None
    alert = (
        session.scalar(select(Alert).where(Alert.assessment_id == assessment.id))
        if assessment
        else None
    )
    evidence = (
        None
        if not assessment
        else {
            "id": assessment.id,
            "state": assessment.state,
            "cutoff_cycle": assessment.cutoff_cycle,
            "estimate_cycles": assessment.estimate_cycles,
            "lower_cycles": assessment.lower_cycles,
            "upper_cycles": assessment.upper_cycles,
            "input_version": assessment.input_version,
            "model_version": assessment.model_version,
            "quality_findings": assessment.quality_findings,
            "requires_review": bool(alert and alert.state in {"warning", "critical"}),
        }
    )
    component = session.get(Component, row.component_id)
    return {
        "id": row.id,
        "aircraft_id": component.aircraft_id if component else None,
        "component_id": row.component_id,
        "model_id": row.model_id,
        "engine_identity": row.engine_identity,
        "source_sha256": row.source_sha256,
        "status": row.status,
        "freshness": freshness,
        "stale_after_seconds": STALE_SECONDS,
        "accepted_cycles": len(row.rows),
        "next_cycle": len(row.rows) + 1,
        "max_cycles": MAX_CYCLES,
        "last_received_at": row.last_received_at,
        "latest_frame": row.rows[-1] if row.rows else None,
        "rejection_count": row.rejection_count,
        "rejections": row.rejections,
        "process": process_dict(session, process) if process else None,
        "assessment": evidence,
        "label": "Live transport of archived simulated FD001 cycles; not aircraft telemetry",
        "mapping": "One engine identity at a conceptual installation; other parts not assessed",
    }


def receive(
    session: Session, row: TelemetryStream, frames: list[dict[str, Any]], actor: str
) -> dict[str, Any]:
    if row.status != "running":
        raise ValueError("Resume this stream before sending frames")
    now = datetime.now(UTC)
    accepted = list(row.rows)
    rejected = list(row.rejections)
    rejected_count = 0
    for raw in frames:
        try:
            frame = TelemetryFrame.model_validate(raw)
            if frame.observed_at.tzinfo is None:
                raise ValueError("A timezone-aware transport timestamp is required")
            if utc(frame.observed_at) > now + timedelta(seconds=30):
                raise ValueError("Transport timestamp is in the future")
            if frame.cycle != len(accepted) + 1:
                raise ValueError(
                    "Duplicate or out-of-order cycle; expected the next consecutive cycle"
                )
            if frame.cycle > MAX_CYCLES:
                raise ValueError("Replay support limit reached")
            if accepted and utc(frame.observed_at) <= datetime.fromisoformat(
                accepted[-1]["observed_at"]
            ):
                raise ValueError("Transport timestamps must increase")
            accepted.append(
                {
                    "cycle": frame.cycle,
                    "values": frame.values,
                    "observed_at": utc(frame.observed_at).isoformat(),
                }
            )
        except (ValidationError, ValueError) as exc:
            reason = (
                "Frame schema/finite-value validation failed"
                if isinstance(exc, ValidationError)
                else str(exc)
            )
            rejected.append({"received_at": now.isoformat(), "reason": reason})
            rejected_count += 1
    previous_count = len(row.rows)
    row.rows, row.rejections = accepted, rejected[-10:]
    row.rejection_count += rejected_count
    if len(accepted) > previous_count:
        row.last_received_at = now
        # Bounded snapshots every 30 cycles; do not queue a model job for every sensor frame.
        if len(accepted) // 30 > previous_count // 30 or len(accepted) == MAX_CYCLES:
            history = {
                "source_version": f"{row.id}-{len(accepted)}",
                "engine_identity": row.engine_identity,
                "previous_id": row.import_id,
                "rows": [{"cycle": f["cycle"], "values": f["values"]} for f in accepted],
            }
            process = ingest_engine(
                session, row.component_id, row.model_id, len(accepted), history, actor, commit=False
            )
            row.process_id, row.import_id = process["id"], process["import_id"]
    if len(accepted) == MAX_CYCLES:
        row.status = "completed"
    session.add(
        AuditEvent(
            actor=actor,
            action="telemetry.frames",
            subject_id=row.id,
            details={
                "accepted": len(accepted) - previous_count,
                "rejected": rejected_count,
                "cutoff": len(accepted),
            },
        )
    )
    session.commit()
    return detail(session, row)


def replay(
    session: Session, row: TelemetryStream, count: int, invalid: bool, actor: str
) -> dict[str, Any]:
    sample = catalog(session)
    if not sample.history or sample.source_sha256 != row.source_sha256:
        raise ValueError("Replay source is missing or changed; start a new stream")
    start = len(row.rows)
    now = datetime.now(UTC)
    frames = [
        {**item.model_dump(), "observed_at": (now + timedelta(microseconds=i)).isoformat()}
        for i, item in enumerate(sample.history.rows[start : min(start + count, MAX_CYCLES)])
    ]
    if invalid:
        frames = [{"cycle": start or 2, "values": [0.0] * 24, "observed_at": now.isoformat()}]
    if not frames:
        return detail(session, row)
    return receive(session, row, frames, actor)
