# Coordinated local backup and fresh restore

Preserve PostgreSQL operational/job/audit state together with registered model/transform/calibration bytes, sample input artifacts, schema/configuration metadata, source evidence and permitted research reports/splits. Deployment secrets require separate protected retention. Ignored model/report/backup directories are not disposable.

## Executed procedures

From the repository root with the local stack running:

```sh
python3 scripts/backup_local.py --output artifacts/backups/unique-backup-name
```

The script refuses to reuse a directory, briefly stops API/worker/dispatcher/web writers, takes a custom-format `pg_dump` without owners/ACLs, retains a globals dump **without role passwords**, copies artifacts, records SHA-256 files/schema/table record fingerprints and restarts previously running services even on error. The archive directory is mode 0700 and files 0600. Do not add `down -v` or reset data. Backups contain records and require protected storage; local modes do not establish encryption, offsite retention or an agreed RPO.

Restore only into a new dedicated project. Ports 18000/18080 must be free; stop an existing verification/restored stack without deleting volumes first.

```sh
python3 scripts/restore_local.py \
  --backup artifacts/backups/unique-backup-name \
  --project fleet-release-restored-new \
  --output artifacts/restore-observation.json
```

The script allows only a `fleet-release-restored...` project name, refuses nonempty target databases, verifies archived bytes, restores transactionally into the precreated fleet-owned database, compares every table fingerprint **before writers start**, copies the independent artifact volume, checks every DB model registration against its restored bytes, and checks readiness. `globals.sql` is a review artifact, not blindly applied cluster state: Compose precreates the fleet role, and the restore intentionally uses no original owners/ACLs. For a different production role layout, the operator must review roles/grants and secrets independently.

The dispatcher reconciles expired jobs with bounded attempts/fencing. Broker signals can be republished; accepted business effects remain in PostgreSQL. Stock/resource reservations are not recreated or released from simulation results. Preserve failed/cancelled attempt history. Reconcile any pre-resource active work explicitly instead of inventing bookings.

Verify the restored user journey:

```sh
FLEET_E2E_BASE_URL=http://localhost:18080 \
  corepack pnpm --filter @fleet-maintenance/web test:e2e customer-trial --workers=1
```

## Observed rehearsal

`artifacts/release-v2/backup-final/backup.json` and `restore.json`: all **27** table fingerprints matched before API startup, including 65 jobs/attempts, 19 plans, 31 simulation runs and retained work/bookings. All registered artifact hashes matched. Observed restore time **16.64 seconds** and backup age **89.94 seconds** describe this small local Docker rehearsal; these are not customer RTO/RPO promises. Initial four customer journeys passed (`browser-restored.log`); after the final image rebuild, all **five** current customer journeys passed on the restored database/artifacts (`browser-restored-final.log`). The backup boundary remains the recorded snapshot.

## Clean install and fault rehearsal

`compose.verify.yaml` isolates DB/artifacts/broker and binds only loopback ports. Build local images with `docker compose build`; start `docker compose -f compose.verify.yaml up -d`. Its fresh migration and full browser journey were executed. Install the independently retained selected model and labelled sample using `scripts/install_customer_demo.py` in the API environment as described in local setup; the acquisition/training files are intentionally not committed.

Run `python3 scripts/verify_local_runtime.py --output artifacts/runtime-check.json` **only against this verification stack**, after model installation/journey checks. It uses the actual broker, dispatcher, worker and PostgreSQL, with a test-only calculation delay for worker loss/cancellation; it never targets live fleet-maintenance containers. It exercises outages, confirmed-publish/mark interruption, duplicate delivery, killed worker/expired attempt, obsolete result, cancellation and SSE resume. Leave the user's ordinary stack running; `docker compose -f compose.verify.yaml stop` preserves verification volumes.

## Current-workspace rehearsal — 14 October 2026

The coordinated backup at `artifacts/backups/pre-video-2026-10-14-final` was restored into the new
isolated `fleet-release-restored-20261014` project. All **48** table fingerprints matched before
writers started, including onboarding, cases, work verification, saved plans/results and jobs.
Registered model artifacts passed hash verification. Migration: `a668260bb390`. Observed restore
runtime: **18.13 seconds**; backup age at observation: **62.95 seconds**. These are local observations,
not agreed RTO/RPO. See `artifacts/pre-video-2026-10-14/restore.json` and the current
[delivery report](../team/pre_video_delivery.md). Secrets and local host inference configuration
remain separate; restored general-model connectivity is not claimed.

All five current guided-trial browser cases passed on this restored installation. The rehearsal
containers were then stopped with volumes preserved; the ordinary local stack remains running.
