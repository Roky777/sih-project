from celery import Celery  # type: ignore[import-untyped]
from celery.signals import heartbeat_sent  # type: ignore[import-untyped]

from fleet_maintenance.logging_config import configure_logging
from fleet_maintenance.settings import get_settings
from fleet_maintenance.workers.health import record_heartbeat

configure_logging()


def worker_heartbeat(**kwargs: object) -> None:
    record_heartbeat("worker")


heartbeat_sent.connect(worker_heartbeat, weak=False)

settings = get_settings()
app = Celery(
    "fleet_maintenance",
    broker=settings.broker_url,
    backend=settings.result_backend,
    include=[
        "fleet_maintenance.workers.planning_tasks",
        "fleet_maintenance.workers.simulation_tasks",
        "fleet_maintenance.workers.job_tasks",
    ],
)
app.conf.update(
    task_track_started=True,
    task_time_limit=settings.job_lease_seconds - 1,
    task_soft_time_limit=settings.job_lease_seconds - 5,
    task_acks_late=True,
    task_ignore_result=True,
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True,
    worker_cancel_long_running_tasks_on_connection_loss=True,
    worker_enable_remote_control=False,
    task_publish_retry=True,
    broker_transport_options={"confirm_publish": True},
)
