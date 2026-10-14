"""Fleet-health workspace endpoints (docs/plan.md section 14), all on synthetic data.

Roles follow the decision flow: maintenance engineers review advisories, maintenance supervisors
(and planners) schedule work, logistics secures parts, fleet managers test scenarios. Supervisors
can act at every step and request engine runs; viewers read only.
"""

from collections.abc import Callable
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from fleet_maintenance.api.dependencies import (
    Actor,
    current_actor,
    require_supervisor,
)
from fleet_maintenance.domain.contracts.fleet_health import (
    AdvisoryResponse,
    AdvisoryUpdateRequest,
    AircraftDetailResponse,
    AircraftListItem,
    AvailabilityTrendResponse,
    CannibalizeStrategyResponse,
    ComponentHealthResponse,
    DataSourcesResponse,
    DemandForecastResponse,
    EngineRunRequest,
    EngineStatusResponse,
    FleetAlertResponse,
    FleetScenarioRequest,
    FleetScenarioResponse,
    FleetSummaryResponse,
    HeatGridResponse,
    IngestBatchResponse,
    IngestRequest,
    InventoryItem,
    PartRequestResponse,
    PartRequestUpdateRequest,
    PlannedWorkOrderResponse,
    ScheduleResponse,
    TasksResponse,
    WorkOrderCreateRequest,
    WorkOrderRescheduleRequest,
    WorkOrdersResponse,
    WorkOrderUpdateRequest,
)
from fleet_maintenance.persistence.database import get_session
from fleet_maintenance.persistence.models import FleetIngestedReading
from fleet_maintenance.science.fleet import decisions
from fleet_maintenance.services import fleet_health as service

router = APIRouter(prefix="/fleet-health", tags=["fleet-health"])
AsOf = Annotated[date | None, Query(description="Replay date within the last 120 days")]


def _guard[T](call: Callable[[], T]) -> T:
    try:
        return call()
    except service.EngineNotReady as exc:
        raise HTTPException(503, str(exc)) from None
    except service.FleetConflict as exc:
        raise HTTPException(409, str(exc)) from None
    except LookupError as exc:
        raise HTTPException(404, f"Not found: {exc}") from None
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None


def _require(actor: Actor, roles: set[str], label: str) -> Actor:
    if actor.role not in roles | {"supervisor"}:
        raise HTTPException(403, f"{label} role required")
    return actor


REVIEWERS = {"engineer", "planner"}
SCHEDULERS = {"planner"}
LOGISTICS = {"logistics"}
SCENARIO_USERS = {"fleet_manager", "planner"}
DATA_OPERATORS = {"engineer", "planner"}


@router.get("/engine", response_model=EngineStatusResponse)
def engine(session: Session = Depends(get_session)) -> dict[str, Any]:
    status = service.engine_status(session)
    if status["ready"]:
        try:
            bundle = service.active_bundle(session)
            status["replay_from"] = bundle.date_of(bundle.replay_start_day).isoformat()
            status["replay_to"] = bundle.as_of.isoformat()
            status["scripted"] = bundle.records["scripted"]
        except service.EngineNotReady:
            status["ready"] = False
    return status


