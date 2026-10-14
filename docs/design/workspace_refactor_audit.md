# Connected maintenance workspace implementation audit

Inspected 2026-10-13 before implementation. Preserve dirty working-tree changes, database rows, supported models, artifacts, visual identity and compatibility routes.

## Current boundaries and route inventory

Operational fleet: `/dashboard`, `/aircraft`, `/aircraft/:id`, `/health/:id`, `/advisories`, `/maintenance` (work/bays/register), `/spares` (inventory/requests), `/simulator`, `/notifications`, `/analytics`, `/data`. Uses FleetEngineRun hash-verified synthetic bundle and FleetAdvisoryDecision/FleetWorkOrder/FleetPartRequest/FleetRecordedClosure overlays.

Research: `/research`, `/fleet/register`, `/fleet`, `/components/:id`, `/planning`, `/inventory`, `/scenarios`, `/alerts`, `/ai`. Uses Aircraft/Component/Observation/ImportRecord/Assessment/Alert, MaintenanceTask/Plan/WorkRecord, Part/PartArrival/Reservation and MaintenanceResource/ResourceBooking/ResourceSlot. These identities and stocks are distinct from the operational fleet.

Trials: `/demo` creates dedicated components, imports, tasks, resources, parts and saved scenarios. Scope must remain independent. `/welcome` is the optional guide. Aliases `/review`, `/plan`, `/parts`, `/status`, `/overview`, `/component-health` retain incoming context.

## Service trace and gaps

- Research imports retain immutable input ancestry; assessment jobs use registered hash-verified FD001 models, quality withholding and cutoff-bound inference. Generic fleet readings currently only reach staging. No verified adapter permits applying FD001 to those subsystem readings.
- Research planning checks hard constraints and reservations transactionally with current input versions. Operational scheduling currently creates a work order and reservation directly and can accept an unreviewed finding; it lacks an explicit proposal/approval stage.
- Operational work completion resets component condition and affects availability without separate verification. Research work consumes reserved quantities once with command idempotency, but also has no explicit verification transition.
- Research deliveries are version-checked and credited once. Operational requests have only full-receipt status and derived quantity accounting; partial deliveries and cancelled received stock need explicit treatment.
- No shared persisted maintenance case currently links findings, decisions, exact evidence, proposals, tasks, work, resources, supply and verification.
- Server authentication uses opaque cookie sessions with CSRF/origin checks; demo header identities apply only in demo mode. Reads share the installation; do not claim per-tenant isolation. Role checks are in protected API routes.
- Durable jobs use PostgreSQL/outbox, Celery/RabbitMQ, attempt claims, stale rejection and cancellation. Keep numerical computation in science modules and transaction ownership in services.
- Global navigation has Operations/More/Research and replay in routine headers; this does not meet the requested six-destination navigation or explicit replay mode.

## Implementation and verification record

Implemented: persisted dataset-scoped cases and evidence links; four engineering review decisions; separate proposal, approval, execution and verification transitions; cumulative operational receipts; configured synthetic crew/bay capacity; strict current-input approval checks; a supported ingestion/job adapter; six-destination navigation, local URL tabs, compatibility redirects and contextual record links. Operational replay is explicit and guarded on the server. Existing research stocks and trial identities remain distinct.

Migration `1be4c3031b05` passed the full PostgreSQL upgrade chain and `alembic check` in `fleet_workspace_refactor_v2_test`. The application database was backed up to `/private/tmp/fleet-before-connected-workspace.dump` before its upgrade. No database reset or artifact deletion was performed.

Verified: 138 backend unit/verification tests, 78 integration tests (including separate-connection operational stock/resource approval competition and retry invariants), backend types across 166 source files, Python lint, frontend lint/typecheck/build and 27 unit tests. Four live-browser checks cover all-route navigation at 1440 and 390 pixels, lightweight Summary/Visual inspection loading and compression/security headers. No page exceptions or body-width overflow were observed on the six primary desktop screens or Overview/Aircraft/Maintenance at 390 pixels.

Before captures: `artifacts/workspace-refactor/before/`. First connected implementation: `artifacts/workspace-refactor/after/`. Visual polish at normal zoom: `artifacts/workspace-refactor/polished/`. The user accepted the connected flow and requested restoration of the earlier visual character. Compact action sections, readable table labels, lighter surfaces and small model-derived aircraft previews were then added.

Limits: this is not full F01–F08 scientific acceptance or a claim that every requested edge case has been independently demonstrated. Older fleet bundles lacking fitted ingestion context explicitly require a new supported engine run; no FD001 inference is applied to arbitrary subsystems. Existing legacy agency records have no invented historical crew/bay identities. Operational proposals optimise latest completion as a documented surrogate, rather than a proven fleet-wide downtime/bundling objective. Research/trial work remains connected through dataset adapters; installation-wide authenticated reads are not tenant isolation. Wider scientific parity, ingestion interruption/withheld recovery journeys and all 23 requested lifecycle scenarios still need a dedicated acceptance pass.

