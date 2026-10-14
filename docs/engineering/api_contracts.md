# API Contracts

Status: proposed API semantics. Generate final OpenAPI from implemented FastAPI routes and keep this document aligned.

Implemented self-registration: `GET /api/access/registration` reports `enabled`;
`POST` accepts `user_id`, `display_name`, and `password`, returning 201 with the
normalized ID, display name and viewer role. Duplicate IDs return 409, invalid
fields or role injection 422, missing/untrusted Origin 403, and disabled signup
404. No session is issued until a subsequent login. See `permissions.md`.

## Conventions

Prefix application routes with `/api/v1`. Use opaque identifiers, explicit versions/units, timezone-aware timestamps and structured quality/provenance. Paginate collections and bound history windows. A success response must not imply unperformed validation.

Errors include a stable `code`, readable `message`, optional field/details and `request_id`, without secret/internal trace disclosure. Distinguish unauthenticated (401), forbidden (403), missing (404), version/stock conflict (409), invalid input (422), temporary service failure (503) and unexpected failure (500). Use 202 for accepted long jobs; distinguish accepted work from completed results.

## Proposed Endpoint Groups

| Operation | Proposed route | Semantics |
|---|---|---|
| Session | `POST /session`, `GET /session`, `DELETE /session` | Auth/session identity/logout. |
| Fleet | `GET /fleet`, `GET /fleet/{id}` | Permitted records and provenance. |
| Components | `GET /components/{id}` | Component and linked current/history metadata. |
| Observations | `GET /components/{id}/observations` | Bounded cycle/time query with units/quality. |
| Imports | `POST /imports`, `GET /imports/{id}` | Authorized supported-format import and outcome. |
| Assessment request | `POST /components/{id}/assessments` | Cutoff/model/input version; returns existing exact result or job reference. |
| Assessment retrieval | `GET /assessments/{id}` | Estimate/interval/quality/provenance. |
| Evidence | `GET /assessments/{id}/evidence` | Same assessment version and explanation availability. |
| Alerts | `GET /alerts`, `POST /alerts/{id}/acknowledgements` | Review signal/history; acknowledgement is not resolution. |
| Tasks/resources | `GET /tasks`, `GET /resources` | Planning records, capacities and permissions. |
| Proposals | `POST /proposals`, `GET /proposals/{id}` | Versioned planning request/result; no reservation. |
| Revision | `POST /proposals/{id}/revisions` | New input version/request, never hidden mutation of old result. |
| Approval | `POST /proposals/{id}/approvals` | Expected version and idempotency identity; atomic current-state checks. |
| Plans/work | `GET /plans/{id}`, `POST /work-records/{id}/updates` | Approved records and authorized actual progress/consumption. |
| Inventory | `GET /inventory`, `POST /inventory/adjustments` | Quantities/arrivals; traceable corrections. |
| Scenarios | `POST /scenarios`, `POST /scenarios/{id}/revisions` | Versioned assumptions. |
| Simulation | `POST /scenarios/{id}/runs`, `GET /simulation-runs/{id}` | Durable run/result with comparison context. |
| Jobs | `GET /jobs/{id}`, `POST /jobs/{id}/cancellation` | Authoritative lifecycle; request not guaranteed termination. |
| Updates | `GET /events` | Authorized SSE with cursor/replay policy. |
| Health | `GET /health/live`, `GET /health/ready` | Process and dependencies; no scientific reliability claim. |

## Contracts by Result

Assessment identifies component, input cutoff/snapshot, model/calibration, unit, point/interval, support/quality and evaluation reference. Proposal identifies tasks/input versions, horizon/unit, solver status, assignments, validation result and objective/bounds when available. Simulation identifies scenario/policies, horizon/state definitions, sampling/replications and metric units. Job identifies type/attempt/state/timestamps, optional measured progress and result/error reference.

## Mutation Consistency

Approval/revision/correction submits the expected record version. Use an idempotency key where retries could duplicate effects; identical keys with different request bodies are conflicts. A client confirmation dialog is not authorization. Job creation requires valid immutable input identity before enqueueing.

## Generated Client

Export OpenAPI from implemented code and generate the TypeScript client through the configured tool. Check regeneration in CI once implemented. Do not maintain a contradictory handwritten schema or invent executable routes before implementation.

## Implemented inventory quantity semantics

`GET /api/inventory` returns physical on-hand stock including active reserved units, and `reserved` separately. Free stock is `on_hand - reserved`. The existing persisted `Part.on_hand` counter stores free stock because approval decrements it when creating a reservation. The response reconstructs physical on-hand by adding active reservations; clients must subtract reservations exactly once. This correction changes no reservation transaction or schema.

## Implemented contract (2026-10-04)

