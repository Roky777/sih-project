"""Validated observations reach eligible, immutable, dataset-specific assessment jobs."""

import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from fleet_maintenance.artifacts.storage import verify_hashes
from fleet_maintenance.persistence.models import (
    Component,
    FleetAssessment,
    FleetIngestBatch,
    FleetIngestedReading,
    IngestionProcess,
    Job,
    ModelRegistration,
)
from fleet_maintenance.services.approvals import ApprovalConflict
from fleet_maintenance.services.jobs import submit_job


def queue_fleet_batch(session: Session, batch: FleetIngestBatch, actor: str) -> None:
    from fleet_maintenance.services.fleet_health import active_bundle, run_id_of

    bundle = active_bundle(session)
    components = set(
        session.scalars(
            select(FleetIngestedReading.component_id).where(
                FleetIngestedReading.batch_id == batch.id
            )
        )
    )
    for component in sorted(components):
        identifier = f"ingestion-{uuid.uuid5(uuid.NAMESPACE_URL, batch.id + component).hex}"
        if session.get(IngestionProcess, identifier):
            continue
        readings = list(
            session.scalars(
                select(FleetIngestedReading)
                .where(FleetIngestedReading.component_id == component)
                .order_by(FleetIngestedReading.reading_date, FleetIngestedReading.id)
            )
        )
        cutoff = max(row.reading_date for row in readings if row.batch_id == batch.id)
        hashes = bundle.manifest["hashes"]
        eligible = "ingestion_context.npz" in hashes
        process = IngestionProcess(
            id=identifier,
            dataset=f"operational:{run_id_of(bundle)}",
            component_id=component,
            batch_id=batch.id,
            model_id=run_id_of(bundle),
            state="queued" if eligible else "model_unavailable",
            detail="Queued against the saved fleet transform/model"
            if eligible
            else (
                "This bundle lacks fitted feature context. Rebuild the synthetic engine "
                "in Data & integrations to install ingestion support. Historical records remain."
            ),
        )
        session.add(process)
        session.flush()
        if eligible:
            job = submit_job(
                session,
                "fleet_assessment",
                {
                    "process_id": process.id,
                    "batch_id": batch.id,
                    "run_id": run_id_of(bundle),
                    "component_id": component,
                    "cutoff": cutoff.isoformat(),
                    "reading_ids": [row.id for row in readings if row.reading_date <= cutoff],
                },
                owner=actor,
                commit=False,
            )
            process.job_id = job.id
    session.flush()


def execute_fleet(session: Session, payload: dict[str, Any], job_id: str) -> dict[str, Any]:
    from fleet_maintenance.science.fleet.online import infer
    from fleet_maintenance.services.fleet_health import active_bundle, run_id_of

    bundle = active_bundle(session)
    if run_id_of(bundle) != payload["run_id"]:
        raise ApprovalConflict("A newer fleet bundle superseded the requested assessment")
    ids = [int(i) for i in payload["reading_ids"]]
    readings = list(
        session.scalars(
            select(FleetIngestedReading)
            .where(FleetIngestedReading.id.in_(ids))
            .order_by(FleetIngestedReading.reading_date, FleetIngestedReading.id)
        )
    )
    component = str(payload["component_id"])
    if any(row.component_id != component for row in readings):
        raise ApprovalConflict("Observation mapping does not match assessment component")
    cutoff = date.fromisoformat(str(payload["cutoff"]))
    slot = bundle.slot_index[component]
    names = [str(p["name"]) for p in bundle.type_by_code[bundle.slots[slot]["type"]]["parameters"]]
    directory, hashes = bundle.directory, bundle.manifest["hashes"]
    verify_hashes(
        directory, {name: hashes[name] for name in ["models.joblib", "ingestion_context.npz"]}
    )
    inputs = [
        {
            "date": row.reading_date,
            "parameter": row.parameter,
            "mean": row.mean,
            "quality_flag": row.quality_flag,
        }
        for row in readings
    ]
    session.rollback()  # Numerical inference must not hold a transaction open.
    result = infer(directory, slot, bundle.day_of(cutoff), inputs, names, bundle.start)
    if run_id_of(active_bundle(session)) != payload["run_id"]:
        raise ApprovalConflict("The fleet input changed during assessment; assess current inputs")
    record = FleetAssessment(
        id=f"fasm-{job_id.removeprefix('job-')}",
        run_id=str(payload["run_id"]),
        component_id=component,
        batch_id=str(payload["batch_id"]),
        cutoff=cutoff,
        input_ids=ids,
        model_hash=str(hashes["models.joblib"]),
        result=result,
        state=result["state"],
    )
    existing = session.get(FleetAssessment, record.id)
    if existing is None:
        session.add(record)
        session.flush()
    from fleet_maintenance.services.cases import fleet_cases, link

    fleet_cases(session)
    from fleet_maintenance.services.fleet_health import _forecasts

    _forecasts.clear()
    from fleet_maintenance.persistence.models import MaintenanceCase

    for case in session.scalars(
        select(MaintenanceCase).where(
            MaintenanceCase.dataset == f"operational:{payload['run_id']}",
            MaintenanceCase.component_id == component,
        )
    ):
        link(
            session,
            case,
            "fleet_assessment",
            record.id,
            record.model_hash,
            {
                "batch": record.batch_id,
                "cutoff": str(cutoff),
                "reading_ids": ids,
                "state": record.state,
            },
        )
    return {"assessment_id": record.id}


