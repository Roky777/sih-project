# Local Setup

Status: implemented local demonstrator, integrated prediction serving and completed frozen FD001 final evaluation. See production_readiness.md for release limitations.

## Required Environment

Use Node 24 with pnpm 12.8.1 and Docker Compose. Backend containers use Python 3.13 as declared in `backend/pyproject.toml` and `backend/Dockerfile`; the host Python is not used by the documented checks. GPU access is not required. The sequence target installs the official PyTorch 2.8 CPU wheel separately so ordinary checks do not pull CUDA packages.

## Setup Sequence

1. Run `make setup` to install the frozen web lock and build the Python 3.13 backend test image.
2. Review `.env.example`; copy it to the ignored `.env` only when overriding local defaults.
3. Run `make dev`. Compose starts PostgreSQL and RabbitMQ, applies Alembic migrations, seeds labelled fixtures, and starts the API, outbox dispatcher, worker and web proxy.
4. Check `http://localhost:8000/api/health/ready`, open `http://localhost:8080`, choose a workspace, and enter credentials for an account permitted to use that workspace.
5. Run `make web-check`, `make backend-check`, and `make e2e` as appropriate.

`make services-down` stops containers without deleting named volumes. Do not add `-v` as routine troubleshooting because it destroys persisted local PostgreSQL/artifact state.

## Prediction research and serving

1. Run `python scripts/fetch_dataset.py` from a compatible Python environment, or use the documented container approach, to acquire the allowlisted official NASA archive. The command verifies the archive layout and records hashes; existing mismatched files are not silently replaced.
2. Run `scripts/prepare_dataset.py` with `PYTHONPATH=backend/src` in Python 3.13 to validate FD001 and create the ignored engine-split manifest.
3. Run `make science-check` and `make sequence-check`.
4. Run `make science-train`, `make sequence-train`, then `make science-calibrate`.

The commands read the frozen YAML configurations and store their hashes with the ignored artifacts. They use only the supplied FD001 training histories for model selection/calibration. The training/calibration commands do not consume official test labels. After the user approved the frozen targets, `make science-evaluate` was run on the official final test. Later tuning must disclose that inspection. Install the selected artifact directory under FLEET_ARTIFACT_ROOT and register it through POST /api/models/registrations as an administrator; import a supported component history, then submit POST /api/jobs/assessment. The default seed contains no fabricated predictions.

## Commands and Troubleshooting

If the API is not ready, inspect `docker compose ps` and `docker compose logs api postgres rabbitmq`. A host with Python 3.14 cannot create the declared backend environment directly because the package supports Python 3.13–3.13; use the documented container target. For browser failures, verify the API health endpoint before Playwright and ensure Chrome is installed. Run commands from the actual repository root. Corepack invokes the pinned pnpm without requiring host shim installation.

## Resource-aware upgrade and customer rehearsal

`docker compose up -d --build` applies reviewed migrations and seeds labelled development resources without resetting named volumes. Existing proposed plans need fresh snapshots; active pre-resource work has no inferred crew/bay history and blocks ordinary replanning until explicitly reconciled or completed/cancelled. Dedicated new customer trials remain isolated from it.

For a clean environment, retain/acquire verified FD001 data and fitted/calibrated artifacts first. Model registration/sample installation is an offline development operation:

```sh
docker compose run --rm -v "$PWD:/workspace" -w /workspace \
  -e PYTHONPATH=/workspace/backend/src api python scripts/install_customer_demo.py
```

This requires the independently retained `artifacts/models/customer-trial-v1` and matching `data/raw/cmapss/train_FD001.txt`; it rejects different bytes under an existing version and does not invent a prediction if artifacts are absent. A fresh training candidate requires a new version and explicit evaluation; do not overwrite selected release bytes.

Open `/demo`: enter a case → inspect AI evidence → calculate schedule → compare the exact saved plan → record receipt/replan → approve → start/complete work. For reproducible isolated acceptance use `compose.verify.yaml` and `http://localhost:18080`; see backup/restore for installation and recovery evidence. Ordinary local UI remains at `http://localhost:8080`. Production mode excludes customer-trial routes.


## Workspace credentials — 18 October 2026

Local Compose and `.env.example` use `FLEET_AUTHENTICATION_MODE=session`. The public
entry page shows the four workspaces; clicking one opens `/login?workspace=…` with
account ID and password fields. Valid credentials open that workspace directly.
The server verifies the selected workspace against the account's assigned role;
choosing a role never grants permissions. Account role switching signs out the
current server session and requests credentials for the new workspace.

Existing accounts are not changed. Accounts without password hashes cannot sign in.
An administrator can use the existing interactive `scripts/provision_user.py` to
provision credentials. A separate `scripts/bootstrap_local_accounts.py` is prepared
for creating four dedicated local accounts, without resetting any existing account.
Run it only when creation of these role-bearing accounts is authorized:

```sh
docker compose run --rm -T --no-deps -v "$PWD:/workspace" -w /workspace \
  -e PYTHONPATH=/workspace/backend/src api python scripts/bootstrap_local_accounts.py
```

The setup script writes generated credentials to the owner-only
`LOCAL_LOGIN_CREDENTIALS.json`; Git and Docker build contexts exclude this file.
Do not publish it. Re-running the script verifies the saved accounts and preserves
their credentials. This script is not run automatically by application startup.

Legacy browser fixtures that intentionally exercise header identities require an
explicit isolated `FLEET_AUTHENTICATION_MODE=demo` test stack. The credential-entry
browser tests use mocked sessions; backend login tests use temporary databases.

The local `pushkar` supervisor account supports the same login across all four workspace choices; each login session uses the selected team role. The private credentials file lists workspace choices even when they share one account.
