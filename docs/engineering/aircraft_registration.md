# Aircraft onboarding contract

Customer-entered aircraft records are separate from the synthetic fleet-engine bundle and the
FD001 research dataset. Registration does not qualify a model or establish aircraft availability.

## Journey

Aircraft → Add aircraft → installed components → source reference/file → validation preview →
save immutable records. The register includes a paginated/searchable onboarding section. Overview
shows unassessed registrations separately; they never silently increase its available-aircraft
numerator or change the scored demonstration cohort's forecast denominator.

`/api/aircraft-registry` creates/lists identities; `/{id}` reads details; `/{id}/components`
registers installations; `/{id}/records` previews or commits an atomic JSON batch. Engineer,
planner, supervisor and administrator may write outside replay. Authenticated reads follow the
single-agency access boundary. IDs use REG/CMP namespaces; existing IDs/routes remain unchanged.

Tail, airframe serial, component serial and installation position are protected by database
uniqueness. Case is normalised for identities. Calendar cutoff uses Asia/Kolkata; stored creation
instants use UTC. Future registration/installation is rejected. A cutoff before fleet entry
returns no membership. Installation/source effective dates filter historical views.

## Source records

The downloadable JSON template supports airframe cumulative usage (hours and cycles), technical
history and mandatory maintenance requirements with due dates. Component links must belong to the
registered aircraft. Usage cannot decrease/conflict at the same date or be confused with component
usage. A source/payload fingerprint prevents repeated import effects. Preview does not write.
Every accepted batch is audited; imported records remain append-only.

No health score, risk, RUL or operational clearance is generated from these records. Unsupported
components remain explicit. Requirements stay visible without prediction; validated task duration,
resources and engineering decisions are prerequisites to executable planning. This release does
not add a universal aircraft-health adapter, scanned-document extraction, verified airframe CAD,
component replacement/transfer lifecycle, or an operator-qualified assessment model.

Schema a668260bb390 was generated with Alembic against the existing schema and reviewed: three
additive tables and indexes only. Existing aircraft/components are reused for identity; user-supplied
registrations are excluded from the separate research register. Database role/permission checks,
not UI visibility, govern changes.
