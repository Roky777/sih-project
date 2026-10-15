from fastapi import APIRouter, HTTPException

from fleet_maintenance.domain.contracts.research import (
    DrawingEvidence,
    ResearchIndex,
    ResearchReport,
    Subset,
)
from fleet_maintenance.services.research_evidence import (
    ResearchEvidenceUnavailable,
    drawing_register,
    load_index,
    load_report,
)
from fleet_maintenance.settings import get_settings

router = APIRouter(prefix="/evidence", tags=["research evidence"])


@router.get("/research", response_model=ResearchIndex)
def index() -> ResearchIndex:
    try:
        return load_index(get_settings().artifact_root)
    except ResearchEvidenceUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@router.get("/research/{subset}", response_model=ResearchReport)
def report(subset: Subset) -> ResearchReport:
    try:
        return load_report(get_settings().artifact_root, subset)
    except ResearchEvidenceUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@router.get("/drawings", response_model=list[DrawingEvidence])
def drawings() -> list[DrawingEvidence]:
    return drawing_register()
