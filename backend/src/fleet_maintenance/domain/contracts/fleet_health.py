"""API contracts for the synthetic fleet-health workspace."""

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field

HealthState = Literal["healthy", "watch", "degraded", "critical", "failed", "under_maintenance"]
AdvisoryStatus = Literal["proposed", "accepted", "scheduled", "completed", "dismissed"]


class EngineRunResponse(BaseModel):
    id: str
    state: str
    seed: int
    as_of: str | None
    job_id: str | None
    summary: dict[str, Any]
    requested_by: str
    created_at: str
    completed_at: str | None


class EngineStatusResponse(BaseModel):
    ready: bool
    active_run: EngineRunResponse | None
    pending_run: EngineRunResponse | None
    runs: list[EngineRunResponse]
    data: str
    replay_from: str | None = None
    replay_to: str | None = None
    scripted: list[dict[str, Any]] = []


class EngineRunRequest(BaseModel):
    seed: int = Field(default=42, ge=0, le=1_000_000)


class Quantiles(BaseModel):
    p10: float
    p50: float
    p90: float


class PriorityFactor(BaseModel):
    name: str
    weight: float
    value: float
    points: float


class Priority(BaseModel):
    level: Literal["P1", "P2", "P3", "P4"]
    score: float
    factors: list[PriorityFactor]


class Action(BaseModel):
    code: Literal["ground_now", "replace_within", "inspect", "monitor"]
    label: str
    within_days: int | None


class SpareCheck(BaseModel):
    part_number: str
    on_hand: int
    reserved: int
    available: int
    on_order: int
    next_receipt: str | None
    lead_time_days: int
    status: Literal["available", "contested", "short", "additive_print"]
    supplier_lead_time_days: int | None = None
    additive_printable: bool = False
    queue_position: int
    fleet_demand_30d: int
    fleet_shortfall: bool
    lead_time_exceeds_rul: bool
    shortfall_in_days: float | None = None
    note: str | None


class ContributingParameter(BaseModel):
    name: str
    unit: str
    deviation_sigma: float


class Attribution(BaseModel):
    factor: str
    label: str
    contribution: float


class Downtime(BaseModel):
    act_now_days: float
    run_to_failure_days: float
    queue_days: float
    spare_wait_days: float


class AvailabilityImpact(BaseModel):
    act_now_aircraft_days: float
    run_to_failure_expected_aircraft_days: float


class Confidence(BaseModel):
    level: Literal["low", "moderate", "high"]
    notes: list[str]


class AdvisoryResponse(BaseModel):
    id: str
    component_id: str
    aircraft: str
    system: str
    system_name: str
    component_type: str
    component_name: str
    serial: str
    criticality: int
    as_of: str
    health_state: HealthState
    health_index: float
    health_index_20d_ago: float
    risk_14d: float
    risk_30d: float
    risk_band: Literal["low", "watch", "high", "critical"]
    rul_days: Quantiles
    anomaly_score: float
    anomaly_sustained: bool
    contributing_parameters: list[ContributingParameter]
    attribution: list[Attribution]
    action: Action
    priority: Priority
    spare: SpareCheck
    downtime: Downtime
    availability_impact: AvailabilityImpact
    confidence: Confidence
    explanation: str
    status: AdvisoryStatus
    status_reason: str | None
    status_actor: str | None
    status_updated_at: str | None
    work_order_id: str | None
    parts_status: str | None = None


class AdvisoryUpdateRequest(BaseModel):
    as_of: date | None = None
    status: AdvisoryStatus
    reason: str | None = Field(default=None, max_length=500)
    expected_status: AdvisoryStatus | None = None


class Backlog(BaseModel):
    open_work_orders: int
    recorded_open: int
    planned_from_advisories: int
    man_hours: float
    man_hours_assumption: str


