"""Replayable FD001 baseline assessments. No scientific release certification is implied."""

import json
import uuid

import numpy as np
from sqlalchemy.orm import Session

from fleet_maintenance.artifacts.storage import artifact_directory, sha256, verify_hashes
from fleet_maintenance.persistence.models import (
    Assessment,
    AuditEvent,
    ImportRecord,
    ModelRegistration,
)
from fleet_maintenance.science.prediction.inference import HistoryPrediction, predict_history
from fleet_maintenance.services.approvals import ApprovalConflict
from fleet_maintenance.settings import get_settings


def register_model(session: Session, version: str, directory: str, actor: str) -> ModelRegistration:
    path = artifact_directory(get_settings().artifact_root, directory)
    manifest = json.loads((path / "manifest.json").read_text())
    if (
        manifest.get("dataset") != "NASA_CMAPSS_FD001"
        or manifest.get("model") != "gradient_boosting_regressor"
    ):
        raise ValueError("Only the implemented FD001 baseline is supported")
    hashes = manifest["artifacts"]
    if set(hashes) != {"model.joblib", "standardizer.json"}:
        raise ValueError("Model requires both fitted model and fitted transform")
    verify_hashes(path, hashes)
    calibration = json.loads((path / "calibration.json").read_text())
    if calibration["model_artifacts"] != hashes:
        raise ValueError("Calibration belongs to different model artifacts")
    hashes = {
        **hashes,
        "manifest.json": sha256(path / "manifest.json"),
        "calibration.json": sha256(path / "calibration.json"),
    }
    existing = session.get(ModelRegistration, version)
    if existing:
        if existing.hashes != hashes or existing.artifact_directory != directory:
            raise ApprovalConflict("Model version is immutable; register a new version")
        return existing
    record = ModelRegistration(
        id=version, artifact_directory=directory, hashes=hashes, manifest=manifest, actor=actor
    )
    session.add(record)
    session.add(
        AuditEvent(
            actor=actor,
            action="model.registered",
            subject_id=version,
            details={"hashes": hashes, "scientific_release": "not_qualified"},
        )
    )
    session.commit()
    return record


def assess(
    session: Session,
    import_id: str,
    model_id: str,
    cutoff: int,
    *,
    assessment_id: str | None = None,
    commit: bool = True,
    computed_prediction: HistoryPrediction | None = None,
) -> Assessment:
    history = session.get(ImportRecord, import_id)
    registration = session.get(ModelRegistration, model_id)
    if history is None or registration is None:
        raise LookupError("Import or model version not found")
    if cutoff > len(history.rows) or cutoff < 1:
        raise ValueError("Cutoff is outside the imported history")
    rows = history.rows[:cutoff]
    record = Assessment(
        id=assessment_id or f"asm-{uuid.uuid4().hex}",
        component_id=history.component_id,
        state="unavailable",
        input_version=history.id,
        model_version=model_id,
        cutoff_cycle=cutoff,
        evidence={
            "source_sha256": history.sha256,
            "artifact_hashes": registration.hashes,
            "engine_identity": history.engine_identity,
            "cutoff_cycle": cutoff,
            "scientific_release": "not_qualified",
        },
    )
    minimum = int(str(registration.manifest["minimum_history_cycles"]))
    from fleet_maintenance.science.data.eligibility import history_findings

    findings = history_findings(rows, minimum, registration.manifest)
    if findings:
        record.state = "withheld"
        record.quality_findings = findings
    else:
        directory = artifact_directory(
            get_settings().artifact_root, registration.artifact_directory
        )
        verify_hashes(directory, registration.hashes)
        prediction = (
            computed_prediction
            if computed_prediction is not None
            else predict_history(
                directory, np.asarray([row["values"] for row in rows], dtype=np.float64), cutoff
            )
        )
        record.state = "available"
        record.estimate_cycles = prediction.estimate_cycles
        record.lower_cycles = prediction.lower_cycles
        record.upper_cycles = prediction.upper_cycles
        record.quality_findings = [
            {
                "code": "research_model",
                "severity": "warning",
                "message": "Research assessment on simulated FD001 data; qualification pending.",
            }
        ]
        record.evidence = {**record.evidence, **prediction.evidence}
    session.add(record)
    session.flush()
    from fleet_maintenance.services.alerts import record_assessment_alert

    record_assessment_alert(session, record)
    from fleet_maintenance.services.cases import assessment_case

    assessment_case(session, record)
    if commit:
        session.commit()
    else:
        session.flush()
    return record
