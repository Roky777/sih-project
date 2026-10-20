# Release readiness — 2026-10-04

Google Cloud preparation, 20 October: [deployment runbook](gce_deployment.md) and
[executed validation](gce_validation.md). The GCE profile, private HTTPS, immutable image pins,
explicit migrations, worker health, bounded resources/logs, monitoring and coordinated recovery
are implemented. Local checks passed 243 backend unit/verification, 78 integration, 30 frontend
unit and 34 selected CI browser tests, plus real HTTPS/job/replacement/backup/restore checks.
No VM deployment or native amd64 acceptance is claimed; the configured AI service remains
unavailable and the external gates below remain open.

Latest local follow-up: [the two-pass audit of 20 October](../team/product_audit_two_pass_2026-10-20.md)
completed exactly two iterations. The corrected compiled suite passed 155/155, and the live
matrices retained 336 page inspections with 40/40 interaction groups passing. Import validation,
upload races, malformed ingestion and the aircraft loading counter were corrected. The local
qwen3:8b model service remains unreachable; the user explicitly chose to retain its configuration
and report that blocker. Record-based copilot answers and its live UI/stream passed. These
checks do not close the external production acceptance gates below.

Latest implementation evidence: [release-v2 acceptance ledger](../team/release_acceptance.md). The historical runs below are retained separately; original full release/customer/public-deployment acceptance remains incomplete.

The [20 October product audit](../team/product_audit_2026-10-20.md) records the latest repeated
page/control checks, responsive fixes, compiled-browser retests and isolated workflow evidence.
Concurrent local builds/browser activity triggered temporary backend-offline states; successful
quiet retests establish recovery, not production capacity or latency acceptance. This audit does
not close the operational, scientific, independent security or deployment release gates below.


Latest source audit and AI presentation follow-up: [project status](../team/project_status.md). That report separates checks run on checkout `b73bbef` plus its current changes from the historical live-service/scientific evidence below and lists eight remaining release workstreams. The AI presentation update does not close the scientific or deployment acceptance gaps.

This workspace is a hardened maintenance decision demonstrator. It has not been deployed, accepted against every original release criterion, or qualified for aircraft operations. Changes are in the uncommitted workspace; no immutable release revision is claimed. The current support boundary is NASA C-MAPSS FD001 simulated engines and labelled synthetic maintenance/logistics inputs.

## Implemented software

- Production configuration guards; opaque server-side sessions with Argon2 credentials, secure cookies, CSRF and origin checks, server-enforced roles, account lockout and proxy login throttling.
- Atomic labelled workspace imports; immutable component histories with correction links; registered model/transform/calibration hashes; cutoff-bound prediction and noncausal model sensitivities; unavailable/stale evidence handling.
- Versioned alert history and separate acknowledgement, retaining existing concerns when assessments are withheld.
- Snapshot-based constrained planning, fixed commitments, precedence and compatible contiguous task groups. Proposal revision/rejection, locked/idempotent approval, exact reservations, work start/completion, eligible cancellation and audited stock correction.
- Durable planning, simulation and assessment jobs; calculations outside read transactions; bounded expired-lease recovery; cancellation/stale-attempt guards; atomic accepted results and outbox events.
- Immutable synthetic scenario revisions and deterministic, explicitly labelled capacity simulations.
- UTC-aware PostgreSQL timestamps, reviewed Alembic migrations, generated browser contracts, structured correlation logging, readiness/schema checks and locked nonroot backend runtime images.
- Responsive application screens, accessible status/error states, keyboard navigation, evidence charts/tables and a session sign-in flow.

## Retained verification

