"""Read-only deployment checks. JSON reports contain issue codes, never connection secrets."""

import argparse
import json
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

SERVICES = ("postgres", "rabbitmq", "api", "worker", "outbox", "web")


def compose_report(config: dict[str, Any], *, require_images: bool = True) -> dict[str, Any]:
    issues: list[str] = []
    services = config.get("services", {})
    if not isinstance(services, dict) or any(name not in services for name in SERVICES):
        return {"ok": False, "scope": "configuration_only", "issues": ["services.missing"]}
    web = services["web"]
    domain = web.get("environment", {}).get("DEPLOYMENT_DOMAIN", "")
    if (
        not isinstance(domain, str)
        or domain != domain.lower()
        or not re.fullmatch(r"(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?", domain)
        or any(
            not part or len(part) > 63 or part.startswith("-") or part.endswith("-")
            for part in domain.split(".")
        )
    ):
        issues.append("web.domain.invalid")
    if services["postgres"].get("environment", {}).get("POSTGRES_PASSWORD") == services[
        "rabbitmq"
    ].get("environment", {}).get("RABBITMQ_DEFAULT_PASS"):
        issues.append("credentials.reused")
    for name in SERVICES:
        service = services[name]
        if service.get("restart") != "unless-stopped":
            issues.append(f"{name}.restart.missing")
        logging = service.get("logging", {})
        options = logging.get("options", {})
        if (
            logging.get("driver") != "local"
            or options.get("max-size") != "10m"
            or str(options.get("max-file")) != "5"
        ):
            issues.append(f"{name}.logging.unbounded")
        if require_images and not re.fullmatch(
            r"(?:[^\s]+@)?sha256:[a-f0-9]{64}", str(service.get("image", ""))
        ):
            issues.append(f"{name}.image.not_pinned")
        if name != "web" and service.get("ports"):
            issues.append(f"{name}.port.exposed")
        if not service.get("healthcheck", {}).get("test"):
            issues.append(f"{name}.healthcheck.missing")
    ports = web.get("ports", [])
    if len(ports) != 2 or {
        (str(port.get("published")), port.get("target"), port.get("protocol", "tcp"))
        for port in ports
        if isinstance(port, dict)
    } != {("80", 80, "tcp"), ("443", 443, "tcp")}:
        issues.append("web.ports.invalid")
    private = domain == "localhost"
    if private:
        if len(ports) != 2 or any(
            port.get("host_ip") != "127.0.0.1"
            or port.get("target") not in (80, 443)
            or not str(port.get("published", "")).isdigit()
            for port in ports
        ):
            issues.append("web.private_ports.invalid")
        else:
            issues = [issue for issue in issues if issue != "web.ports.invalid"]
    expected = {
        "FLEET_ENVIRONMENT": "production",
        "FLEET_AUTHENTICATION_MODE": "session",
        "FLEET_SECURE_COOKIES": "true",
        "FLEET_AUTO_CREATE_SCHEMA": "false",
        "FLEET_AUTO_SEED_DEMO": "false",
    }
    for name in ("api", "worker", "outbox"):
        service = services[name]
        env = service.get("environment", {})
        for key, value in expected.items():
            if str(env.get(key, "")).lower() != value:
                issues.append(f"{name}.{key}.unsafe")
        try:
            origins = json.loads(env.get("FLEET_ALLOWED_ORIGINS", "null"))
            valid_origin = origins == [f"https://{domain}"]
            if private and isinstance(origins, list) and len(origins) == 1:
                origin = urlsplit(origins[0])
                valid_origin = (
                    origin.scheme == "https" and origin.hostname == "localhost"
                    and origin.port is not None and not origin.path
                    and not origin.query and not origin.fragment and not origin.username
                )
            if not valid_origin:
                issues.append(f"{name}.origins.mismatch")
        except (ValueError, TypeError):
            issues.append(f"{name}.origins.invalid")
        for key, scheme, host, owner, password_key in (
            (
                "FLEET_DATABASE_URL",
                "postgresql+psycopg",
                "postgres",
                "POSTGRES_USER",
                "POSTGRES_PASSWORD",
            ),
            (
                "FLEET_BROKER_URL",
                "amqp",
                "rabbitmq",
                "RABBITMQ_DEFAULT_USER",
                "RABBITMQ_DEFAULT_PASS",
            ),
        ):
            try:
                url = urlsplit(env.get(key, ""))
                secret = services[host].get("environment", {}).get(password_key, "")
                username = services[host].get("environment", {}).get(owner, "")
                if not isinstance(secret, str) or len(secret) < 24 or len(set(secret)) < 8:
                    issues.append(f"{host}.credential.weak")
                if (
                    url.scheme != scheme
                    or url.hostname != host
                    or url.port != (5432 if host == "postgres" else 5672)
                    or not url.password
                    or unquote(url.password) != secret
                    or unquote(url.username or "") != username
                ):
                    issues.append(f"{name}.{key}.mismatch")
                if url.query or url.fragment or (host == "postgres" and url.path != "/fleet"):
                    issues.append(f"{name}.{key}.unsupported")
            except (ValueError, TypeError):
                issues.append(f"{name}.{key}.invalid")
        if not service.get("read_only") or "ALL" not in service.get("cap_drop", []):
            issues.append(f"{name}.filesystem_or_capabilities.unsafe")
    if (
        require_images
        and len({services[name].get("image") for name in ("api", "worker", "outbox")}) != 1
    ):
        issues.append("application.images.differ")
    return {
        "ok": not issues,
        "scope": "configuration_only",
        "issues": sorted(set(issues)),
        "external_acceptance": "not established by configuration checks",
    }


