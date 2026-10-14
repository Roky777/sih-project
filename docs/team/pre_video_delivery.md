# AeroCare pre-video delivery — 14 October 2026

This report covers the implemented pre-video work in the current uncommitted workspace. Video
preparation (task 12) is excluded. This is a maintenance decision demonstrator, not an accepted
operational aircraft system. Existing unrelated workspace changes have been preserved.

## Delivered work and evidence

| Workstream | Implemented result | Verification / remaining boundary |
|---|---|---|
| Aircraft onboarding | Aircraft → Add aircraft; unique tail/serial, type/base/entry date, installed component identities, searchable paginated register and separate Overview coverage. | Real browser creation/import/reload checks and service/API negative tests. New registrations remain unassessed with unknown availability; they do not alter the scored demo cohort. |
| Supported source imports | Downloadable JSON template; usage, technical history and mandatory requirements; preview, atomic commit, provenance, duplicate detection, ownership/date/cumulative-usage checks and audit. | Invalid/insufficient history is rejected or withholds prediction. Registration is not a universal telemetry adapter, document OCR or model qualification. |
| Existing-result verification | Read-only reproduction script checks saved assumptions and exact plan snapshots, retaining unsupported evidence. | 68 saved runs: **8 matched, 0 mismatched, 60 unsupported legacy runs** without retained assumptions. Old results are not silently recreated from mutable scenarios. |
| Multi-aircraft demonstration | Four frozen synthetic cases with competing work, crew/bay constraints, crew closure, delayed parts and mandatory deadlines. | Real CP-SAT/SimPy execution; saved worker job, input/source hashes and JSON export. Identical reruns retained in `artifacts/availability-study-2026-10-14/final-a.json` and `final-b.json`. |
| Fair baseline | Earliest-release FIFO receives the same tasks/resources/supply/horizon as the constrained planner within each case. | Positive results, a tie and infeasibility retained. FIFO placement failure is not an infeasibility proof. |
| Availability impact | Analysis → Availability study shows availability, union aircraft downtime, task waiting, overrun resource queues and deadlines, with inputs/traces. | Scheduling and supply effects separated. No measured predictive-model contribution or real-fleet benefit claimed. |
| Connected workflow | Evidence → engineer review → proposal → supply readiness → approval → work start/completion → explicit human verification. | Five real guided-trial browser cases pass, including receipt/replan, stale saved-plan preservation, one-time kit consumption and final verified closure. Fixed missing final verification action. |
| Clean aircraft viewer | Large fitted live airframes, quiet controls, subtle change transition, reduced-motion support and usable preview fallback. | All five model families/camera views and responsive layouts checked. Illustrative geometry is not verified installation or fault-location CAD. |
| Faster grounded copilot | Direct fresh service answers and versioned site help; bounded model context/output; private local inference; per-turn read-tool reuse; checked sources/numbers and explicit answer modes. | Common measured queries avoid inference. Unknown/unusable citations, unmatched figures and clearance text withhold model explanation. Semantic correctness is not guaranteed by these checks. |
| UX / consistency | Shared navigation, theme persistence/synchronisation, small settings/account pages, keyboard/Escape, responsive tables, loading/error states and role-aware controls. | Primary/utility/detail pages and remaining workspace tabs audited at 1440/390 px in light/dark. Existing focused theme/navigation/stream/failure tests retained. Representative-user acceptance remains external. |
| Security / recovery / local rehearsal | Server roles, replay restrictions, session/CSRF/origin and stock/resource invariants retained; additive migration; consistent local backup and isolated restore rehearsal. | Selected integration/security checks passed. No cloud resources, public deployment, publication or operational data access performed. Independent security review and agency acceptance remain external. |

## Reproducible synthetic outcomes

The multi-aircraft study represents four aircraft over 112 hours (448 aircraft-hours).
At declared durations, delayed-supply constrained planning yields **176 aircraft-hours downtime**
versus **208 FIFO**, or **60.71% versus 53.57% availability**: 32 aircraft-hours and 7.14 percentage
points difference. With the same work and kit ready, constrained downtime is **136**, versus 208
FIFO. The 40-hour difference between the constrained cases is the supply change; do not add it
again as scheduling benefit. The single-task case ties at 8 hours; impossible deadlines return no
usable schedule. Duration stress assumptions are deterministic, not confidence intervals.