| Check | Evidence and practical limit |
|---|---|
| Backend | Ruff and mypy across 120 source files. All 76 science, unit, verification and integration tests passed, including PostgreSQL concurrency and Torch sequence checks. One Starlette/httpx deprecation warning remains. |
| Browser | Web lint/typecheck/production build, six Vitest tests and ten fixture Playwright checks, including login failure/success. Fixtures test UI behaviour; they are not real authentication/deployment load tests. |
| Contracts/schema | Generated FastAPI OpenAPI/TypeScript schema; PostgreSQL and SQLite migration upgrades; PostgreSQL Alembic check with no schema drift. |
| Live job chain | Real local PostgreSQL → outbox → RabbitMQ → Celery planning, simulation and FD001 assessment completed with persisted results. Public test engine 1 cutoff 31 retained its namespaced identity and evidence. |
| Approval/work | Live synthetic approval replay created two work rows once. One completed task consumed one filter; cancelling the other released the unstarted kit. Reservations ended at zero, plan status closed, physical inventory reflected consumption. |
| Worker loss | Running worker killed/restarted; recorded job recovered on attempt two in approximately 31.8 seconds with a 30-second test lease. Default lease is 300 seconds. Not every API/broker/dispatcher kill point has been exercised. |
| Restoration | Quiesced isolated test writers; pg_dump/pg_restore into a separate database at migration 64c201993bc1. All compared rows matched: 2 aircraft, 2 components, 1 import, 1 model, 3 assessments, 2 tasks, 4 plans, 2 reservations, 2 work records, 8 jobs, 26 outbox events, 6 audit events. Matching model-artifact hashes verified. |
| Containers/proxy | Locked backend/web images built, isolated services started, Nginx configuration passed `nginx -t`. Production override configuration rendered successfully with test placeholder values; it was not deployed. |

Database restore dump SHA-256: `21e7ca0b4f34dc3930c2be8320be2d8dd763b3d665102498031a2a2b7f993fdc`. Temporary dump/artifact copies remain local in `/tmp`; move retained backups into the operator's durable backup store before relying on them. Ignored scientific artifacts also need durable retention outside Git.

## Scientific acceptance

The user approved freezing `configs/acceptance_proposal.yaml` before final-test evaluation. Published FD001 benchmark results and proposed product targets are distinguished in [the acceptance proposal](../research/fd001_acceptance_proposal.md). The MAE, coverage-confidence and width requirements are proposed demonstrator targets, not scientifically validated operational limits.

| Official FD001 final-test metric | Result | Frozen demonstrator gate |
|---|---:|---:|
| Capped MAE | 8.722 cycles | ≤12.5 cycles |
| Capped RMSE | 11.710 cycles | ≤15 cycles |
| Nominal 90% interval coverage | 98/100 engines | ≥90% |
| One-sided 95% exact coverage lower bound | 93.838% | ≥80% |
| Mean interval width | 58.231 cycles | ≤62.5 cycles |

All these gates passed; no final-test engines were withheld. Uncapped secondary MAE/RMSE are 9.769/13.182 cycles. Small life-stage groups of 16, 12 and 11 engines do not validate conditional coverage. Nominal intervals do not provide individual engine failure probabilities. The 100-engine final test is now inspected; future tuning needs explicitly identified evidence rather than reuse as unseen validation.

Canonical ignored evaluation: `artifacts/evaluations/final-fd001-v1-shared.json`, SHA-256 `c5db04c48ced4c84a23e451071e83b8f6e9577266de21128d2ca0bf469a7a7f9`. Model manifest, calibration, raw data, evaluation policy hashes and 2,000 seeded bootstrap replications are retained in that report. See [reproduction log](../research/reproduction_log.md).

## Remaining original acceptance gaps

These required items are incomplete and prevent calling the original plan 100% accepted:

