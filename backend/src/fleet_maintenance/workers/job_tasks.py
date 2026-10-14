from typing import cast

from sqlalchemy.exc import OperationalError

from fleet_maintenance.persistence.database import SessionLocal
from fleet_maintenance.science.scheduling.solver import solve
from fleet_maintenance.science.simulation.replications import run_scenario
from fleet_maintenance.services.assessments import assess
from fleet_maintenance.services.jobs import (
    JobConflict,
    accept_result,
    claim_job,
    confirm_cancellation,
    fail_attempt,
    retry_transient,
)
from fleet_maintenance.services.planning import planning_snapshot, propose_plan, restore_source
from fleet_maintenance.services.scenarios import run_saved_scenario, scenario_source
from fleet_maintenance.workers.celery_app import app


@app.task(name="events.observe", ignore_result=True)  # type: ignore[untyped-decorator]
def observe(_: dict[str, object]) -> None:
    """Consume a confirmed notification; PostgreSQL remains authoritative."""


@app.task(name="jobs.execute", ignore_result=True)  # type: ignore[untyped-decorator]
def execute(job_id: str) -> None:
    with SessionLocal() as session:
        try:
            job = claim_job(session, job_id)
        except JobConflict:
            session.rollback()
            return
        attempt = job.attempt
        kind = job.kind
        payload = job.input_payload
        session.rollback()
        try:
            # Cooperative checkpoint before expensive native calculation; final acceptance
            # checks cancellation again. Native work is bounded by the solver/task limits.
            session.refresh(job)
            cancelled = job.state == "cancellation_requested"
            session.rollback()
            if cancelled:
                confirm_cancellation(session, job_id, attempt)
                return
            result: dict[str, object]
            if kind == "availability_study":
                from fleet_maintenance.verification.availability_study import (
                    VERSION,
                    definition_hash,
                    run_study,
                )

                if (
                    payload.get("version") != VERSION
                    or payload.get("definition_sha256") != definition_hash()
                ):
                    raise ValueError("Study definition changed; submit a fresh study")
                result = {"study": run_study()}
            elif kind == "planning":
                if not payload:
                    payload = planning_snapshot(session)
                    session.rollback()
                computed_plan = solve(restore_source(payload))
                result = {
                    "plan_id": propose_plan(
                        session,
                        f"plan-for-{job_id}",
                        commit=False,
                        snapshot=payload,
                        computed_result=computed_plan,
                    ).id
                }
            elif kind == "simulation":
                scenario_id = str(payload["scenario_id"])
                from fleet_maintenance.persistence.models import Scenario

                computed_simulation = run_scenario(
                    scenario_source(cast(dict[str, object], payload["assumptions"]))
                )
                saved = session.get(Scenario, scenario_id)
                if (
                    saved is None
                    or saved.version != payload.get("version")
                    or saved.assumptions != payload.get("assumptions")
                ):
                    raise ValueError("Scenario inputs changed after submission")
                result = {
                    "run_id": run_saved_scenario(
                        session,
                        scenario_id,
                        run_id=f"sim-for-{job_id}",
                        commit=False,
                        computed_result=computed_simulation,
                    ).id
                }
            elif kind == "plan_simulation":
                from fleet_maintenance.services.plan_simulation import calculate, save_comparison

                computed_comparison = calculate(payload)
                result = {
                    "run_id": save_comparison(
                        session, payload, computed_comparison, f"sim-for-{job_id}"
                    ).id
                }
            elif kind == "fleet_assessment":
                from fleet_maintenance.services.ingestion import execute_fleet

                result = execute_fleet(session, payload, job_id)
            elif kind == "fleet_engine":
                from fleet_maintenance.artifacts.storage import artifact_directory
                from fleet_maintenance.science.fleet.engine import run_engine
                from fleet_maintenance.services.fleet_health import complete_engine_run
                from fleet_maintenance.settings import get_settings

                engine_run_id = str(payload["engine_run_id"])
                directory = artifact_directory(
                    get_settings().artifact_root, f"fleet-engine/{engine_run_id}"
                )
                # The engine runs outside any database transaction; its bundle is registered
                # only after every file and the manifest are written.
                computed_engine = run_engine(
                    directory, engine_run_id, int(str(payload.get("seed", 42)))
                )
                complete_engine_run(session, engine_run_id, computed_engine)
                result = {"engine_run_id": engine_run_id, "as_of": computed_engine["as_of"]}
            elif kind == "assessment":
                import numpy as np

                from fleet_maintenance.artifacts.storage import artifact_directory, verify_hashes
                from fleet_maintenance.persistence.models import ImportRecord, ModelRegistration
                from fleet_maintenance.science.prediction.inference import predict_history
                from fleet_maintenance.settings import get_settings

                history = session.get(ImportRecord, str(payload["import_id"]))
                model = session.get(ModelRegistration, str(payload["model_id"]))
                if history is None or model is None:
                    raise ValueError("Assessment inputs unavailable")
                cutoff = int(str(payload["cutoff_cycle"]))
                rows = history.rows[:cutoff]
                minimum = int(str(model.manifest["minimum_history_cycles"]))
                directory = artifact_directory(
                    get_settings().artifact_root, model.artifact_directory
                )
                hashes = model.hashes
                session.rollback()
                computed_prediction = None
                from fleet_maintenance.science.data.eligibility import history_findings

                if not history_findings(rows, minimum, model.manifest):
                    verify_hashes(directory, hashes)
                    computed_prediction = predict_history(
                        directory,
                        np.asarray([row["values"] for row in rows], dtype=np.float64),
                        cutoff,
                    )
                result = {
                    "assessment_id": assess(
                        session,
                        str(payload["import_id"]),
                        str(payload["model_id"]),
                        int(str(payload["cutoff_cycle"])),
                        assessment_id=f"asm-for-{job_id}",
                        commit=False,
                        computed_prediction=computed_prediction,
                    ).id
                }
            else:
                fail_attempt(session, job_id, attempt, "unsupported_job_kind")
                return
            accept_result(session, job_id, attempt, result)
        except (OperationalError, TimeoutError) as exc:
            session.rollback()
            try:
                retry_transient(session, job_id, attempt, type(exc).__name__)
            except JobConflict:
                session.rollback()
        except (KeyError, LookupError, ValueError):
            session.rollback()
            fail_attempt(session, job_id, attempt, "invalid_job_input")
        except JobConflict:
            session.rollback()
            session.refresh(job)
            if job.state == "cancellation_requested" and job.attempt == attempt:
                confirm_cancellation(session, job_id, attempt)
        except Exception:
            session.rollback()
            try:
                fail_attempt(session, job_id, attempt, "worker_execution_failed")
            except JobConflict:
                session.rollback()
            raise