class FleetSummaryResponse(BaseModel):
    as_of: str
    aircraft: int
    availability_today: float
    availability_7d: float
    availability_30d: float
    by_availability_state: dict[str, int]
    by_health_state: dict[str, int]
    open_advisories: dict[str, int]
    readiness_proxy: float
    readiness_proxy_definition: str
    backlog: Backlog
    parts_at_risk: list[str]
    forecast_30d: dict[str, Any]
    alerts_open: int


class AvailabilityPoint(BaseModel):
    date: str
    availability: float
    scheduled_maintenance: int
    unscheduled_repair: int
    awaiting_spares: int
    awaiting_agency: int


class ForecastBand(BaseModel):
    date: str
    p10: float
    p50: float
    p90: float
    mean: float


class AvailabilityTrendResponse(BaseModel):
    history: list[AvailabilityPoint]
    forecast: list[ForecastBand]
    downtime_by_month: list[dict[str, Any]]
    definition: str


class HeatCell(BaseModel):
    system: str
    state: HealthState
    health_index: float
    driver: str | None


class HeatRow(BaseModel):
    aircraft: str
    state: HealthState
    availability_state: str
    health_index: float
    driver: str | None
    cells: list[HeatCell]


class SystemRef(BaseModel):
    code: str
    name: str


class HeatGridResponse(BaseModel):
    systems: list[SystemRef]
    rows: list[HeatRow]


class AircraftListItem(BaseModel):
    id: str
    base: str
    state: HealthState
    availability_state: str
    health_index: float
    driver: str | None
    open_advisories: int
    top_priority: str | None
    total_flight_hours: float
    utilisation_flights_per_day: float


class TwinComponent(BaseModel):
    slot: int
    id: str
    aircraft: str
    type: str
    name: str
    criticality: int
    serial: str
    state: HealthState
    hi: float
    risk14: float
    risk30: float
    rul: Quantiles
    anomaly: float
    anomaly_sustained: bool
    work_order: str | None


class TwinSystem(BaseModel):
    code: str
    name: str
    state: HealthState
    health_index: float
    driver: str | None
    components: list[TwinComponent]


class AircraftDetailResponse(BaseModel):
    aircraft: dict[str, Any]
    as_of: str
    replay: bool
    state: HealthState
    availability_state: str
    health_index: float
    driver: str | None
    systems: list[TwinSystem]
    advisories: list[AdvisoryResponse]
    work_orders: list[dict[str, Any]]
    timeline: list[dict[str, Any]]
    availability_90d: list[dict[str, Any]]
    tasks: list[dict[str, Any]]


class SensorSeries(BaseModel):
    name: str
    unit: str
    direction: int
    values: list[float | None]
    normalised: list[float | None]
    cleaned: list[int]


class ComponentHealthResponse(BaseModel):
    assessment: dict[str, Any] | None = None
    component: dict[str, Any]
    as_of: str
    replay: bool
    dates: list[str]
    sensors: list[SensorSeries]
    ambient: list[float | None]
    health_index: list[float]
    replay_dates: list[str]
    risk14: list[float]
    risk30: list[float]
    rul: list[Quantiles]
    anomaly: list[float]
    anomaly_alert: list[bool]
    anomaly_threshold: float
    advisory: AdvisoryResponse | None
    state: HealthState
    history: list[dict[str, Any]]
    projection: dict[str, Any]
    simulation_truth: dict[str, Any] | None


class WorkOrderCreateRequest(BaseModel):
    as_of: date | None = None
    component_id: str = Field(min_length=3, max_length=64)
    advisory_id: str | None = Field(default=None, max_length=96)
    agency_id: str | None = Field(default=None, max_length=16)
    planned_start: date
    notes: str = Field(default="", max_length=500)


class WorkOrderRescheduleRequest(BaseModel):
    planned_start: date
    agency_id: str = Field(max_length=16)
    expected_version: int = Field(ge=1)


