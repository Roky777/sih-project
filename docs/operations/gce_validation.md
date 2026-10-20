# GCE deployment preparation validation — 20 October 2026

Status: **repository release candidate prepared and locally verified; not deployed to GCE**.
Use [the aerocare-server runbook](gce_deployment.md) for the exact remaining host, SSH,
firewall, private HTTPS, domain, DNS, certificate, backup and deployment commands.

## Implemented

- `compose.gce.yaml` selects Linux/amd64 for the specified Ubuntu 24.04 VM. It defaults to
  loopback-only HTTP/HTTPS; a domain is not required for private SSH-tunnel verification.
  Neutral VM proxy templates replace AWS-specific templates for this target.
- Production mode enforces session authentication, secure cookies, exact HTTPS origins,
  no schema auto-creation or demo auto-seeding, separate strong database/broker credentials,
  private database/broker/API ports, restricted application capabilities and read-only roots.
- All six services have bounded local logs, restart policies and health checks. Worker and
  outbox heartbeat checks do not enable Celery remote control. Worker concurrency is one;
  science-library threads and memory limits leave headroom for the 2-vCPU/8-GB host.
- Named volumes retain PostgreSQL records, RabbitMQ queues and model artifacts; RabbitMQ uses
  a stable node hostname across replacements. The database outbox and job
  leases own durable work recovery. API startup no longer applies migrations implicitly.
- Release images use immutable local image IDs. The pinning tool refuses non-Linux/amd64
  images and refuses to overwrite previous rollback pins. Build contexts exclude local
  secrets, credentials and private agent/configuration files.
- Nginx resolves Docker service addresses again after container replacement; TLS and ACME
  bootstrap templates include private health checks, asset compression/cache controls and
  existing security headers. The bootstrap intentionally serves 503 until TLS is selected.
- Read-only release checks report configuration, service health, schema heads, model hashes,
  role bootstrap, queue/outbox age, expired leases, backup freshness and assistant availability.
  Reports contain issue codes rather than connection strings or passwords.
- Coordinated backups support repeated timestamped destinations and multiple env files;
  source archives without `.git` are supported. Backup/restore and model hashing stream files
  rather than reading whole artifacts into memory. Restore still refuses nonempty databases
  and production project names; verification ports and candidate images are configurable.
- Supplied systemd timers schedule monitoring and coordinated backups. They are not installed
  locally or remotely. Operators must agree downtime, off-VM retention and alert routing.
- CI now uses a separate integration database and an explicit fixture-browser configuration;
  retained scientific model/data journeys remain a distinct release check.

## Checks actually executed

The isolated production-profile project was `aerocare-deployment-rehearsal`, with a copy of
the earlier isolated audit database and its model artifacts, independent volumes and broker,
and private host ports 18081/18443. Existing localhost:8080 application records were untouched.
The workstation is ARM64: **only the local rehearsal overrides platforms to ARM64**. This
does not establish native amd64 behavior or capacity on the requested VM. The target GCE
profile remains amd64, and the pinning tool correctly rejected the ARM64 candidate images.

| Check | Actual result | Local evidence under `artifacts/` |
| --- | --- | --- |
| Backend Ruff, mypy | Passed; 186 source files, existing optional sequence exclusion | `deployment-checks-final-fixed.log` |
| Backend unit/verification | 243 passed; 3 upstream deprecation warnings | same |
| PostgreSQL integration | 78 passed in the dedicated integration database | `deployment-integration.log` |
| Frontend ESLint, TypeScript, Vitest | Passed; 30 tests across 7 files | executed `npm run lint`, `npm run typecheck`, `npm run test:web` |
| Production API and web Docker builds | Passed | `deployment-api-build-final.log`, `deployment-web-build-final.log` |
| Exact CI fixture-browser selection | 34 passed; no skips or retries | `deployment-ci-browser-final.log` |
| Composed configuration | Passed without exposing the rendered secret values | `deployment-readiness-2026-10-20/config-report.json` |
| Explicit Alembic migration | Passed on copied database | `deployment-rehearsal-migration.log` |
| Six service health checks | All healthy, including worker/outbox; recovered after backup | `deployment-readiness-2026-10-20/services-report.json` |
| Private HTTPS/security | Ready, unauthenticated rejection, origin/CSRF enforcement, Secure/HttpOnly/Strict session cookie, CSP/frame headers, gzip, asset cache and API no-store passed | `deployment-readiness-2026-10-20/https-report.json` |
| Real queued availability study | Succeeded through HTTPS, outbox, RabbitMQ and constrained worker | `deployment-https-job-fixed.log` |
| Replacement API address | Changed IP; HTTPS recovered without proxy restart | `deployment-readiness-2026-10-20/replacement-report.json` |
| Persistent broker replacement | Dedicated durable message survived a replacement broker container | `deployment-readiness-2026-10-20/broker-report.json` |
| Coordinated backup | Passed; 21 archive files, schema `066582695f5c`; prior services restarted | `deployment-backup.log` |
| Fresh-project restore | All 49 table fingerprints matched; registered model and archive hashes verified; readiness passed | `deployment-readiness-2026-10-20/restore-report.json` |
| Backup freshness monitor | Passed | `deployment-readiness-2026-10-20/backup-report.json` |
| Production runtime monitor | Correctly failed only `assistant.unavailable` after local account bootstrap | `deployment-readiness-2026-10-20/runtime-final.json` |
| Shell syntax and diff whitespace | Passed | `bash -n scripts/release_check.sh`, `git diff --check` |

