from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from fleet_maintenance.api.dependencies import Actor, current_actor, require_engineer
from fleet_maintenance.domain.contracts.cases import EngineIngestionRequest
from fleet_maintenance.persistence.database import get_session
from fleet_maintenance.persistence.models import IngestionProcess
from fleet_maintenance.services.approvals import ApprovalConflict
from fleet_maintenance.services.ingestion import ingest_engine, process_dict

router = APIRouter(prefix="/ingestion", tags=["ingestion"])


@router.get("/processes")
def processes(session: Session = Depends(get_session)) -> list[dict[str, Any]]:
    return [
        process_dict(session, row)
        for row in session.scalars(
            select(IngestionProcess).order_by(IngestionProcess.created_at.desc()).limit(100)
        )
    ]


@router.post("/engine-history")
def engine_history(
    body: EngineIngestionRequest,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    require_engineer(actor)
    try:
        return ingest_engine(
            session, body.component_id, body.model_id, body.cutoff_cycle, body.history, actor.id
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ApprovalConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