class WorkOrderUpdateRequest(BaseModel):
    status: Literal["in_progress", "completed", "cancelled"]
    as_of: date | None = None
    expected_version: int = Field(ge=1)


class PlannedWorkOrderResponse(BaseModel):
    id: str
    advisory_id: str | None
    aircraft: str
    component_id: str | None
    agency_id: str
    part: str | None
    title: str
    planned_start: str
    duration_days: float
    status: str
    priority: str | None
    impact: dict[str, Any]
    notes: str
    created_by: str
    created_at: str
    version: int
    source: str = "planned"


class WorkOrdersResponse(BaseModel):
    as_of: str
    recorded: list[dict[str, Any]]
    planned: list[PlannedWorkOrderResponse]
    kpis: dict[str, Any]


class ScheduleResponse(BaseModel):
    from_: str = Field(alias="from")
    to: str
    today: str
    agencies: list[dict[str, Any]]
    bars: list[dict[str, Any]]
    tasks_due: list[dict[str, Any]]

    model_config = {"populate_by_name": True}


class InventoryItem(BaseModel):
    part_number: str
    description: str
    system: str
    criticality: int
    unit_cost: int
    repairable: bool
    on_hand: int
    reserved: int
    available: int
    on_order: int
    next_receipt: str | None
    next_receipt_in_days: int | None
    lead_time_days: int
    reorder_level: int
    demand: dict[str, dict[str, float]]
    status: Literal["ok", "at_risk", "short", "print"]
    additive_printable: bool = False
    competing_components: list[str]


class DemandForecastResponse(BaseModel):
    part_number: str
    horizon_days: int
    expected: float
    p10: float
    p90: float
    predicted_failure_demand: float
    scheduled_demand: int
    baseline_moving_average: float
    supply_within_horizon: int
    shortfall_probability: float
    contributors: list[dict[str, Any]]
    method: str


class FleetAlertResponse(BaseModel):
    key: str
    type: str
    severity: Literal["critical", "warning", "info"]
    title: str
    message: str
    aircraft: str | None
    component_id: str | None
    advisory_id: str | None
    created_on: str
    acknowledged_by: str | None
    acknowledged_at: str | None


class FleetScenarioRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: Literal[
        "schedule_maintenance", "spare_unavailable", "early_replacement", "extra_capacity"
    ]
    params: dict[str, Any] = {}
    horizon_days: int = Field(default=30, ge=7, le=60)
    runs: int = Field(default=300, ge=50, le=500)
    seed: int = Field(default=7, ge=0, le=1_000_000)


class FleetScenarioResponse(BaseModel):
    id: str
    engine_run_id: str
    name: str
    kind: str
    params: dict[str, Any]
    horizon_days: int
    runs: int
    seed: int
    results: dict[str, Any]
    created_by: str
    created_at: str


class IngestRequest(BaseModel):
    source: str = Field(default="health_monitoring", max_length=64)
    readings: list[dict[str, Any]] = Field(min_length=1, max_length=5000)


class IngestBatchResponse(BaseModel):
    id: str
    source: str
    accepted: int
    rejected: int
    errors: list[dict[str, Any]]
    actor: str
    created_at: str


class DataSourcesResponse(BaseModel):
    integration: dict[str, Any]
    batches: list[IngestBatchResponse]
    ingested_readings: int


class TasksResponse(BaseModel):
    tasks: list[dict[str, Any]]


class PartRequestResponse(BaseModel):
    received_quantity: int = 0
    id: str
    work_order_id: str
    aircraft: str
    component_id: str | None
    component_name: str
    part: str
    description: str
    quantity: int
    needed_by: str
    status: Literal["open", "reserved", "ordered", "received", "cancelled"]
    eta: str | None
    note: str
    available_now: int
    lead_time_days: int
    earliest_order_arrival: str
    additive_printable: bool = False
    at_risk: bool
    updated_by: str
    updated_at: str
    version: int


