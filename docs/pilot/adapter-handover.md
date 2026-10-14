# Aircraft-system adapter handover and acceptance

Status: proposed contract to complete with an authorised operator; **no new real-system connector
implemented by this document**. Existing supported formats remain unchanged.

## Required source package

| Area | Required information / evidence |
|---|---|
| Access and permitted use | Data owner, allowed purpose/users/environment, retention/export constraints, approval reference; no secrets in this package. |
| Scope | Aircraft type/variant/configuration, component serial/position, installation/removal effectivity and operating regimes. |
| Interface | Actual protocol and version, push/pull/export method, sample payloads, sequence/replay semantics, expected volume, burst/concurrency and downtime. Do not assume MQTT or a particular avionics protocol. |
| Signals | Identifier, physical meaning or explicitly unknown mapping, native unit, scale/offset, precision, valid range and basis, missing/fault/quality flags, frequency and clock semantics. |
| Time | Acquisition time and clock source, timezone/UTC conversion, resolution, accuracy, resets/drift, receive time, late arrival and correction behavior. |
| Maintenance | Work IDs, task definition/version, mandatory deadlines and units, opened/start/completion/verification events, actual findings, owner and outcome source. |
| Supply/resources | Part IDs and substitutions, physical vs reserved stock, expected vs received arrivals, qualified skills/bays/tools, calendars, bookings and constraints. |
| Availability | Authoritative state definitions/events, observation intervals, fleet membership, unknown time and permitted exclusions. A health score cannot stand in for this source. |
| Security | Isolated agency/scope, service identity and least privilege, secret rotation/revocation, transport trust, log redaction and network/egress approval. |

Use [signal-mapping.example.json](templates/signal-mapping.example.json). No signal's meaning, range or engineering unit
may be guessed from a similar public dataset. Do not rename hardware readings into FD001 features.

## Proposed canonical adapter envelope

This is a **design target**, not a request accepted by the current `/telemetry` endpoint:

```
source_id / adapter_version / schema_version
source_event_id / source_sequence / source_revision / supersedes_event_id
source_aircraft_key / source_component_key / installation_key
acquired_at_utc / received_at_utc / source_clock_quality
signal_id / native_value / native_unit / source_quality
normalised_value / normalised_unit / conversion_version
raw_payload_sha256 / permitted_raw_payload_reference
```

- Reconcile external keys to existing aircraft/component identities before using an observation.
  Keep the external mapping and effective installation interval. Component transfer/removal must
  end the old mapping; never join solely on a display tail or generic engine number.
- Preserve source bytes or an approved reference/hash according to the agreed retention policy.
  Hashes establish byte identity, not authenticity or correct sensor calibration.
- Keep native and converted values distinguishable; conversions are versioned and tested. Unknown
  units/identity/configuration go to quarantine, not the prediction pipeline.
- Establish an idempotency key from source identity, event ID and revision. Identical redelivery
  has one effect; conflicting content is retained for review. Corrections append ancestry rather
  than rewriting accepted model inputs or work history.
- Acquisition and receipt clocks remain separate. Define permitted delay/drift/reset behavior with
  the source owner. A receive heartbeat alone cannot make an old observation fresh.
- Buffer/reconnect, ordering and gaps follow the agreed protocol. The current demo rejects cycle
  gaps; a real adapter needs its own declared policy rather than silent interpolation.
- Persist accepted observations and calculation requests atomically using the existing shared
  service/outbox pattern. Numerical inference runs outside the ingestion transaction. Assessments
  reference frozen input/configuration/model versions. Delayed results cannot replace newer ones.

## Current implementation vs required adapter work

The application has supported identity imports, FD001 history imports, authenticated demo replay,
validation, jobs and evidence persistence. It does **not** yet implement arbitrary signal envelopes,
per-device service credentials, field reconnect buffering, verified installation transfers or a
production aircraft protocol. Build these only after the source contract is agreed. The supported
single-agency access boundary must be preserved or explicitly redesigned before broader sharing.

## Connector acceptance cases

| Case | Required outcome / retained evidence |
|---|---|
| Known aircraft, installation and unit | One canonical observation with source identity, acquisition/receipt time and conversion provenance. |
| Unknown/ambiguous identity or installation outside effectivity | Quarantine; no guessed component or model assessment. |
| Duplicate delivery / simultaneous delivery | One accepted business effect, deterministic acknowledgement and deduplication evidence. |
| Same event ID with changed content | Explicit conflict/correction path; original input remains resolvable. |
| Null, NaN/infinite, range/quality faults, unsupported units | Defined quality outcome; no invented zero or healthy score. |
| Clock reset, late/out-of-order/gapped input | Agreed reconciliation/withholding behavior with preserved acquisition and receipt times. |
| Source stops / reconnects | Agreed stale deadline, visible stale state, bounded retry/backfill, no false fresh state from rejected frames. |
| Process crashes before/after receipt and job publication | Replay/recovery causes no duplicate accepted observation, assessment or operational effect. |
| New model/configuration while a job runs | Original provenance retained; stale result cannot silently replace a current assessment. |
| Revoked/expired credentials, wrong scope, oversized payload/burst | Denied/bounded behavior and redacted audit; no bypass via demo headers. |
| Frozen representative load | API/queue latency, loss/duplicate rate and resource use meet budgets agreed before the run. |

Record owner, expected result, actual result and evidence reference in the acceptance register.
Passing a sample parser does not qualify transport under field outages or prove model suitability.