## AeroCare branding — 13 October 2026

The visible application name is AeroCare, using the supplied root PNG unchanged in public branding assets. Navbar, compact navigation, login, browser title/metadata/favicon, help/footer, copilot identity and report headers use the new name. The existing history export now downloads with an `aerocare-` prefix; its engine identity and import schema are unchanged. Package/module names, record IDs, database/volume names, API routes, cookie/storage keys and environment variable names retain their existing technical identities. No external deployment or GitHub publication was performed.

Local build recovery: Docker encountered host disk exhaustion while rebuilding scientific runtime layers. The runtime Dockerfile now changes ownership only for writable artifact directories instead of recursively copying `/app/.venv` into each changed layer. Unused Docker build cache reclaimed 16.53 GB; downloaded package registry metadata was also cleared. Existing images, containers, databases, volumes and scientific artifacts were preserved.

## Full UI follow-up — 13 October 2026

The model-first aircraft overview, direct blueprint tab, utility/settings structures, linked system/case actions and semantic controls were revised after user review. A 45-view, two-theme/viewport audit produced 90 captures with no page exceptions or page-width overflow. The affected browser suite now has 24 passing checks across the combined run and corrected targeted reruns; frontend lint/build and 27 unit tests pass. Detailed execution, initial failures, captures and remaining release limits are in `ui_verification.md`. No external deployment, GitHub publication or operational business mutation was performed during this pass.

### Aircraft showroom visual refinement — 14 October 2026

Reorganised the borderless viewer into an aircraft identity/condition header, dedicated camera
rail, large model stage and aligned browse/explore footer. Dark mode uses a slate lighting field
instead of the olive-black wash. Controls retain 40–44 px targets and visible focus/selection;
mobile stacks actions without page overflow. Model geometry and permission/data behaviour are
unchanged. Web lint/typecheck/build and three existing showroom browser checks passed, covering
five model families at desktop/mobile widths, reduced motion, failed requests and switching.
Light/dark transport previews are retained in `artifacts/ui-showroom-polish`.

### Registration information hierarchy — 14 October 2026

Overview leads with its title, workflow and availability metrics. Registration coverage is a compact
secondary note after metrics with an expandable denominator explanation; it is not an urgent banner.
Aircraft leads with a single Add aircraft action, then filters/search and the monitored fleet.
All aircraft retains user-entered records after the fleet; Onboarding opens that subset directly and
omits irrelevant health sorting/view controls. Registration uses an accessible dialog with focus
management and Escape. No identities, availability denominators or permission rules were changed.

### Model-first entry and atmospheric floor — 14 October 2026

Aircraft Summary now puts the interactive model before operational detail. Viewer entry resets the
retained register scroll position to clear the floating navbar. Measured header/toolbar/footer sizes
set the available model height on entry and resize, preserving the whole airframe and controls in
the viewport at tested desktop/phone dimensions. A static diffused green/teal field and masked
perspective floor grid add depth in both themes without a continuously animated canvas. Blueprint,
record status and maintenance remain reachable through their existing actions/tabs. Real register
card entry, both themes at 1440/390 px, all five airframes/cameras, switching/error retention and
reduced motion were checked. Captures: `artifacts/ui-model-entry`.

### Background depth correction — 14 October 2026

Reverted the availability-card evergreen experiment after user feedback. The requested contrast
belongs in the shared background: retained olive/lime wash and grid, added diffuse graphite/teal
edge shading, central light and a small repeating monochrome SVG grain tile. No extra motion,
foreground overlays or new layout was introduced. Light/dark at 1440/390 px visually checked with
zero horizontal overflow; lint/typecheck/production build pass. Captures: `artifacts/ui-background-depth`.
Design references: Atlassian elevation (https://atlassian.design/foundations/elevation/) and NN/g
visual hierarchy (https://www.nngroup.com/articles/visual-hierarchy-ux-definition/). The particular
lighting/grain treatment is a project design choice, not a prescribed or user-validated best design.

### Component context header — 14 October 2026

Replaced the all-caps, pipe-separated component strip with a component identity/back link,
condition and health summary, labeled serial/part/usage/criticality fields, and a separate history
window/what-if toolbar. Status uses the recorded component state independently of health-score
colour. Mobile uses two metadata columns and stacked controls; light/dark responsive captures
retained in `artifacts/ui-component-header`. Lint/typecheck/build and real range/scenario-link
checks passed. Existing recorded data, units and simulation permissions are preserved.
