from fastapi import APIRouter, Depends

from fleet_maintenance.api.dependencies import current_actor
from fleet_maintenance.api.routes import (
    access,
    alerts,
    assessments,
    assistant,
    cases,
    components,
    demo,
    events,
    evidence,
    fleet,
    fleet_health,
    healthcheck,
    ingestion,
    inventory,
    jobs,
    plans,
    registration,
    research,
    resources,
    scenarios,
    telemetry,
    work,
    workspace,
)

router = APIRouter()
router.include_router(healthcheck.router)
router.include_router(access.router)
for route in (
    fleet.router,
    registration.router,
    telemetry.router,
    demo.router,
    components.router,
    cases.router,
    assessments.router,
    alerts.router,
    plans.router,
    resources.router,
    inventory.router,
    ingestion.router,
    scenarios.router,
    jobs.router,
    events.router,
    work.router,
    workspace.router,
    evidence.router,
    research.router,
    fleet_health.router,
    assistant.router,
):
    router.include_router(route, dependencies=[Depends(current_actor)])