- AC-F04-04: missed/false alert budgets require independent complete failure trajectories and a cost/operational model. Official FD001 final-test histories are truncated and do not alone validate alert episodes over complete lives. Synthetic alert tests are insufficient.
- AC-F03-03: validation-only sensitivity fidelity/repeatability and perturbation stability diagnostics are complete (see the entry below). A validated stability acceptance threshold and broader support evidence remain incomplete.
- AC-F05-05 and AC-X05: representative planner quality/runtime and concurrent API/UI workload budgets have not been frozen. A five-reader local HTTP diagnostic is measured below; browser interaction and representative workload acceptance remain incomplete. Tiny reference benchmarks do not validate production throughput.
- AC-F06-01 and AC-F06-05: time-dependent expected-arrival constraints, independent cumulative-stock validation, traceable receipt/cancellation and conditional proposals are implemented. Approval requires physical received stock and a fresh snapshot. The analytic grouping reference reports two grounding episodes versus one, with four early-maintenance slots (32 discarded cycles under an explicit synthetic eight-cycles/slot assumption); this is a reference tradeoff, not operational benefit. Current planning uses fourteen eight-hour slots and one engine crew capacity; separate qualified-bay modelling remains incomplete.
- AC-F08-04: validation robustness interventions exist; broader support/error/coverage limits and joint-regime detection are not validated. Online missing-history prediction is withheld rather than claiming imputation robustness.
- AC-S05–S09: covered transactional races and actual worker-loss recovery do not establish every process/broker failure point . Event replay now detects retention gaps and cursor mismatches, returns a resync control event and refuses to skip an earlier unconfirmed event. Automatic retention pruning remains unimplemented. Durable attempt history is now retained from migration eab4b05e021f; older absent attempt details are not reconstructed. No lease extension or host failover exists.
- Full end-to-end release gate: API integration and UI fixture evidence are retained; a single final walkthrough of every original acceptance case on a pinned release revision remains incomplete.

The production bundle splits charts into chunks below 100 kB and no longer reports the component-chart chunk warning. A 1.73 MB illustration remains. Large collection pagination, external identity federation and operational calendars are not implemented. Declare and measure the intended workload before treating those tradeoffs as acceptable.

## Operator preparation

1. Retain an immutable reviewed source revision, dependency locks, evaluated manifests and model/data artifacts. Provision durable database, broker and artifact storage with backups; deployment is single-host.
2. Use `compose.yaml` plus `compose.production.yaml` with unique database/broker passwords and matching connection URLs. Set FLEET_ALLOWED_ORIGINS to the workspace's HTTPS origin as a JSON list. The production override removes published service ports. For the agreed Ubuntu EC2 single-VM target, add `compose.ec2.yaml`: only web publishes 80/443, using parameterized Nginx TLS and ACME templates. See [EC2 deployment preparation](ec2_deployment.md). No real domain, certificate or host has been supplied; public deployment remains blocked.
3. Apply reviewed migrations through `alembic upgrade head` using the installed backend package and configured production database. Production startup also runs the Compose migration entry point. Schema auto-creation and fixture auto-seeding stay disabled.
4. Provision administrator and operational accounts locally with `scripts/provision_user.py`. Run it in the compatible environment against the intended database; passwords are entered interactively. Do not inject demo headers or reuse fixture credentials.
5. Import labelled fleet/logistics inputs as administrator through `/api/workspace/fixtures`; install trusted model artifacts beneath FLEET_ARTIFACT_ROOT and register their relative directory through `/api/models/registrations`. Do not deserialize untrusted uploaded pickle/joblib files. Import supported history and request an assessment through queued jobs.
6. Verify HTTPS cookie/CSRF/origin behaviour, denied roles, schema readiness, broker dispatch, registered artifact hashes and the complete release walkthrough in the deployment environment. Choose production lease/time limits for supported runtimes and monitor queued/running/expired/failed jobs and outbox delay.
7. Quiesce all writers for a coordinated database/artifact backup. Retain pg_dump output, migration head and model directories/manifests together. Restore into a separate database, compare records/relationships and verify all registered artifact hashes before switching services. Do not delete named volumes during routine troubleshooting.

No external service, real account, private data or deployment has been configured by this work. These operator steps describe preparation; they do not constitute a completed deployment or aircraft-use approval.

## Follow-up verification — attempt history, explanations and workload

