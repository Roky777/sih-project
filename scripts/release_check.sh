#!/usr/bin/env bash
# Read-only checks on the explicitly selected production project. Never source an env file.
set -euo pipefail
if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Usage: bash scripts/release_check.sh ENV_FILE PROJECT_NAME [IMAGE_ENV_FILE]" >&2
  exit 2
fi
env_file=$1
project_name=$2
python3 -c 'import os,stat,sys; s=os.stat(sys.argv[1]); sys.exit(0 if stat.S_ISREG(s.st_mode) and not s.st_mode & 0o077 else "Production env file must be private (chmod 600).")' "$env_file"
compose=(docker compose --env-file "$env_file")
if [[ $# == 3 ]]; then compose+=(--env-file "$3"); fi
compose+=(--project-name "$project_name" -f compose.yaml -f compose.production.yaml -f compose.gce.yaml -f compose.release.yaml)
# The rendered configuration contains secrets: pipe it directly; do not tee or log it.
"${compose[@]}" config --format json |
  "${compose[@]}" run --rm --no-deps -T api python -m fleet_maintenance.deployment config
"${compose[@]}" ps --format json |
  "${compose[@]}" exec -T api python -m fleet_maintenance.deployment services
PYTHONPATH=backend/src python3 -m fleet_maintenance.deployment backup --backup-root "${FLEET_BACKUP_ROOT:-/var/backups/fleet-maintenance}"
"${compose[@]}" exec -T api python -m fleet_maintenance.deployment runtime
