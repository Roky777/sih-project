# Live telemetry and connected visual-twin demonstration

Implemented 14 October 2026. This extension transports archived simulated FD001 engine cycles over
live authenticated HTTP; it does not connect to an aircraft, qualify a model or validate geometry.
It is restricted to the existing configured demonstration environments. Production does not expose
this simulator as a general device-integration endpoint.

## Rehearsal

Open Data & integrations → Open live replay (`/telemetry`). An engineer or supervisor can create a
replay. The browser sends five cycles every two seconds while its producer is active. Pause/resume,
reload/reopen, rejection counts and latest accepted readings remain explicit. Leaving the page stops
future browser ticks; an already submitted request may finish. Saved running status is distinct from
freshness; no accepted transport for 15 seconds is stale. Another authorised local producer can send
frames to the same stream, but duplicate/out-of-order cycles are rejected.

A bounded headless local producer uses the same backend replay route:

```
python3 scripts/simulate_telemetry.py --ticks 6 --interval 2
```

It prints the saved stream ID, advances 30 cycles, then pauses. Reopen that ID in the UI; no provider
key, external service or paid inference is needed. This script uses local demo headers and refuses
non-local hosts. Authenticated session deployments need their ordinary session/CSRF/origin handling;
do not turn on demo authentication in production.

The existing local calibrated `customer-trial-v1` model and retained sample must be installed.
Missing/changed source prevents replay. There is no generated healthy-data/model fallback.

## Transport and assessment contract

- `POST /api/telemetry`: create a synthetic aircraft/component mapping and persisted stream.
- `GET /api/telemetry`: latest 20 saved streams; `GET /{id}`: latest accepted frame, pipeline,
  snapshot-bound assessment, freshness, provenance and last ten rejected reasons.
- `POST /{id}/frames`: `{frames:[{cycle:1,values:[24 finite numbers or null],observed_at:"...Z"}]}`;
  one to ten frames. Feature order is FD001's three operating settings then sensors S1–S21.
  Values retain source-dataset units; no unknown sensor is assigned a physical name/unit.
- First cycle is one; subsequent cycles and timezone-aware transport timestamps strictly increase.
  Future timestamps beyond 30 seconds, unsupported shape/nonfinite values, duplicates and gaps
  are rejected. Missing readings remain null and can cause assessment withholding.
- `observed_at` is the replay transport observation time, not an invented aircraft acquisition time.
  `last_received_at` is backend receipt time. Either stale observation or stale receipt makes the
  stream stale. Rejected frames do not refresh successful-receipt freshness.
- `POST /{id}/replay`: advances 1–10 archived rows (default five), or sends a deliberately invalid
  cycle for a visible quality demonstration. Stream supports at most 180 cycles.
- `POST /{id}/control`: running/paused. Completed streams are closed to new frames/control.

Mutations require engineer/supervisor and reject historical replay. Reads use the existing single-
agency authenticated boundary. PostgreSQL row locking serialises producers on each stream. Accepted
rows append to the bounded buffer; rejection reasons/counts and audit events persist. Raw rejected
payloads are not retained/echoed. Oversized/malformed HTTP bodies still follow the common API
validation boundary; they need not become stream rejection events.

At each crossed 30-cycle boundary, the accepted prefix becomes an immutable import linked to its
previous import, and the existing assessment/outbox/worker pipeline runs. Buffer updates, import,
job and audit commit together. A newly queued snapshot does not borrow an older snapshot's score.
Display distinguishes latest received cycle from assessment cutoff. No random score or live RUL is
interpolated between snapshots. Prediction, alert policy and human maintenance decision remain
separate. Existing assessment execution creates/reuses the component's case for engineer review.
The separate synthetic operational fleet's availability denominator is unchanged.

## Visual mapping

The interactive airframe has one explicit engine-to-component mapping and a colour applied to the authored nacelle/propeller assembly. A top-down schematic shows the same identity/state; the remaining assemblies are not
assessed. Clicking the model/list focuses its evidence, which links to component history, model,
quality and review. A recorded warning/critical review concern is red across the mapped assembly, not a
circular fault marker; a retained concern takes priority over a stale colour. Staleness remains
visible in connection text. Available model evidence with no review concern is labelled monitored,
not aircraft healthy or cleared. Missing/withheld evidence stays unassessed. Installation anchors,
engine assembly and airframe are conceptual, not verified CAD or physical fault localisation.

## Remaining real-integration gates

An authorised aircraft interface requires its protocol, schema, acquisition timestamps, identity/
installation lifecycle, units, authentication, buffering/reconnect policy, retention, load envelope
and applicable model qualification. New hardware values must not be fed to FD001 by renaming them.
Engineering validation requires verified geometry/locations and a separately evaluated physical
model. This demo proves transport/evidence connectivity, not those operational capabilities.

Schema migration `4df3056445d1` was generated through Alembic and reviewed as one additive stream
table. Existing record IDs, database names, API routes and configuration keys are preserved.

## Executed verification

- Backend Ruff and mypy (176 files, optional Torch sequence modules excluded) pass; **186 unit/
  verification tests pass**, including invalid/gapped/duplicate frames, future/naive timestamps,
  stale observations, snapshot ancestry, completion and production denial.
- Web lint/typecheck/production build and **28 unit tests pass**. Existing optional chunk warnings
  remain. Generated OpenAPI/TypeScript contracts retained; Alembic reports no schema drift.
- Real local PostgreSQL/outbox/worker/browser test advances through six snapshot assessments,
  verifies duplicate rejection under concurrent posts, saved reload, latest import linkage,
  completed/stale status, top-down condition and component navigation. All five existing customer
  trial cases also pass. The initial test producer omitted its required engineer role and correctly
  received 403; the authorised rerun passed without weakening permissions.
- Browser automatic producer accepted 30 cycles and paused; the independent CLI producer did the
  same through HTTP. Desktop/mobile light/dark layouts were inspected without horizontal overflow.
  No real device, production transport/load or engineering-geometry acceptance is claimed.
- Retained final demonstration engine estimate at cycle 180 is approximately 14.3 cycles with a
  0–44.8 interval, and a recorded demo-policy review concern. It is an output of the installed
  simulated-data model, not an actual aircraft failure forecast. The authored left nacelle/propeller
  assembly is coloured to match that record; other parts remain unassessed.

Evidence and captures are local in `artifacts/telemetry-2026-10-14`. These are new scoped demo records;
existing operational aircraft and approvals were not rewritten.