- Migration `eab4b05e021f` adds durable `job_attempts` with unique job/attempt identities, worker process identity, UTC start/lease/finish times, state and outcome code. Each lifecycle transition updates it transactionally with the authoritative job/outbox. `GET /api/jobs/{id}/attempts` exposes history; old attempts without records remain absent. Readiness checks the new table.
- Real worker-loss job `job-676fc1b0a91a4243af425770b4db00aa` completed on attempt two in 30.93 seconds. The API retained attempt one as expired with `lease_expired`, and attempt two as succeeded. Artifact `artifacts/benchmarks/worker-loss-attempt-history-v1.json`, SHA-256 `63c50cb2f53e2e20fc8bea5e2965c4375cad779ce2a90574648aeab79e891fd3`.
- Restore rehearsal at the new migration head matched every compared row in a new separate database, including four attempt rows, thirteen jobs, seven plans and forty-three outbox events; other counts matched the preceding rehearsal. Dump SHA-256 `c2675674c08eb77252c8a8f37a707f189f437e9f1360a352d42c6445d798741c`. The unchanged registered artifacts remain hash-verified against the matching copied model directories. PostgreSQL Alembic check reported no schema drift; SQLite upgraded through the new migration.
- The deployed explanation method is now shared with its evaluator and identified as training-mean-sensitivity-v1. Numerical sensitivity failures produce explanation-unavailable metadata while preserving a valid estimate/interval; the API respects that state. Analytic-reference, malformed-output, failure-isolation and API tests passed.
- Diagnostic protocol `configs/explanation_evaluation.yaml` uses only the original fifteen validation engines, one seeded cutoff each, and twenty perturbations per engine. Identical-input differences and independent single-feature intervention errors were zero. Mean top-ten Jaccard overlap was 0.9442 (5th percentile 0.8182); mean cosine similarity 0.9957; mean absolute sensitivity change 0.01655 cycles; mean prediction change 0.4076 cycles. The diagnostic was reproduced byte-identically. Artifact `artifacts/evaluations/explanations-validation-v1.json`, SHA-256 `a3ec8e75a6607c3eef6a738ecbb1c5ae96f31e06c7507b717e3610b743d2d31d`. Small independent engineered-feature perturbations are not calibrated sensor noise or a physical-fault test. No scientific stability pass threshold is claimed.
- Local HTTP diagnostic `configs/workload_diagnostic.json`: five readers, forty requests each over five endpoints, plus two durable job submissions. The first run had zero failed requests, p95 37.5 ms and p99 169.4 ms. The second run against the updated attempt-history runtime had zero failed requests, p95 47.1 ms and p99 220.9 ms; both jobs succeeded and twenty-one sampled job-list reads observed submitted jobs queued/running. These short, small-fixture measurements are not sustained-load, production authentication, browser responsiveness or large-fleet acceptance. Artifact `artifacts/benchmarks/workload-local-v2.json`, SHA-256 `566064fe5bf6ee4321efde9a38cb23cfcde2a292edfa01bc1e4a90aeb7f76644`. Local Docker allocation: eight CPUs, 8,319,770,624 bytes RAM, aarch64; client platform and module/configuration hashes are retained. Runtime allocation artifact hash `6b38917117044fef82b162289a10bc92cdb160c5e1a4fb42591688c6d05df44c`.
- Final checks: all 68 backend tests passed; Ruff and mypy passed for 118 source files; regenerated OpenAPI/browser schema and `make web-check` passed, including six Vitest tests. The existing chart-size and Starlette/httpx warnings remain. Nine browser fixture checks passed in the preceding pass; UI behaviour was not changed in this follow-up.

Reproduce explanations with `make explanation-evaluation` or the shared evaluator entry point. `make workload-diagnostic` requires the prepared .venv313 environment and a running isolated demo stack; it creates synthetic proposal/run/job records and must not target operational records. Keep its results diagnostic until the intended hardware/workload and latency budgets are frozen.

## Current implementation and evaluation boundaries

