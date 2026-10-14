from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class NextAction(BaseModel):
    label: str
    to: str
    role: str


class CaseResponse(BaseModel):
    id: str
    dataset: str
    aircraft_id: str
    component_id: str | None
    title: str
    state: str
    owner: str | None
    owner_team: str | None
    deadline: date | None
    blocker: str | None
    version: int
    created_at: datetime
    next_action: NextAction
    evidence_versions: list[str]
    links: list[dict[str, Any]]
    review: dict[str, Any] | None
    work: list[dict[str, Any]]
    proposals: list[dict[str, Any]]
    audit: list[dict[str, Any]]


class CasePage(BaseModel):
    items: list[CaseResponse]
    total: int
    offset: int
    limit: int


class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["maintenance_required", "monitor", "dismiss", "investigate"]
    reason: str = Field(default="", max_length=1000)
    follow_up: date | None = None
    expected_version: int = Field(ge=1)
    as_of: date | None = None


class ProposalApproval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    input_version: str = Field(min_length=1, max_length=64)
    as_of: date | None = None


class VerificationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1)
    notes: str = Field(min_length=1, max_length=1000)
    as_of: date | None = None


class EngineIngestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    component_id: str = Field(max_length=64)
    model_id: str = Field(max_length=64)
    cutoff_cycle: int = Field(ge=1)
    history: dict[str, Any]


class CaseWorkOutcome(VerificationRequest):
    action: Literal["start", "complete", "cancel"]


class SearchHit(BaseModel):
    id: str
    label: str
    type: str
    dataset: str
    to: str


class WorkspaceSummary(BaseModel):
    awaiting_review: int
    work_needing_action: int
    urgent_review: int
    blocked_work: int
    actions: list[CaseResponse]
    as_of: date
    updated_at: datetime | None
    dataset: str


class FleetCapacityUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    crew_capacity: int = Field(ge=0, le=20)
    bay_capacity: int = Field(ge=0, le=20)
    capabilities: list[str] = Field(min_length=1, max_length=50)
    expected_version: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=1000)


class FleetCapacityResponse(BaseModel):
    id: str
    crew_capacity: int
    bay_capacity: int
    capabilities: list[str]
    version: int
    provenance: str