The fresh restore took about 21.6 seconds locally; this is an observation, not an agreed RTO
or representative 50-GB VM recovery measurement. Original audit coverage remains in the
[exactly two-pass product audit](../team/product_audit_two_pass_2026-10-20.md); no additional
whole-product audit rounds were added during this deployment preparation.

Failures and limitations are retained. The first mounted-source pytest attempt imported the
old installed test package; setting `PYTHONPATH` corrected the test harness. A broad optional
scripts lint exposed pre-existing unrelated script issues; the final scoped backend and
changed-entry-point checks pass. The first browser launch was denied its sandbox port bind;
the permitted exact-CI run passed. A preliminary browser run omitted the explicit-base-URL
flag and skipped five assistant cases; the final run executed all 34. An administrator was
correctly refused planning; the real job passed with a supervisor. The first restore failed
because port 18080 was occupied; it was retained and the corrected fresh project used
18100/18180. Intermediate formatting failures were corrected and final checks rerun.

Local evidence/backup directories contain sensitive copied records and are ignored by Git.
Keep them private. Temporary rehearsal and restore services are stopped after validation;
their volumes and reports remain available. The main application continues on localhost:8080.

## Remaining release gates

1. Discover the real Google project, zone, VPC, disk and IP; install and verify the release on
   `aerocare-server`. No remote connection or VM command has been executed in this task.
2. Build/pin native amd64 images on the VM and validate memory, storage, workload, secure
   account provisioning, approved data/model installation and role journeys there.
3. Restore the configured `qwen3:8b` service's availability. The owner explicitly chose to
   retain the current AI configuration and report this blocker. No model was downloaded,
   disabled or silently replaced. Model capacity on this 8-GB shared host is unvalidated.
4. For public access, attach an owned domain to the verified reserved IP, issue a trusted
   certificate and verify renewal and external HTTPS. Private tunneling can precede this.
5. Configure approved alert delivery and independent encrypted backups; perform VM recovery
   and rollback validation with customer-agreed retention/RPO/RTO and maintenance windows.
6. Close the existing independent security, accessibility/intended-user, representative
   operational data/load and acceptance gates in [production readiness](production_readiness.md).

Changes are uncommitted. No public deployment, operational acceptance, aircraft clearance or
new scientific accuracy claim follows from these local engineering checks.

## VM follow-up: restrictive checkout permissions — 20 October 2026

The owner-provided VM log after upgrading to `812645a` shows successful explicit migrations
but API startup fails with `PermissionError` reading `/app/src/fleet_maintenance/artifacts/storage.py`.
The update shell used `umask 077`: new/changed checked-out source can be mode 0600, and Docker
COPY preserves restrictive permissions under root ownership. The runtime user is UID 10001.
This is a packaging failure; API readiness/public HTTPS for the updated release is not established.

The runtime Dockerfile now explicitly grants read/traversal access to packaged source,
migrations and Alembic configuration before switching to the unprivileged user. Dependencies,
host secret files and model/data volumes are outside this permission change. Regression
verification builds an image from a source context whose files are mode 0600 and directories
0700, then checks module imports and migration discovery as UID 10001 with a read-only root.
Executed result: the restrictive-context image built successfully, and UID 10001 read all
207 packaged files, imported API and worker, discovered migration head `066582695f5c` and
passed the heartbeat check on a read-only root. Evidence is retained under
`artifacts/runtime-permission-regression/`.

Apply the fix by rebuilding the API/worker/outbox images and replacing only application
containers. Keep the existing VM Compose overlays, database, broker, Ollama and backups.
VM readiness and public HTTPS must be rechecked after replacement; local packaging validation
alone does not establish that recovery has happened on the VM.