- The [FD001 holdout audit](../research/fd001_alert_holdout_audit.md) checked baseline, processed split and calibration records. All 100 complete training engines have prior permitted uses (70 fitting, 15 validation/model selection, 15 calibration); zero untouched engines remain. The requested internal held-out complete-trajectory alert evaluation is blocked. No relabelling or future sensor reconstruction was performed. Audit SHA-256: `c37e4e87c5260ddcbeba7d32c0d3456791cf0b384efa42e636553b2fa1a8ee8d`. Independent operational data and operator-approved alert/cost targets also remain absent.
- Expected part arrivals have versioned, audited, authorized creation and receipt/cancellation. Idempotent receipt credits physical stock once; receipt/cancellation invalidates old proposals. Scheduled deliveries support conditional solver feasibility but cannot be committed before physical receipt. Reviewed migration head is `c2ceb7b6aa9b`.
- The local real-service walkthrough `artifacts/evaluations/full-workflow-v1.json` completed assessment, delivery-constrained planning, rejected early approval, idempotent receipt, rejected stale approval, fresh approval/replay, work start/completion, simulation and degraded/clean history corrections. The historical assessment stayed unchanged. This used public simulated sensor inputs and synthetic logistics, not operational data. It does not substitute for every original acceptance case or a pinned release revision.
- SSE checks cover confirmed-prefix ordering, replay bounds/resync and periodic server-session revalidation. Browser handlers refresh authoritative state on resync and close expired sessions. Job progress remains backed by authoritative SQL queries. Automatic event retention, non-job event families and record/tenant scoping are separate future requirements.
- Public HTTPS, EC2 deployment/reboot/renewal/host restoration and deployment-specific load are blocked by missing real host/domain/access. Configuration preparation is a separate status. No paid resource or external publication was performed.

## Deployment preparation and final restore checks

EC2 Compose rendering passed with local test values, and verified that only web publishes 80/443. Both bootstrap and TLS templates passed Nginx configuration checks. Loopback HTTPS returned 200 with an explicitly trusted self-signed test certificate; HTTP returned 308 to HTTPS. This is local preparation evidence, not public certificate/deployment acceptance.

The coordinated full backup restored into separate `fleet_restore_arrival_check` at migration `c2ceb7b6aa9b`. All compared rows matched, including 19 jobs, 10 attempts, 9 plans, 1 arrival, 6 assessments, 3 work records and 61 outbox events. Backup SHA-256: `f4a5f745a356e7180628c347399d1ea2e0c0c3f41b918f206f6833a9e0bde0af`. The original database was preserved and local services restarted. PostgreSQL data-only comparison differed only in randomly generated dump restriction markers; the restored backup was a full schema/data dump.

Ruff passed again. A redundant host verification pass stalled while reading/importing installed dependency files; pytest was interrupted during collection, and mypy hit an internal error then its isolated-cache retry was interrupted during file reading. These repeats are not passed checks. The preceding 76-test backend pass, 120-file mypy pass, 10-browser-check pass and web checks remain retained evidence; no backend application source changed during this deployment/audit follow-up.

## Aircraft inspection verification update — 2026-10-04

The aircraft inspection redesign, read-only component task/free-stock context and immutable common synthetic supply-delay revisions are implemented. Backend Ruff and mypy (121 files) passed in the complete Torch test image; 81 tests passed with PostgreSQL concurrency and sequence checks. Generated API/browser contracts include the new context and supply field. The actual browser workspace is captured locally; detailed UI checks, corrected integration failures and the earlier orbit-budget miss and latest passing local production measurement are retained in `docs/design/ui_verification.md`. This supersedes earlier UI/backend test counts, while the original scientific, operational and deployment gates retain their explicit boundaries. No public host/domain was provisioned and no data was published externally.

### Local customer trial — 2026-10-05

A real fitted/calibrated baseline and labelled validation-engine sample are installed locally; `/demo` now supports customer-entered histories/logistics through shared jobs, scoped planning, matched simulation, audited receipt/approval and recorded work consumption. The feature is restricted to development plus demo authentication. Trial resources/commitments are isolated from ordinary fleet proposals. Model installation and the visible synthetic utilisation/window policy do not establish new scientific or operational qualification. Seven focused trial service checks and the full 34-check browser suite passed; the 75-check backend run included isolated PostgreSQL concurrency. Remaining release gates listed above remain open. See `docs/product/customer_trial.md` and `docs/team/project_status.md` for setup, provenance, failures fixed and exact evidence boundaries.