The implemented prefix is `/api`, not the proposed `/api/v1`. FastAPI OpenAPI and the generated schema in apps/web/src/shared/api/generated are authoritative. Collections are currently bounded by stored demonstrator fixtures rather than generally paginated; pagination remains a scale limitation. Error responses use FastAPI detail plus request correlation headers, not the proposed complete stable-code envelope.

- `/access/session`: GET identity, POST credentials, DELETE logout.
- `/workspace/fixtures`: administrator-only atomic import of labelled synthetic aircraft/components/parts/tasks. Source-version replay is idempotent; conflicting payloads/identities are rejected and existing records are never overwritten.
- `/components/{id}/imports`: engineer/supervisor immutable FD001 full-history import; consecutive cycles starting at one, exactly 24 finite-or-missing features. Correction references the current previous import and preserves engine identity. Supported identities include dataset/subset/source partition.
- `/models/registrations`: administrator-only registration of an installed relative artifact directory with manifest/model/transform/calibration hashes. Executable deserialization occurs only after verification; registration does not qualify a scientific release.
- `/jobs/assessment`: immutable import/model identifiers and cutoff cycle; `/jobs/planning` and `/jobs/simulation/{scenario_id}` queue calculations. Retrieve `/jobs/{id}` independently of events; cancellation is POST `/jobs/{id}/cancellation`.
- `/assessments/{id}` retains historical evidence/cutoff/explanation availability. Component current views withhold stale estimates after imports change. `/alerts` gives current alerts; `/alerts/history/{component_id}` retains history. Acknowledgement is a separate review record.
- `/plans`: proposals retain input snapshots, objectives/bounds and parent revisions. POST `/{id}/approve` rechecks current inputs, resources and stock under locks; repeated approval is idempotent. Rejection/revisions retain previous results.
- `/work`: GET approved work and POST `/{id}/outcome` with action, expected version and notes. Completion requires started work, consumes reserved parts, and preserves history. Cancellation releases unstarted reservations only. Started work cannot be cancelled through this endpoint.
- `/inventory/{part_id}/adjustments`: version-checked quantity delta, reason and idempotency key; free-stock conflicts reject without partial changes. Inventory GET exposes physical on-hand and reservations separately.
- `/scenarios/{id}/revisions`: creates a distinct synthetic scenario with parent provenance and expected-version validation. Runs retain actual scenario assumptions/version and metric units.

Planning uses fourteen eight-hour slots, one engine-qualified crew and one bay in the current workspace service. Explicit compatible grouping keeps durations additive and contiguous; no grounding savings or useful-life benefit is inferred. Numerical RUL is in cycles; timestamps are stored with UTC timezone semantics. See production_readiness.md for evidence and unaccepted scope items.


`GET /api/jobs/{job_id}/attempts` returns durable attempt numbers, worker identities, states, UTC start/lease/finish timestamps and bounded outcome codes. History begins at the attempt-history migration; absence of earlier records is not proof that no earlier attempt ran. Assessment explanation metadata now includes method/version/reference and an explicit available/unavailable state; unavailable sensitivity does not remove a valid prediction.

## Expected delivery records

`GET /api/inventory/arrivals` exposes versioned synthetic expected/received/cancelled deliveries with eight-hour arrival slots. Logistics/supervisor may `POST /api/inventory/arrivals` with client identity, part/version, positive quantity, horizon slot and reason. Identical command retries retain one record. `POST /api/inventory/arrivals/{id}/outcome` records receipt or cancellation with expected version and reason; repeated terminal outcomes cannot credit stock twice. Receipt changes physical stock; cancellation does not. Part/arrival version and audit changes are transactional.

Expected deliveries enter immutable planning snapshots and cumulative time-dependent availability checks. A conditional proposal may wait for delivery; approval still requires received physical stock. Receipt, cancellation or correction invalidates the old source hash and requires a fresh proposal. Expected supply cannot authorize consumption before receipt.

## Inspection task context and synthetic scenario supply time

`GET /components/{component_id}/maintenance` is an authenticated read returning `component_id`, `slot_duration_hours=8` and task rows with identity/title/status/mandatory/deadline/duration/required_skill, part identity/required quantity/current free quantity and task version. Missing component is 404. Free quantity uses the internal unreserved stock value; physical on-hand and reserved quantities remain separately defined by Inventory. No mutation or prediction-to-task inference occurs.

`POST /scenarios/{scenario_id}/revisions` accepts optional finite `part_available_hours` (default 0), ≥0 and strictly before `horizon_hours`. Existing planner/supervisor permission and expected parent version apply. A new scenario identity retains the assumptions and parent ID. The common synthetic supply time delays events before bay acquisition. Saved run metrics include `part_wait_hours` separately from `queue_wait_hours`; grounded aircraft-hours include both waits and service time. A supply revision never mutates physical deliveries/reservations. Existing zero-time/default scenarios retain their prior behavior. OpenAPI/browser declarations are generated from the implemented FastAPI schema.