The guided one-aircraft trial separately reproduces **40 hours** with a delayed kit versus **16**
with it ready. That is a supply demonstration under entered assumptions, not avoided failure or a
measured operational improvement.

Study input SHA-256: `4cccbbb8d16c774d4bbe6281504168c8f76460c56503709070ef0ee639ba4c25`.
The two final report files are byte-identical with SHA-256
`1f1ff648fced580eb7cd17dbcea5046e3aee4a1d9ff4b3a0b7b78f97bef4ec17`.
The objective now minimises union aircraft grounding, then makespan, rather than makespan alone.
Existing plan snapshots retain their original objective meaning; new fingerprints prevent stale
approval. See [study design](../research/availability_study.md).

## Copilot measurements and limits

`artifacts/pre-video-2026-10-14/copilot-measurements.json` retains 14 local read-only questions:
**1.94–161.42 ms**, median **7.715 ms**, for final direct/help answers. This is a small warm local
sample, not a service latency guarantee. The same sample includes an open-ended model request:
first status **3.95 ms**, first provisional draft **7.67 seconds**, final check **25.69 seconds**.
Its explanation was withheld by the individual-citation guard; retrieved sources remained visible.
The earlier failed guard observation is retained separately, not reported as a checked success.

Local `qwen3:4b-instruct` is installed; private local mode is active. No API key, hosted fallback or
paid inference is required. Everyday suggestions use deterministic service/help routes. General
model answers still depend on local hardware and may fail verification. Source IDs and numerical
matching do not prove correct attribution or causality. Tricky clearance/exact-failure/future-record
requests receive bounded guidance; model text never grants permissions or approves maintenance.

## Executed checks

- Backend Ruff passes; mypy passes for 172 source files with optional Torch sequence modules
  excluded because Torch is absent from this check image. No full Torch check is claimed.
- **181 unit/verification tests pass**; **78 integration tests pass**, including isolated PostgreSQL
  concurrency checks and other integration fixtures. Deprecation warnings retained.
- Web lint, TypeScript and production image build pass; **28 unit tests** pass. Build retains
  optional chunk-size and ineffective CaseWorkspace dynamic-import warnings.
- **Five guided-trial end-to-end tests pass** against the ordinary local stack. Model and held-out
  sample installed with the documented hash-checking installer; scientific status remains
  `not_qualified`.
- Expanded layout audit: all four theme/viewport combinations and both spares interaction checks
  pass across the run/retry. Two initial checks hit the deliberate backend image restart and showed
  the backend-offline state; both passed after the restart. Failed evidence is retained.
- Earlier focused live tests cover onboarding/study persistence, all model families/cameras,
  settings/theme, scoped navigation, stream validation/cancellation, lazy assets and error recovery.
  These overlapping runs are not summed as a unique test count.
- Migration `a668260bb390` applied; Alembic schema check reported no drift. OpenAPI/TypeScript
  generated through repository tools. `git diff --check` passes.

## Recovery and external release gates

The coordinated backup is local at `artifacts/backups/pre-video-2026-10-14-final`; it contains
application records and protected model bytes, with private filesystem modes. It excludes secrets.
The isolated fresh restore matched all **48 table fingerprints** before writers started and
verified model artifacts. Observed restore time was **18.13 seconds**, not a promised RTO.
Evidence: `artifacts/pre-video-2026-10-14/restore.json`.
All **five guided-trial browser cases also passed on the restored installation**. Its containers
were stopped after verification, preserving volumes; ordinary AeroCare remains on port 8081.
Local backup retention is not encrypted offsite retention or an agreed RPO/RTO.

Before an operational release: obtain approved real platform interfaces/data and qualified models;
validate maintenance policies and representative workloads with authorised users; establish agency
identity/access, deployment secrets, trusted TLS, monitoring, durable backup retention and incident
procedures; complete independent security and operational acceptance. The synthetic demonstration
and local tests do not close those gates. No video work was performed.