class PartRequestUpdateRequest(BaseModel):
    as_of: date | None = None
    received_quantity: int | None = Field(default=None, ge=0)
    status: Literal["reserved", "ordered", "received", "cancelled"]
    eta: date | None = None
    note: str = Field(default="", max_length=300)
    expected_version: int = Field(ge=1)


class CannibalizeGrounded(BaseModel):
    aircraft: str
    state: str
    base: str
    waiting_for: list[str]
    role: Literal["recipient", "donor", "blocked", "other"]


class CannibalizeSwap(BaseModel):
    swap: int
    part_number: str
    component_type: str
    component_name: str
    donor: str
    donor_component: str
    donor_health_index: float
    recipient: str
    recipient_component: str | None
    work_order: str
    labor_hours: float
    cross_base: bool
    supply_wait_avoided_days: float
    donor_new_wait_days: float
    text: str


class CannibalizeStep(BaseModel):
    step: int
    action: Literal["remove", "transfer", "install"]
    aircraft: str
    component_id: str | None
    part_number: str
    component_name: str
    labor_hours: float
    swap: int


class CannibalizeHangarQueen(BaseModel):
    aircraft: str
    components_removed: list[str]


class CannibalizeForge(BaseModel):
    aircraft: str
    part_number: str
    component_name: str
    work_order: str
    print_days: int


class CannibalizeUnmet(BaseModel):
    aircraft: str
    part_number: str
    component_name: str
    work_order: str
    supply_wait_days: float
    reason: str


class CannibalizeVerification(BaseModel):
    no_unit_used_twice: bool
    types_match: bool
    donors_grounded: bool
    donors_not_unblocked: bool
    recipients_fully_covered: bool
    greedy_unblocked: int
    greedy_labor_hours: float
    optimal_unblocked: int | None
    optimal_labor_hours: float | None
    greedy_is_optimal: bool | None
    plan_source: Literal["greedy", "exact"]
    exact_method: str


class CannibalizeStrategyResponse(BaseModel):
    as_of: str
    replay: bool
    fleet_size: int
    available_now: int
    grounded: list[CannibalizeGrounded]
    aircraft_unblocked: list[str]
    available_after_repairs: int
    total_labor_hours: float
    swaps: list[CannibalizeSwap]
    sequence: list[CannibalizeStep]
    hangar_queens: list[CannibalizeHangarQueen]
    forge: list[CannibalizeForge]
    unmet: list[CannibalizeUnmet]
    verification: CannibalizeVerification
    days_with_blocked_aircraft: list[str]
    method: str
    assumptions: list[str]


class AssistantMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AssistantContext(BaseModel):
    as_of: date | None = None
    aircraft_id: str | None = Field(default=None, pattern=r"^(?:AC-\d{3}|REG-[a-f0-9]{20})$")
    component_id: str | None = Field(default=None, max_length=40)
    advisory_id: str | None = Field(default=None, max_length=80)
    part_number: str | None = Field(default=None, max_length=20)
    scenario_id: str | None = Field(default=None, max_length=40)


class AssistantChatRequest(BaseModel):
    messages: list[AssistantMessage] = Field(min_length=1, max_length=30)
    context: AssistantContext = AssistantContext()


class AssistantToolCall(BaseModel):
    name: str
    arguments: dict[str, Any]
    ok: bool
    error: str | None = None


class AssistantCitation(BaseModel):
    id: str
    kind: str
    label: str
    href: str
    cited: bool = False


class AssistantChatResponse(BaseModel):
    answer_mode: str = "model"
    reply: str
    tool_calls: list[AssistantToolCall]
    artifacts: list[dict[str, Any]]
    citations: list[AssistantCitation]
    warnings: list[str]
    context: AssistantContext
    model: str
    data_label: str


class AssistantStatusResponse(BaseModel):
    enabled: bool
    available: bool
    model: str | None
    detail: str
    can_run_scenarios: bool