def services_report(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_name = {row.get("Service"): row for row in rows}
    issues = [
        f"{name}.not_healthy"
        for name in SERVICES
        if (
            name not in by_name
            or by_name[name].get("State") != "running"
            or by_name[name].get("Health") != "healthy"
        )
    ]
    return {"ok": not issues, "issues": issues}


def runtime_report(max_queue_age: int, max_outbox_age: int) -> dict[str, Any]:
    # Imports stay here so config/services checks need neither DB access nor application startup.
    from alembic.config import Config
    from alembic.migration import MigrationContext
    from alembic.script import ScriptDirectory
    from kombu import Connection  # type: ignore[import-untyped]
    from sqlalchemy import func, select

    from fleet_maintenance.artifacts.storage import artifact_directory, verify_hashes
    from fleet_maintenance.persistence.database import SessionLocal
    from fleet_maintenance.persistence.models import Job, ModelRegistration, OutboxEvent, User
    from fleet_maintenance.settings import get_settings

    issues: list[str] = []
    metrics: dict[str, int | float] = {}
    settings = get_settings()
    if settings.environment != "production":
        issues.append("environment.not_production")
    try:
        with Connection(settings.broker_url, connect_timeout=5) as connection:
            connection.ensure_connection(max_retries=0, timeout=5)
    except Exception:
        issues.append("broker.unavailable")
    try:
        now = datetime.now(UTC)
        with SessionLocal() as session:
            expected_heads = set(ScriptDirectory.from_config(Config("alembic.ini")).get_heads())
            actual_heads = set(MigrationContext.configure(session.connection()).get_current_heads())
            if actual_heads != expected_heads:
                issues.append("database.migration_mismatch")
            for name, model, predicate, limit in (
                ("queue", Job, Job.state == "queued", max_queue_age),
                ("outbox", OutboxEvent, OutboxEvent.published_at.is_(None), max_outbox_age),
            ):
                count, oldest = session.execute(
                    select(func.count(), func.min(model.created_at)).where(predicate)
                ).one()
                age = (
                    0.0
                    if oldest is None
                    else max(
                        0.0,
                        (
                            now - (oldest if oldest.tzinfo else oldest.replace(tzinfo=UTC))
                        ).total_seconds(),
                    )
                )
                metrics[f"{name}_count"] = count
                metrics[f"{name}_oldest_seconds"] = round(age, 2)
                if age > limit:
                    issues.append(f"{name}.overdue")
            expired = (
                session.scalar(
                    select(func.count())
                    .select_from(Job)
                    .where(
                        Job.state.in_(["running", "cancellation_requested"]),
                        Job.lease_expires_at < now,
                    )
                )
                or 0
            )
            metrics["expired_job_leases"] = expired
            if expired:
                issues.append("jobs.expired_leases")
            roles = set(
                session.scalars(
                    select(User.role).where(
                        User.disabled.is_(False), User.password_hash.is_not(None)
                    )
                )
            )
            if not {"administrator", "supervisor"}.issubset(roles):
                issues.append("accounts.bootstrap_incomplete")
            models = list(session.scalars(select(ModelRegistration)))
            metrics["registered_models"] = len(models)
            if not models:
                issues.append("models.not_installed")
            for registration in models:
                try:
                    verify_hashes(
                        artifact_directory(settings.artifact_root, registration.artifact_directory),
                        registration.hashes,
                    )
                except Exception:
                    issues.append("models.artifact_verification_failed")
    except Exception:
        issues.append("database_or_schema.unavailable")
    if settings.assistant_enabled:
        from fleet_maintenance.services.assistant import copilot

        try:
            if not copilot.client().available()[0]:
                issues.append("assistant.unavailable")
        except Exception:
            issues.append("assistant.unavailable")
    return {"ok": not issues, "issues": sorted(set(issues)), "metrics": metrics}


def backup_report(root: Path, maximum_age: int) -> dict[str, Any]:
    newest: datetime | None = None
    issues: list[str] = []
    now = datetime.now(UTC)
    for path in root.glob("*/backup.json"):
        try:
            manifest = json.loads(path.read_text())
            created = datetime.fromisoformat(manifest["created_at"])
            if created.tzinfo is None or created > now or not manifest.get("files"):
                raise ValueError("Invalid backup metadata")
            if not (path.parent / "database.dump").is_file():
                raise ValueError("Missing database dump")
            if newest is None or created > newest:
                newest = created
        except (OSError, ValueError, KeyError, TypeError):
            issues.append("backup.manifest_invalid")
    age = None if newest is None else (now - newest).total_seconds()
    if age is None or age > maximum_age:
        issues.append("backup.missing_or_overdue")
    return {
        "ok": not issues,
        "issues": sorted(set(issues)),
        "age_seconds": age,
        "scope": "freshness_only; restore integrity requires a separate restore rehearsal",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["config", "services", "runtime", "backup"])
    parser.add_argument("--allow-unpinned-images", action="store_true")
    parser.add_argument("--max-queue-age", type=int, default=300)
    parser.add_argument("--max-outbox-age", type=int, default=120)
    parser.add_argument("--backup-root", type=Path, default=Path("/var/backups/fleet-maintenance"))
    parser.add_argument("--max-backup-age", type=int, default=93600)
    args = parser.parse_args()
    try:
        if args.mode == "config":
            result = compose_report(
                json.load(sys.stdin), require_images=not args.allow_unpinned_images
            )
        elif args.mode == "services":
            content = sys.stdin.read().strip()
            rows = (
                json.loads(content)
                if content.startswith("[")
                else [json.loads(line) for line in content.splitlines() if line.strip()]
            )
            result = services_report(rows)
        elif args.mode == "backup":
            if args.max_backup_age <= 0:
                raise ValueError("Invalid backup threshold")
            result = backup_report(args.backup_root, args.max_backup_age)
        else:
            if args.max_queue_age <= 0 or args.max_outbox_age <= 0:
                raise ValueError("Invalid monitoring threshold")
            result = runtime_report(args.max_queue_age, args.max_outbox_age)
    except Exception:
        result = {"ok": False, "issues": ["check.invalid_input_or_unavailable"]}
    print(json.dumps(result, sort_keys=True))
    raise SystemExit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
