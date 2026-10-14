from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from fleet_maintenance.api.errors import RequestContextMiddleware, install_error_handlers
from fleet_maintenance.api.router import router
from fleet_maintenance.logging_config import configure_logging
from fleet_maintenance.persistence.database import SessionLocal, create_schema
from fleet_maintenance.services.fleet_health import backfill_part_requests, ensure_engine_run
from fleet_maintenance.services.records import seed_demo
from fleet_maintenance.settings import get_settings


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    settings = get_settings()
    settings.artifact_root.mkdir(parents=True, exist_ok=True)
    if settings.auto_create_schema:
        create_schema()
    if settings.auto_seed_demo:
        with SessionLocal() as session:
            seed_demo(session)
        with SessionLocal() as session:
            # Queue the synthetic fleet-health engine on a fresh installation.
            ensure_engine_run(session)
            backfill_part_requests(session)
            from fleet_maintenance.services.cases import backfill

            backfill(session)
    yield


app = FastAPI(title="AeroCare Maintenance Decision API", version="0.1.0", lifespan=lifespan)
app.add_middleware(RequestContextMiddleware)
install_error_handlers(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router, prefix=get_settings().api_prefix)
