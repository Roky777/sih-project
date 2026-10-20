"""Coordinated local Compose backup; stop writers, retain DB and artifacts together.

Archives contain application records and must be handled as sensitive data. Secrets
are deliberately excluded; operators must retain deployment secrets separately.
"""

import argparse
import hashlib
import json
import os
import subprocess
from datetime import UTC, datetime
from pathlib import Path


def run(*args: str) -> bytes:
    return subprocess.check_output(args)


def file_sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def source_revision() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=False
    )
    return result.stdout.strip() if result.returncode == 0 else "source archive; retain manifest"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    output = parser.add_mutually_exclusive_group(required=True)
    output.add_argument("--output", type=Path)
    output.add_argument(
        "--output-root", type=Path, help="Create a new UTC-named backup for timers"
    )
    parser.add_argument("--compose", action="append")
    parser.add_argument("--env-file", action="append")
    parser.add_argument("--project-name")
    parser.add_argument("--database", default="fleet")
    parser.add_argument("--source-revision")
    args = parser.parse_args()
    destination = (
        args.output
        or (args.output_root / datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ"))
    ).resolve()
    destination.mkdir(mode=0o700, parents=True, exist_ok=False)
    os.chmod(destination, 0o700)
    compose_files = args.compose or ["compose.yaml"]
    compose = ["docker", "compose"]
    for env_file in args.env_file or []:
        compose += ["--env-file", env_file]
    if args.project_name:
        compose += ["--project-name", args.project_name]
    for file in compose_files:
        compose += ["-f", file]
    services = ["api", "worker", "outbox", "web"]
    active = (
        run(*compose, "ps", "--status", "running", "--services").decode().splitlines()
    )
    restart = [service for service in services if service in active]
    started = datetime.now(UTC)
    try:
        subprocess.check_call([*compose, "stop", *services])
        pg = run(*compose, "ps", "-q", "postgres").decode().strip()
        api = run(*compose, "ps", "-aq", "api").decode().strip()
        with (destination / "database.dump").open("wb") as stream:
            subprocess.run(
                [
                    "docker",
                    "exec",
                    pg,
                    "pg_dump",
                    "-U",
                    "fleet",
                    "-d",
                    args.database,
                    "-Fc",
                    "--no-owner",
                    "--no-acl",
                ],
                stdout=stream,
                check=True,
            )
        (destination / "globals.sql").write_bytes(
            run(
                "docker",
                "exec",
                pg,
                "pg_dumpall",
                "-U",
                "fleet",
                "--globals-only",
                "--no-role-passwords",
            )
        )
        subprocess.check_call(
            [
                "docker",
                "cp",
                f"{api}:/var/lib/fleet-maintenance/artifacts",
                str(destination / "artifacts"),
            ]
        )
        schema = (
            run(
                "docker",
                "exec",
                pg,
                "psql",
                "-U",
                "fleet",
                "-d",
                args.database,
                "-Atc",
                "SELECT version_num FROM alembic_version",
            )
            .decode()
            .strip()
        )
        tables = (
            run(
                "docker",
                "exec",
                pg,
                "psql",
                "-U",
                "fleet",
                "-d",
                args.database,
                "-Atc",
                "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
            )
            .decode()
            .splitlines()
        )
        fingerprints = {}
        for table in tables:
            quoted = '"' + table.replace('"', '""') + '"'
            query = (
                "SELECT count(*),md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' "
                "ORDER BY to_jsonb(t)::text),'')) FROM " + quoted + " t"
            )
            fingerprints[table] = (
                run(
                    "docker",
                    "exec",
                    pg,
                    "psql",
                    "-U",
                    "fleet",
                    "-d",
                    args.database,
                    "-Atc",
                    query,
                )
                .decode()
                .strip()
            )
        inventory = {
            str(path.relative_to(destination)): file_sha256(path)
            for path in sorted(destination.rglob("*"))
            if path.is_file()
        }
        record = {
            "created_at": datetime.now(UTC).isoformat(),
            "started_at": started.isoformat(),
            "schema": schema,
            "table_fingerprints": fingerprints,
            "files": inventory,
            "source_head": args.source_revision
            or source_revision(),
            "working_tree": "uncommitted; preserve release source manifest separately",
            "configuration": {
                "compose_sha256": {
                    file: file_sha256(Path(file)) for file in compose_files
                },
                "database": args.database,
                "scope": "single_agency",
                "secrets": "retained separately",
            },
            "role_handling": "Dump omits ownership/ACL; restore uses precreated fleet owner. "
            "Review globals.sql before applying; never replay cluster roles blindly.",
        }
        (destination / "backup.json").write_text(json.dumps(record, indent=2) + "\n")
        for path in destination.rglob("*"):
            if path.is_file():
                os.chmod(path, 0o600)
        print(
            json.dumps(
                {"backup": str(destination), "schema": schema, "files": len(inventory)}
            )
        )
    finally:
        if restart:
            subprocess.check_call([*compose, "start", *restart])


if __name__ == "__main__":
    main()
