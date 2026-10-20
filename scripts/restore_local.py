"""Restore to a NEW isolated project only. Refuses nonempty databases and live names."""

import argparse
import hashlib
import json
import os
import subprocess
import time
import urllib.request
from datetime import UTC, datetime
from pathlib import Path


def file_sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", type=Path, required=True)
    parser.add_argument("--project", default="fleet-release-restored")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--api-port", type=int, default=18000)
    parser.add_argument("--web-port", type=int, default=18080)
    args = parser.parse_args()
    if (
        not 1024 <= args.api_port <= 65535 or not 1024 <= args.web_port <= 65535
        or args.api_port == args.web_port
    ):
        parser.error("Choose distinct unprivileged verification ports")
    if (
        not args.project.startswith("fleet-release-restored")
        or not args.project.replace("-", "").isalnum()
    ):
        raise ValueError("Restore target must be a dedicated fleet-release-restored project")
    started = time.monotonic()
    backup = args.backup.resolve()
    manifest = json.loads((backup / "backup.json").read_text())
    for name, digest in manifest["files"].items():
        path = (backup / name).resolve()
        if (
            not path.is_relative_to(backup)
            or file_sha256(path) != digest
        ):
            raise ValueError("Backup bytes do not match the retained manifest")
    cmd = ["docker", "compose", "-p", args.project, "-f", "compose.verify.yaml"]

    compose_env = {
        **os.environ, "FLEET_VERIFY_API_PORT": str(args.api_port),
        "FLEET_VERIFY_WEB_PORT": str(args.web_port),
    }

    def compose(*parts: str) -> str:
        return subprocess.check_output([*cmd, *parts], text=True, env=compose_env).strip()

    compose("up", "-d", "--wait", "postgres", "rabbitmq")
    pg = compose("ps", "-q", "postgres")

    def sql(query: str) -> str:
        return subprocess.check_output(
            ["docker", "exec", pg, "psql", "-U", "fleet", "-d", "fleet", "-Atc", query],
            text=True,
        ).strip()

    if sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'") != "0":
        raise ValueError("Refusing to overwrite a nonempty restore target")
    with (backup / "database.dump").open("rb") as stream:
        subprocess.run(
            [
                "docker",
                "exec",
                "-i",
                pg,
                "pg_restore",
                "-U",
                "fleet",
                "-d",
                "fleet",
                "--no-owner",
                "--no-acl",
                "--exit-on-error",
                "--single-transaction",
            ],
            stdin=stream,
            check=True,
        )
    compared = {}
    for table, expected in manifest["table_fingerprints"].items():
        quoted = '"' + table.replace('"', '""') + '"'
        actual = sql(
            "SELECT count(*),md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' "
                "ORDER BY to_jsonb(t)::text),'')) FROM "
            + quoted
            + " t"
        )
        if actual != expected:
            raise ValueError(f"Restored table differs from backup: {table}")
        compared[table] = actual
    compose("create", "api")
    container = compose("ps", "-aq", "api")
    subprocess.check_call(
        [
            "docker",
            "cp",
            str(backup / "artifacts") + "/.",
            f"{container}:/var/lib/fleet-maintenance/artifacts/",
        ]
    )
    compose(
        "run",
        "--rm",
        "--no-deps",
        "--user",
        "root",
        "api",
        "chown",
        "-R",
        "10001:10001",
        "/var/lib/fleet-maintenance/artifacts",
    )
    compose("up", "-d", "--wait")
    # Verify DB registrations against the independently restored artifact volume.
    compose(
        "exec",
        "-T",
        "api",
        "python",
        "-c",
        "from sqlalchemy import select; "
        "from fleet_maintenance.persistence.database import SessionLocal; "
        "from fleet_maintenance.persistence.models import ModelRegistration; "
        "from fleet_maintenance.artifacts.storage import verify_hashes,artifact_directory; "
        "from fleet_maintenance.settings import get_settings; "
        "s=SessionLocal(); models=list(s.scalars(select(ModelRegistration))); "
        "assert models; [verify_hashes(artifact_directory(get_settings().artifact_root,"
        "m.artifact_directory),m.hashes) for m in models]; "
        "print('all registered artifacts verified')",
    )
    with urllib.request.urlopen(
        f"http://127.0.0.1:{args.api_port}/api/health/ready", timeout=10
    ) as response:
        assert response.status == 200
    age = (datetime.now(UTC) - datetime.fromisoformat(manifest["created_at"])).total_seconds()
    result = {
        "project": args.project,
        "schema": manifest["schema"],
        "tables": compared,
        "artifact_hashes": "verified against DB registrations and archive hashes",
        "backup_age_seconds": age,
        "observed_restore_seconds": time.monotonic() - started,
        "RPO_RTO": "not customer agreed; observations only",
        "journey": f"Run customer-trial.spec.ts against http://localhost:{args.web_port}",
        "reconciliation": "Dispatcher recovers expired jobs; attempt fencing and "
        "normal stock/resource invariants remain active",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
