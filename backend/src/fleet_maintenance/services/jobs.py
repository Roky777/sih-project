import os
import socket
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from fleet_maintenance.persistence.models import Job, JobAttempt, OutboxEvent
from fleet_maintenance.settings import get_settings


class JobConflict(Exception):
    pass


def _event(session: Session, job: Job, event_type: str) -> None:
    context = {
        key: value
        for key in ("component_id", "scope_component_id", "scenario_id", "plan_id")
        if isinstance(value := job.input_payload.get(key), str)
    }
    session.add(
        OutboxEvent(
            topic="application.job",
            payload={
                "event_type": event_type,
                "job_id": job.id,
                "kind": job.kind,
                "state": job.state,
                "attempt": job.attempt,
                **context,
            },
        )
    )


def _finish_attempt(session: Session, job: Job, state: str, code: str | None = None) -> None:
    # Existing pre-migration attempts have no fabricated historical row.
    record = session.get(JobAttempt, f"{job.id}:{job.attempt}")
    if record is not None and record.state == "running":
        record.state = state
        record.finished_at = datetime.now(UTC)
        record.outcome_code = code


def submit_job(
    session: Session,
    kind: str,
    input_payload: dict[str, object],
    *,
    owner: str = "demo-planner",
    commit: bool = True,
) -> Job:
    job = Job(
        id=f"job-{uuid.uuid4().hex}",
        kind=kind,
        state="queued",
        attempt=0,
        input_payload=input_payload,
        owner=owner,
    )
    session.add(job)
    _event(session, job, "job.queued")
    if commit:
        session.commit()
        session.refresh(job)
    else:
        session.flush()
    return job