@router.post("/engine/runs", response_model=EngineStatusResponse, status_code=202)
def request_run(
    body: EngineRunRequest,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    require_supervisor(actor)
    service.request_engine_run(session, actor.id, body.seed)
    return service.engine_status(session)


@router.get("/engine/cannibalize-strategy", response_model=CannibalizeStrategyResponse)
def cannibalize_strategy(
    as_of: AsOf = None, session: Session = Depends(get_session)
) -> dict[str, Any]:
    """Part swaps between grounded aircraft that unblock the most aircraft for the least
    labour. Read-only: it proposes a plan and records nothing."""
    return _guard(lambda: service.cannibalize_strategy(session, as_of))


@router.get("/summary", response_model=FleetSummaryResponse)
def summary(as_of: AsOf = None, session: Session = Depends(get_session)) -> dict[str, Any]:
    return _guard(lambda: service.summary(session, as_of))


@router.get("/availability/trend", response_model=AvailabilityTrendResponse)
def trend(as_of: AsOf = None, session: Session = Depends(get_session)) -> dict[str, Any]:
    return _guard(lambda: service.availability_trend(session, as_of))


@router.get("/heatgrid", response_model=HeatGridResponse)
def heatgrid(as_of: AsOf = None, session: Session = Depends(get_session)) -> dict[str, Any]:
    def build() -> dict[str, Any]:
        bundle = service.active_bundle(session)
        offset = service.offset_for(bundle, as_of)
        current = (
            service.overlay(session)
            if offset == bundle.replay_offset(None)
            else decisions.EMPTY_OVERLAY
        )
        return decisions.heat_grid(bundle, offset, current)

    return _guard(build)


@router.get("/aircraft", response_model=list[AircraftListItem])
def aircraft(as_of: AsOf = None, session: Session = Depends(get_session)) -> list[dict[str, Any]]:
    return _guard(lambda: service.aircraft_list(session, as_of))


@router.get("/aircraft/{aircraft_id}", response_model=AircraftDetailResponse)
def aircraft_detail(
    aircraft_id: str, as_of: AsOf = None, session: Session = Depends(get_session)
) -> dict[str, Any]:
    return _guard(lambda: service.aircraft_detail(session, aircraft_id, as_of))


@router.get("/components/{component_id}", response_model=ComponentHealthResponse)
def component(
    component_id: str,
    as_of: AsOf = None,
    days: Annotated[int, Query(ge=30, le=365)] = 180,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return _guard(lambda: service.component_health(session, component_id, as_of, days))


@router.get("/advisories", response_model=list[AdvisoryResponse])
def advisories(
    as_of: AsOf = None,
    priority: str | None = None,
    status: str | None = None,
    system: str | None = None,
    spare_status: str | None = None,
    aircraft: str | None = None,
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    _, _, items = _guard(lambda: service.advisories(session, as_of))
    filters = {
        "priority": priority,
        "status": status,
        "system": system,
        "spare_status": spare_status,
        "aircraft": aircraft,
    }

    def keep(item: dict[str, Any]) -> bool:
        values = {
            "priority": item["priority"]["level"],
            "status": item["status"],
            "system": item["system"],
            "spare_status": item["spare"]["status"],
            "aircraft": item["aircraft"],
        }
        return all(
            not wanted or values[key] in wanted.split(",") for key, wanted in filters.items()
        )

    return [item for item in items if keep(item)]


@router.patch("/advisories/{advisory_id}", response_model=AdvisoryResponse)
def update_advisory(
    advisory_id: str,
    body: AdvisoryUpdateRequest,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    if body.as_of is not None:
        raise HTTPException(409, "History/replay is read-only; exit replay first")
    _require(actor, REVIEWERS, "Maintenance engineer or supervisor")
    if body.status == "scheduled":
        _require(actor, SCHEDULERS, "Maintenance supervisor")
    return _guard(
        lambda: service.update_advisory(
            session, advisory_id, body.status, body.reason, body.expected_status, actor.id
        )
    )


@router.get("/work-orders", response_model=WorkOrdersResponse)
def work_orders(
    status: str | None = None,
    aircraft: str | None = None,
    agency: str | None = None,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    return _guard(lambda: service.work_orders(session, status, aircraft, agency))


@router.post("/work-orders", response_model=PlannedWorkOrderResponse, status_code=201)
def create_work_order(
    body: WorkOrderCreateRequest,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    if body.as_of is not None:
        raise HTTPException(409, "History/replay is read-only; exit replay first")
    _require(actor, SCHEDULERS, "Maintenance supervisor")
    result = _guard(
        lambda: service.create_work_order(
            session,
            actor.id,
            body.component_id,
            body.agency_id,
            body.planned_start,
            body.advisory_id,
            body.notes,
        )
    )
    return {**result, "planned_start": str(result["planned_start"])}


@router.patch("/work-orders/{work_order_id}", response_model=PlannedWorkOrderResponse)
def update_work_order(
    work_order_id: str,
    body: WorkOrderUpdateRequest,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    if body.as_of is not None:
        raise HTTPException(409, "History/replay is read-only; exit replay first")
    _require(actor, SCHEDULERS, "Maintenance supervisor")
    result = _guard(
        lambda: service.update_work_order(
            session, work_order_id, body.status, body.expected_version, actor.id
        )
    )
    return {**result, "planned_start": str(result["planned_start"])}


@router.get("/maintenance/schedule", response_model=ScheduleResponse, response_model_by_alias=True)
def schedule(session: Session = Depends(get_session)) -> dict[str, Any]:
    def build() -> dict[str, Any]:
        bundle = service.active_bundle(session)
        return decisions.bay_schedule(bundle, service.overlay(session))

    return _guard(build)


@router.get("/maintenance/tasks", response_model=TasksResponse)
def tasks(session: Session = Depends(get_session)) -> dict[str, Any]:
    return _guard(lambda: {"tasks": decisions.scheduled_tasks(service.active_bundle(session))})


@router.get("/inventory", response_model=list[InventoryItem])
def inventory(as_of: AsOf = None, session: Session = Depends(get_session)) -> list[dict[str, Any]]:
    def build() -> list[dict[str, Any]]:
        bundle = service.active_bundle(session)
        offset = service.offset_for(bundle, as_of)
        current = (
            service.overlay(session)
            if offset == bundle.replay_offset(None)
            else decisions.EMPTY_OVERLAY
        )
        return decisions.inventory(bundle, offset, current)

    return _guard(build)


@router.get("/inventory/{part_number}/forecast", response_model=DemandForecastResponse)
def demand(
    part_number: str,
    horizon: Annotated[int, Query(ge=7, le=120)] = 30,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    def build() -> dict[str, Any]:
        bundle = service.active_bundle(session)
        if part_number not in bundle.part_index:
            raise LookupError(part_number)
        return decisions.demand_forecast(
            bundle, bundle.replay_offset(None), part_number, horizon, service.overlay(session)
        )

    return _guard(build)


@router.get("/alerts", response_model=list[FleetAlertResponse])
def alerts(session: Session = Depends(get_session)) -> list[dict[str, Any]]:
    return _guard(lambda: service.alerts(session))


@router.post("/alerts/{alert_key}/acknowledge", response_model=list[FleetAlertResponse])
def acknowledge(
    alert_key: str, session: Session = Depends(get_session), actor: Actor = Depends(current_actor)
) -> list[dict[str, Any]]:
    if actor.role == "viewer":
        raise HTTPException(403, "Viewers cannot acknowledge alerts")

    def run() -> list[dict[str, Any]]:
        service.acknowledge_alert(session, alert_key, actor.id)
        return service.alerts(session)

    return _guard(run)


@router.get("/kpis")
def kpis(session: Session = Depends(get_session)) -> dict[str, Any]:
    return _guard(lambda: decisions.reliability_kpis(service.active_bundle(session)))


@router.get("/models")
def models(session: Session = Depends(get_session)) -> dict[str, Any]:
    def build() -> dict[str, Any]:
        bundle = service.active_bundle(session)
        return {
            "run_id": service.run_id_of(bundle),
            "manifest": bundle.manifest,
            "evaluation": bundle.evaluation,
            "priority_rule": decisions.priority_config(),
        }

    return _guard(build)


@router.get("/scenarios", response_model=list[FleetScenarioResponse])
def scenarios(session: Session = Depends(get_session)) -> list[dict[str, Any]]:
    return _guard(lambda: service.scenarios(session))


@router.post("/scenarios/run", response_model=FleetScenarioResponse, status_code=201)
def run_scenario(
    body: FleetScenarioRequest,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    _require(actor, SCENARIO_USERS, "Fleet manager or supervisor")
    return _guard(
        lambda: service.run_scenario(
            session,
            actor.id,
            body.name,
            body.kind,
            body.params,
            body.horizon_days,
            body.runs,
            body.seed,
        )
    )


@router.get("/data/sources", response_model=DataSourcesResponse)
def data_sources(session: Session = Depends(get_session)) -> dict[str, Any]:
    from sqlalchemy import func, select

    def build() -> dict[str, Any]:
        bundle = service.active_bundle(session)
        return {
            "integration": bundle.integration,
            "batches": service.ingest_batches(session),
            "ingested_readings": int(
                session.scalar(select(func.count()).select_from(FleetIngestedReading)) or 0
            ),
        }

    return _guard(build)


@router.post("/ingest/sensor-readings", response_model=IngestBatchResponse, status_code=201)
def ingest(
    body: IngestRequest,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    _require(actor, DATA_OPERATORS, "Maintenance engineer or supervisor")
    return _guard(lambda: service.ingest(session, actor.id, body.source, body.readings))


@router.get("/part-requests", response_model=list[PartRequestResponse])
def part_requests(
    include_closed: bool = False, session: Session = Depends(get_session)
) -> list[dict[str, Any]]:
    return _guard(lambda: service.part_requests(session, include_closed))


@router.patch("/part-requests/{request_id}", response_model=PartRequestResponse)
def update_part_request(
    request_id: str,
    body: PartRequestUpdateRequest,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    if body.as_of is not None:
        raise HTTPException(409, "History/replay is read-only; exit replay first")
    _require(actor, LOGISTICS, "Logistics")
    return _guard(
        lambda: service.update_part_request(
            session,
            request_id,
            body.status,
            body.eta,
            body.note,
            body.expected_version,
            actor.id,
            body.received_quantity,
        )
    )


class ReturnToServiceRequest(BaseModel):
    note: str = Field(min_length=1, max_length=300)
    action: Literal["execute", "verify"] = "verify"


@router.post(
    "/work-orders/recorded/{work_order_id}/return-to-service", response_model=WorkOrdersResponse
)
def return_to_service(
    work_order_id: str,
    body: ReturnToServiceRequest,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    _require(actor, SCHEDULERS, "Maintenance supervisor")

    _require(actor, {"supervisor"}, "Maintenance supervisor")

    def run() -> dict[str, Any]:
        service.return_to_service(session, work_order_id, actor.id, body.note, body.action)
        return service.work_orders(session, None, None, None)

    return _guard(run)


@router.patch("/work-orders/{work_order_id}/schedule", response_model=PlannedWorkOrderResponse)
def reschedule_work_order(
    work_order_id: str,
    body: WorkOrderRescheduleRequest,
    session: Session = Depends(get_session),
    actor: Actor = Depends(current_actor),
) -> dict[str, Any]:
    _require(actor, SCHEDULERS, "Maintenance supervisor")
    result = _guard(
        lambda: service.reschedule_work_order(
            session,
            work_order_id,
            body.planned_start,
            body.agency_id,
            body.expected_version,
            actor.id,
        )
    )
    return {**result, "planned_start": str(result["planned_start"])}
