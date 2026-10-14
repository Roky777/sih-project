from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from fleet_maintenance.api.dependencies import Actor, current_actor, require_engineer
from fleet_maintenance.domain.contracts.demo import HistoryImport
from fleet_maintenance.persistence.database import get_session
from fleet_maintenance.services.approvals import ApprovalConflict
from fleet_maintenance.services.assessments import register_model
from fleet_maintenance.services.imports import import_history
from fleet_maintenance.services.jobs import submit_job

router = APIRouter(tags=["evidence"])


class Registration(BaseModel):
    version: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    directory: str = Field(min_length=1, max_length=240)


class AssessmentRequest(BaseModel):
    import_id: str = Field(min_length=1, max_length=64)
    model_id: str = Field(min_length=1, max_length=64)
    cutoff_cycle: int = Field(strict=True, ge=1)


class CsvImportRequest(BaseModel):
    csv_text: str = Field(min_length=1, max_length=1500000)
    source_version: str = Field(min_length=1, max_length=80)
    engine_identity: str = Field(max_length=120)
    previous_id: str | None = Field(default=None, max_length=64)


@router.post("/components/{component_id}/imports/csv")
def import_csv(
    component_id: str,
    body: CsvImportRequest,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, object]:
    from pydantic import ValidationError

    from fleet_maintenance.integrations.example_csv import AdapterValidationError, adapt_csv

    require_engineer(actor)
    try:
        parsed = adapt_csv(
            body.csv_text, body.source_version, body.engine_identity, body.previous_id
        )
    except AdapterValidationError as exc:
        raise HTTPException(422, {"mode": "atomic_batch", "errors": exc.errors}) from exc
    except ValidationError as exc:
        raise HTTPException(422, "History identifiers or rows are invalid") from exc
    return import_component(component_id, parsed, session, actor)


@router.post("/components/{component_id}/imports")
def import_component(
    component_id: str,
    body: HistoryImport,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, object]:
    require_engineer(actor)
    try:
        record = import_history(
            session,
            component_id,
            body.source_version,
            body.engine_identity,
            [row.model_dump() for row in body.rows],
            body.previous_id,
            actor.id,
        )
        return {
            "id": record.id,
            "source_version": record.source_version,
            "sha256": record.sha256,
            "rows": len(record.rows),
            "previous_id": record.previous_id,
        }
    except LookupError:
        raise HTTPException(404, "Component not found") from None
    except ApprovalConflict as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/models/registrations")
def model_registration(
    body: Registration,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, object]:
    if actor.role != "administrator":
        raise HTTPException(403, "Administrator role required")
    try:
        record = register_model(session, body.version, body.directory, actor.id)
        return {"id": record.id, "hashes": record.hashes, "scientific_release": "not_qualified"}
    except (ValueError, OSError, KeyError) as exc:
        raise HTTPException(422, "Artifact directory or manifest is invalid") from exc
    except ApprovalConflict as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/jobs/assessment")
def submit_assessment(
    body: AssessmentRequest,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, object]:
    require_engineer(actor)
    from fleet_maintenance.persistence.models import ImportRecord, ModelRegistration

    history = session.get(ImportRecord, body.import_id)
    if history is None or session.get(ModelRegistration, body.model_id) is None:
        raise HTTPException(404, "Import or model not found")
    if body.cutoff_cycle > len(history.rows):
        raise HTTPException(422, "Cutoff outside imported history")
    job = submit_job(
        session,
        "assessment",
        {**body.model_dump(), "component_id": history.component_id},
        owner=actor.id,
    )
    from fleet_maintenance.api.routes.jobs import serialize

    return serialize(job)


@router.post("/evidence/availability-study")
def availability_study(
    session: Session = Depends(get_session), actor: Actor = Depends(current_actor)
) -> dict[str, object]:
    from fleet_maintenance.api.dependencies import require_planner
    from fleet_maintenance.api.routes.jobs import serialize
    from fleet_maintenance.verification.availability_study import VERSION, definition_hash

    require_planner(actor)
    return serialize(
        submit_job(
            session,
            "availability_study",
            {"version": VERSION, "definition_sha256": definition_hash()},
            owner=actor.id,
        )
    )