`GET /plans/{plan_id}/commitment` returns authenticated read-only retained reservation and work rows for the exact plan identity. Reservation rows contain part/quantity/status; work rows contain task/status/version, consumed quantity, notes and recorded start/completion timestamps. Empty proposals imply no committed rows, not successful approval. Unknown plan is 404. Reading history creates no reservation, stock change or work outcome. The Planning history panel refreshes after successful approval; mismatched history identity is withheld.

## Local customer trial

`/demo/catalog`, `/demo/trials`, `/demo/trials/{id}`, `/{id}/history`, `/{id}/jobs` and POST `/{id}/planning` compose existing workflows. All are rejected outside development plus demo authentication; mutations retain planner/supervisor checks. Typed requests/responses appear in generated OpenAPI. Trial creation is atomic; request-ID replay returns the same immutable manifest, conflicting content returns 409. History accepts the ordinary HistoryImport contract; only the selected prefix is imported. Missing model/sample setup returns unavailable catalog and prevents creation.

A tagged immutable Scenario JSON record stores trial relationships/request hash; it is excluded from selectable simulation scenarios. Separate matched ordinary scenarios retain the parts comparison. Trial plan snapshots retain `scope_component_id` and explicit advisory assessment/model/import/utilisation/policy/deadline provenance. Planning, revision and approval resolve that same registered scope, use dedicated parts/crew and reject corrected history. Standard snapshots exclude the reserved `trial-` identities and their commitments. Approval still locks current records, checks source hash, validates constraints and requires received stock. Customer receipt/start/completion call the existing inventory/work endpoints, with expected versions and notes. No alternate approval or stock implementation exists. See ADR 0005 and `docs/product/customer_trial.md` for policy semantics and limitations.

## Added contracts — 2026-10-05

- `GET /resources`: configured ordinary fleet crew/bays; `PUT /resources/{id}`: administrator only, expected version, compatibility/capacity/qualification/available windows. Active bookings prevent reconfiguration; resource kind is immutable. Slots are eight-hour half-open intervals within fourteen slots.
- `POST /components/{id}/imports/csv`: engineer only; JSON fields csv_text, source_version, engine_identity, optional previous_id. Exact canonical FD001 column order; batch rejection with row errors; no partial write. This is an example adapter, not a live aircraft connector.
- `POST /plans/{id}/comparison`: planner/supervisor creates a durable exact-plan comparison job. `GET /scenarios/runs/all?plan_id=...&limit=...` retrieves its immutable metrics/hash/timeline.
- Plans/jobs/runs accept bounded limit (1–200, default 100) and offset; jobs accept kind, plans accept scope_component_id, runs accept scenario_id/plan_id. Customer-trial queries filter in SQL and simulation queries request only the relevant scenarios.
- Delivery outcomes additionally accept quarantine/reject, with no usable-stock increase. Assessments explicitly return withheld and actionable quality reasons.
- Request bodies are bounded at 4 MB, including streamed bodies. Forbidden roles fail on the server; stale approval/configuration remains a 409 conflict. No shared-agency scope is accepted.

Approval also treats snapshot precondition failures (including active pre-resource work without crew/bay bookings) as HTTP 409, matching proposal/revision/job submission. It returns the actionable blocker, preserves the proposed plan and creates no reservations/work/audit/outbox effects. Empty schedules cannot be approved and return a no-scheduled-work conflict; the browser disables their approval/comparison controls. Repeated approval of an already accepted plan remains idempotent, including historical plans.

OpenAPI and browser declarations are generated from implemented routes; runtime validation remains required.

## Registration and grounding objective — 2026-10-14

Authenticated `/aircraft-registry` reads are paginated/searchable; writes enforce registration roles,
replay read-only, uniqueness and atomic import validation. See the registration contract. Registered
IDs and source provenance remain distinct from the synthetic scored fleet and engine research.

New proposal configuration `grounding-cpsat-v3` uses a composite lexicographic score: union aircraft
grounding slots × (horizon + 1) + makespan. Objective/bound values are not hours/cost and must not be
compared with legacy makespan scores. Saved plans retain their original inputs/configuration. Use
matched simulation downtime/availability for cross-policy comparison.

Copilot responses include `answer_mode`; REG context reads user-entered records without assigning
synthetic health or simulation eligibility. Common questions use direct service answers. Historical
maintenance uses cutoff-specific records and omits later completions/current-only phase data.

### Telemetry demonstration transport

Authenticated configured-demo `/api/telemetry` endpoints and frame/snapshot/role/freshness semantics
are specified in [live_telemetry_demo.md](live_telemetry_demo.md). Mutation uses the existing shared
import/job transaction with explicit `commit=False` composition; direct engine imports retain their
default commit behavior. No public unauthenticated device route or production protocol adapter added.