def claim_job(session: Session, job_id: str) -> Job:
    job = session.scalar(
        select(Job)
        .where(Job.id == job_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if job is None:
        raise LookupError(job_id)
    if job.state != "queued":
        raise JobConflict(f"Job {job_id} is not queued.")
    job.attempt += 1
    job.state = "running"
    job.finished_at = None
    job.started_at = datetime.now(UTC)
    job.lease_expires_at = datetime.now(UTC) + timedelta(seconds=get_settings().job_lease_seconds)
    session.add(
        JobAttempt(
            id=f"{job.id}:{job.attempt}",
            job_id=job.id,
            number=job.attempt,
            worker_id=f"{socket.gethostname()}:{os.getpid()}",
            state="running",
            started_at=job.started_at,
            lease_expires_at=job.lease_expires_at,
        )
    )
    _event(session, job, "job.running")
    session.commit()
    session.refresh(job)
    return job


def accept_result(
    session: Session, job_id: str, attempt: int, result_payload: dict[str, object]
) -> Job:
    job = session.scalar(
        select(Job)
        .where(Job.id == job_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if job is None:
        raise LookupError(job_id)
    if job.state != "running" or job.attempt != attempt:
        raise JobConflict("The result belongs to a stale or ineligible attempt.")
    if job.lease_expires_at is not None:
        expiry = (
            job.lease_expires_at.replace(tzinfo=UTC)
            if job.lease_expires_at.tzinfo is None
            else job.lease_expires_at
        )
        if expiry <= datetime.now(UTC):
            raise JobConflict("The attempt lease expired.")
    _finish_attempt(session, job, "succeeded")
    job.result_payload = result_payload
    job.state = "succeeded"
    job.finished_at = datetime.now(UTC)
    job.lease_expires_at = None
    _event(session, job, "job.succeeded")
    session.commit()
    session.refresh(job)
    return job


def fail_attempt(session: Session, job_id: str, attempt: int, code: str) -> Job:
    job = session.scalar(
        select(Job)
        .where(Job.id == job_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if job is None:
        raise LookupError(job_id)
    if job.state not in {"running", "cancellation_requested"} or job.attempt != attempt:
        raise JobConflict("The failure belongs to a stale or ineligible attempt.")
    _finish_attempt(session, job, "failed", code)
    job.result_payload = {"error": code}
    job.state = "failed"
    job.finished_at = datetime.now(UTC)
    job.lease_expires_at = None
    _event(session, job, "job.failed")
    session.commit()
    session.refresh(job)
    return job


def retry_transient(session: Session, job_id: str, attempt: int, code: str) -> Job:
    """Bounded recorded retries. Queue delivery can repeat; business acceptance stays fenced."""
    job = session.scalar(
        select(Job)
        .where(Job.id == job_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if job is None or job.state != "running" or job.attempt != attempt:
        raise JobConflict("Transient failure belongs to a stale/ineligible attempt")
    if job.attempt >= get_settings().job_max_attempts:
        return fail_attempt(session, job_id, attempt, "transient_attempt_limit_exceeded")
    _finish_attempt(session, job, "interrupted", code)
    job.state = "queued"
    job.lease_expires_at = None
    _event(session, job, "job.requeued")
    session.commit()
    session.refresh(job)
    return job


def request_cancellation(session: Session, job_id: str) -> Job:
    job = session.scalar(
        select(Job)
        .where(Job.id == job_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if job is None:
        raise LookupError(job_id)
    if job.state == "queued":
        job.finished_at = datetime.now(UTC)
        job.state = "cancelled"
        _event(session, job, "job.cancelled")
    elif job.state == "running":
        job.state = "cancellation_requested"
        _event(session, job, "job.cancellation_requested")
    elif job.state not in {"cancellation_requested", "cancelled"}:
        raise JobConflict(f"Terminal job in state {job.state} cannot be cancelled.")
    session.commit()
    session.refresh(job)
    return job


def confirm_cancellation(session: Session, job_id: str, attempt: int) -> Job:
    job = session.scalar(
        select(Job)
        .where(Job.id == job_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if job is None:
        raise LookupError(job_id)
    if job.state != "cancellation_requested" or job.attempt != attempt:
        raise JobConflict("Cancellation confirmation is stale or ineligible.")
    _finish_attempt(session, job, "cancelled", "cancellation_confirmed")
    job.finished_at = datetime.now(UTC)
    job.lease_expires_at = None
    job.state = "cancelled"
    _event(session, job, "job.cancelled")
    session.commit()
    session.refresh(job)
    return job


def recover_attempt(session: Session, job_id: str, attempt: int) -> Job:
    job = session.scalar(
        select(Job)
        .where(Job.id == job_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if job is None:
        raise LookupError(job_id)
    if job.state != "running" or job.attempt != attempt:
        raise JobConflict("Only the current running attempt can be recovered.")
    _finish_attempt(session, job, "interrupted", "explicit_recovery")
    job.lease_expires_at = None
    job.state = "queued"
    _event(session, job, "job.requeued")
    session.commit()
    session.refresh(job)
    return job


def recover_expired(session: Session) -> int:
    now = datetime.now(UTC)
    jobs = list(
        session.scalars(
            select(Job)
            .where(
                Job.state.in_(["running", "cancellation_requested"]),
                Job.lease_expires_at < now,
            )
            .order_by(Job.id)
            .with_for_update(skip_locked=True)
            .limit(100)
        ).all()
    )
    for job in jobs:
        _finish_attempt(
            session,
            job,
            "cancelled" if job.state == "cancellation_requested" else "expired",
            "cancellation_lease_expired"
            if job.state == "cancellation_requested"
            else "lease_expired",
        )
        if job.state == "cancellation_requested":
            job.state = "cancelled"
            job.finished_at = now
        elif job.attempt >= get_settings().job_max_attempts:
            job.state = "failed"
            job.finished_at = now
            job.result_payload = {"error": "attempt_limit_exceeded"}
        else:
            job.state = "queued"
        job.lease_expires_at = None
        _event(session, job, "job.requeued" if job.state == "queued" else f"job.{job.state}")
    session.commit()
    return len(jobs)