def ingest_engine(
    session: Session,
    component_id: str,
    model_id: str,
    cutoff: int,
    history: dict[str, Any],
    actor: str,
    *,
    commit: bool = True,
) -> dict[str, Any]:
    from fleet_maintenance.domain.contracts.health import HistoryImport
    from fleet_maintenance.services.imports import import_history

    parsed = HistoryImport.model_validate(history)
    component = session.get(Component, component_id)
    if component is None:
        raise LookupError("No verified research/trial component mapping")
    if component.kind != "engine":
        raise ValueError("The FD001 adapter supports engine histories only")
    if cutoff > len(parsed.rows):
        raise ValueError("Assessment cutoff is outside supplied history")
    record = import_history(
        session,
        component_id,
        parsed.source_version,
        parsed.engine_identity,
        [row.model_dump() for row in parsed.rows],
        parsed.previous_id,
        actor,
        commit=False,
    )
    identifier = f"ingestion-{record.id.removeprefix('import-')}"
    existing = session.get(IngestionProcess, identifier)
    if existing:
        return process_dict(session, existing)
    from fleet_maintenance.services.cases import dataset_for

    eligible = session.get(ModelRegistration, model_id) is not None
    process = IngestionProcess(
        id=identifier,
        dataset=dataset_for(component),
        component_id=component_id,
        import_id=record.id,
        model_id=model_id,
        cutoff=cutoff,
        state="queued" if eligible else "model_unavailable",
        detail="Immutable history saved; eligible assessment queued"
        if eligible
        else ("History saved. Register the calibrated FD001 model and retry assessment."),
    )
    session.add(process)
    session.flush()
    if eligible:
        job = submit_job(
            session,
            "assessment",
            {
                "import_id": record.id,
                "model_id": model_id,
                "cutoff_cycle": cutoff,
                "component_id": component_id,
            },
            owner=actor,
            commit=False,
        )
        process.job_id = job.id
    if commit:
        session.commit()
    return process_dict(session, process)


def process_dict(session: Session, process: IngestionProcess) -> dict[str, Any]:
    job = session.get(Job, process.job_id) if process.job_id else None
    state = (
        {"running": "assessing", "succeeded": "assessed", "queued": "queued"}.get(
            job.state, job.state
        )
        if job
        else process.state
    )
    return {
        "id": process.id,
        "dataset": process.dataset,
        "component_id": process.component_id,
        "import_id": process.import_id,
        "batch_id": process.batch_id,
        "job_id": process.job_id,
        "model_id": process.model_id,
        "cutoff_cycle": process.cutoff,
        "state": state,
        "detail": process.detail,
        "result": job.result_payload if job else None,
    }
