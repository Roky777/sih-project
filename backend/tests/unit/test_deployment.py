import copy
import json
import os
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from fleet_maintenance.deployment import backup_report, compose_report, services_report
from fleet_maintenance.workers import health


def configuration() -> dict:
    secret = "Test-only.7aB9cD1eF3gH5jK8mN2p"
    image = "sha256:" + "a" * 64
    env = {
        "FLEET_ENVIRONMENT": "production",
        "FLEET_AUTHENTICATION_MODE": "session",
        "FLEET_SECURE_COOKIES": "true",
        "FLEET_AUTO_CREATE_SCHEMA": "false",
        "FLEET_AUTO_SEED_DEMO": "false",
        "FLEET_ALLOWED_ORIGINS": '["https://fleet.example.invalid"]',
        "FLEET_DATABASE_URL": f"postgresql+psycopg://fleet:{secret}@postgres:5432/fleet",
        "FLEET_BROKER_URL": f"amqp://fleet:{secret}@rabbitmq:5672//",
    }
    services = {
        name: {
            "image": image,
            "restart": "unless-stopped",
            "read_only": True,
            "cap_drop": ["ALL"],
            "healthcheck": {"test": ["CMD", "check"]},
            "logging": {"driver": "local", "options": {"max-size": "10m", "max-file": "5"}},
            "environment": copy.deepcopy(env),
        }
        for name in ("postgres", "rabbitmq", "api", "worker", "outbox", "web")
    }
    services["postgres"]["environment"] = {"POSTGRES_USER": "fleet", "POSTGRES_PASSWORD": secret}
    services["rabbitmq"]["environment"] = {
        "RABBITMQ_DEFAULT_USER": "fleet",
        "RABBITMQ_DEFAULT_PASS": secret + "Broker",
    }
    for name in ("api", "worker", "outbox"):
        services[name]["environment"]["FLEET_BROKER_URL"] = (
            f"amqp://fleet:{secret}Broker@rabbitmq:5672//"
        )
    services["web"]["environment"] = {"DEPLOYMENT_DOMAIN": "fleet.example.invalid"}
    services["web"]["ports"] = [
        {"target": 80, "published": "80"},
        {"target": 443, "published": "443"},
    ]
    return {"services": services}


def test_production_configuration_accepts_pins_and_never_reports_secrets():
    config = configuration()
    assert compose_report(config)["ok"]
    config["services"]["api"]["environment"]["FLEET_DATABASE_URL"] = (
        "postgresql://private:secret@wrong/fleet"
    )
    result = compose_report(config)
    assert not result["ok"]
    assert "secret" not in json.dumps(result)
    assert "wrong" not in json.dumps(result)


@pytest.mark.parametrize(
    "mutation,code",
    [
        (
            lambda s: s["api"].update(ports=[{"target": 8000, "published": "8000"}]),
            "api.port.exposed",
        ),
        (lambda s: s["api"].update(image="application:latest"), "api.image.not_pinned"),
        (lambda s: s["worker"].update(image="sha256:" + "b" * 64), "application.images.differ"),
        (lambda s: s["outbox"].update(healthcheck={}), "outbox.healthcheck.missing"),
        (
            lambda s: s["api"]["environment"].update(FLEET_AUTHENTICATION_MODE="demo"),
            "api.FLEET_AUTHENTICATION_MODE.unsafe",
        ),
        (
            lambda s: s["api"]["environment"].update(
                FLEET_ALLOWED_ORIGINS='["https://other.invalid"]'
            ),
            "api.origins.mismatch",
        ),
        (
            lambda s: s["postgres"]["environment"].update(POSTGRES_PASSWORD="fleet"),
            "postgres.credential.weak",
        ),
    ],
)
def test_configuration_fails_closed(mutation, code):
    config = configuration()
    mutation(config["services"])
    assert code in compose_report(config)["issues"]


def test_service_monitor_detects_dead_unhealthy_and_missing_workers():
    rows = [
        {"Service": name, "State": "running", "Health": "healthy"}
        for name in configuration()["services"]
    ]
    assert services_report(rows)["ok"]
    rows[3]["Health"] = "unhealthy"
    assert "worker.not_healthy" in services_report(rows)["issues"]
    assert not services_report([])["ok"]


def test_heartbeat_rejects_stale_dead_and_corrupt_processes(tmp_path: Path, monkeypatch):
    path = tmp_path / "heartbeat.json"
    monkeypatch.setattr(health, "heartbeat_path", lambda component: path)
    health.record_heartbeat("worker")
    assert health.check_heartbeat("worker")
    path.write_text(json.dumps({"pid": os.getpid(), "time": time.time() - 90}))
    assert not health.check_heartbeat("worker")
    path.write_text(json.dumps({"pid": 999999999, "time": time.time()}))
    assert not health.check_heartbeat("worker")
    path.write_text("broken")
    assert not health.check_heartbeat("worker")


def test_backup_monitor_requires_complete_recent_metadata(tmp_path: Path):
    assert not backup_report(tmp_path, 93600)["ok"]
    folder = tmp_path / "completed"
    folder.mkdir()
    (folder / "database.dump").write_bytes(b"synthetic test dump")
    manifest = {"created_at": datetime.now(UTC).isoformat(), "files": {"database.dump": "test"}}
    (folder / "backup.json").write_text(json.dumps(manifest))
    assert backup_report(tmp_path, 93600)["ok"]
    manifest["created_at"] = (datetime.now(UTC) - timedelta(days=2)).isoformat()
    (folder / "backup.json").write_text(json.dumps(manifest))
    assert "backup.missing_or_overdue" in backup_report(tmp_path, 93600)["issues"]
    (folder / "backup.json").write_text("broken")
    assert "backup.manifest_invalid" in backup_report(tmp_path, 93600)["issues"]


def test_private_https_requires_loopback_and_exact_origin():
    config = configuration()
    web = config["services"]["web"]
    web["environment"]["DEPLOYMENT_DOMAIN"] = "localhost"
    web["ports"] = [
        {"target": 80, "published": "8080", "host_ip": "127.0.0.1"},
        {"target": 443, "published": "8443", "host_ip": "127.0.0.1"},
    ]
    for name in ("api", "worker", "outbox"):
        config["services"][name]["environment"]["FLEET_ALLOWED_ORIGINS"] = (
            '["https://localhost:18443"]'
        )
    assert compose_report(config)["ok"]
    web["ports"][1]["host_ip"] = "0.0.0.0"
    assert "web.private_ports.invalid" in compose_report(config)["issues"]
