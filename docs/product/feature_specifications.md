# Feature Specifications

**Project:** Aircraft Predictive Maintenance & Fleet Availability
**Problem statement:** PS 26249
**Repository location:** `docs/product/feature_specifications.md`
**Status:** Initial behavioural specification; implementation and validation pending
**Related documents:** `intent.md`, `scope.md`, `docs/product/acceptance_criteria.md`

## 1. Specification Conventions

This document defines intended behaviour for the eight scoped features and their supporting workflow. It does not claim the features are implemented. Numerical performance targets belong in acceptance criteria and evaluation protocols.

- **Observation:** recorded sensor/usage input, with source and cycle/time context.
- **Assessment:** a versioned prediction and its uncertainty/data-quality information, computed from a specific input snapshot.
- **Alert:** a review signal produced by an explicit policy; distinct from a maintenance task.
- **Task:** a unit of maintenance work with explicit duration, resource needs and applicable constraints.
- **Proposal:** a computed schedule awaiting review. It does not reserve resources merely by existing.
- **Approved plan:** a proposal accepted after authorization and current-state checks, with committed reservations.
- **Scenario:** a versioned set of assumptions used for planning or simulation.
- **Availability:** a defined simulated state/metric, not an airworthiness declaration.

All material outputs identify their source, relevant units and version. Distinguish recorded data, synthetic fixtures, predictions and projections. Backend rules remain authoritative; interface checks improve feedback but do not replace server validation.

Roles below are conceptual responsibilities, not finalized access-control identifiers. Define exact permissions separately.

## 2. F01 — Unified Component and Maintenance Records

### Purpose and users

Give planners and technical reviewers one traceable view of a component's usage, observations, assessments, maintenance work and related parts.

### Inputs

- Supported dataset files and explicitly versioned import configuration.
- Aircraft and component records, including labelled demonstration mappings.
- Sensor/usage observations with engine identity and cycle/time context.
- Task, resource and inventory fixtures or authorized entered records.

### Behaviour

1. An authorized user selects a supported import and reviews its source/format.
2. The system validates structure, identities, cycles/timestamps and declared units before making the import available to downstream calculations.
3. The import records accepted/rejected counts and actionable validation messages. Strict versus partial acceptance is an explicit import policy, never a silent choice.
4. Reimporting the same source/version must not silently duplicate observations. Conflicting values for an existing identity require an explicit correction/version process.
5. Users can search/filter the fleet and open a component record.
6. The record shows usage, sensor histories, latest available assessment, alert history, task history and relevant part/resource relationships.
7. Historical records remain distinguishable from current records. Corrections retain provenance rather than silently rewriting inputs underlying earlier results.

### Outputs and states

Outputs: searchable records, observation history, import result and provenance links.

States: loading; no records; import validating; import accepted; partially accepted when permitted; rejected; source conflict; inaccessible record. Missing history is shown as missing, not as evidence of good health.

### Boundaries and verification focus

No arbitrary schema inference, scanned-log extraction or live airline integration. Verify joins, deduplication, unit validation, correction history and input traceability.

## 3. F02 — Remaining-Life Estimates with Uncertainty

### Purpose and users

Help a technical reviewer inspect remaining useful life for a supported engine/component, including the estimate's uncertainty and applicability.

### Preconditions and inputs

- An evaluated model artifact with a manifest and its associated preprocessing/calibration artifacts.
- A supported component/input snapshot and sufficient history for that model.
- Declared target definition, units, supported regimes and data-quality policy.

### Behaviour

1. A reviewer opens a component or requests an assessment at a selected historical cutoff.
2. The system resolves an eligible model and validates the available history.
3. Historical replay uses only observations available at the cutoff; future observations/labels cannot enter the input.
4. Inference uses the model's recorded preprocessing. It must not refit normalization on the current test component.
5. Store the estimate, evaluated uncertainty representation, input snapshot, model/calibration versions and quality status together.
6. Display remaining life in its supported units, initially cycles. Any calendar projection additionally displays the usage assumption and is labelled a projection.
7. Show the interval's nominal level and measured evaluation coverage where available, with the evaluation context. Do not translate these into an individual engine's probability of failure.
8. Users can inspect prior assessments and their changing estimates. Mark assessments stale when newer relevant observations or a changed input version exist.

### Outputs and states

Outputs: point estimate, uncertainty representation, provenance, support/quality status and evaluation link.

States: queued; running; completed; insufficient history; unsupported model/regime; qualified result; withheld; stale; failed. Invalid numerical results, invalid bounds or negative life values are handled by a documented output policy. Do not silently clamp a faulty result into a plausible healthy value.

### Boundaries and verification focus

No whole-aircraft readiness score or exact failure-date claim. Compare models under common engine partitions and target definitions; check leakage, preprocessing parity, calibration and error by life stage/regime.

## 4. F03 — Prediction Evidence Card

### Purpose and users

Let a reviewer understand the observations and model behaviour behind an assessment before using it for planning.

### Inputs

An assessment, its recorded input snapshot, sensor metadata, explanation method/version and available evaluation summary.

### Behaviour

1. Open the evidence card from a component, assessment or alert.
2. Display estimate/interval, input cutoff, model version and current/stale status.
3. Show relevant sensor histories and operating context using documented names/units. Unknown physical mappings remain generic sensor identifiers.
4. Display missing/imputed observations and data-quality warnings.
5. When supported, show model-input influences or an interpretable-model explanation with its reference/baseline and limitations.
6. Distinguish an input's influence on the model from a confirmed mechanical cause.
7. Provide links to input provenance and the applicable model evaluation.
8. If explanation generation fails or is unsupported, keep the valid assessment visible with an explanation-unavailable state. Do not invent a narrative.

### Outputs and verification focus

Outputs: trends, explanation, provenance and limitations linked to one assessment version. Explanation results for a different version must not be attached to the current assessment.

Check version alignment, historical cutoff, imputation visibility, explanation stability and appropriate labels. A text summary, if included, must derive from available structured evidence; an LLM is not required.

## 5. F04 — Stable Maintenance Alerts

### Purpose and users

Direct attention to supported deterioration signals while reducing unnecessary alert changes caused by minor prediction fluctuations.

### Inputs

Assessment history; versioned alert thresholds/persistence or hysteresis settings; data-quality policy; applicable task deadlines as separate authoritative records.

### Behaviour

1. Evaluate an eligible new assessment with the configured policy.
2. Compare thresholds in declared units and use only historical information available at evaluation time.
3. Apply the defined stability mechanism and record which evidence triggered or changed the alert.
4. Present the current state and its history: active/unacknowledged, acknowledged, resolved, or superseded as applicable.
5. Acknowledgement records that a person reviewed the alert. It does not resolve deterioration or mark work complete.
6. Resolution requires an explicit policy condition or a permitted recorded action with a reason; retain the history.
7. A newer conflicting assessment may change priority/state but does not delete previous evidence.
8. Withheld/invalid assessments produce a distinct data-quality review indication according to policy. They must not silently resolve a health alert.
9. Overdue mandatory tasks remain visible regardless of the prediction-alert state.

### Outputs and verification focus

Outputs: alert state, trigger evidence, policy version, review history and associated component/assessment.

Check chronological processing, repeat-event deduplication and invalid-data handling. Evaluate warning lead time, missed events, false alerts and recommendation changes against a threshold baseline. Configure targets in the evaluation protocol.

## 6. F05 — Resource-Constrained Maintenance Planner

### Purpose and users

Help a planner construct an executable maintenance proposal and understand constraints preventing work.

### Inputs

- Versioned task set and finite planning horizon.
- Durations, required parts/resources, permitted task windows and mandatory deadlines.
- Resource capacity, qualification/compatibility information and availability calendars.
- Part stock/arrival assumptions and existing reservations.
- Fixed commitments and task precedence.
- Eligible health assessments and the explicit rule translating them into proposed maintenance windows.
- Objective, weights, discretization and solver settings.

### Behaviour

1. The planner selects tasks, horizon and input/scenario version.
2. Validate required fields, unit conversions and contradictory inputs before solving.
3. Capture the input snapshot and submit a durable planning job.
4. The optimizer respects hard constraints and evaluates the configured objective. Optional tasks must be distinguished from mandatory tasks; omitted work remains visible.
5. Store solver status, timings, objective/bounds when applicable, schedule and input/configuration versions.
6. Independently check returned schedules against the declared constraints before presenting them as usable proposals.
7. Display a read-only schedule/timeline initially; any edit creates a revised proposal requiring revalidation.
8. Show assignment details: task, start/end, aircraft/component, crew/bay and parts needs.
9. Identify known bottlenecks. Diagnostics may use prechecks or explicit additional analysis; do not imply the solver automatically provides a complete causal explanation.
10. Changing resources, usage or tasks creates a new version and job. Older results remain historical.

### Required result distinctions

| Result | User-facing meaning |
|---|---|
| Optimal | Solver establishes optimality for the stated model/settings. |
| Feasible | A checked schedule exists; optimality is not established. |
| Infeasible | The solver establishes no feasible schedule for the formulation. |
| Unknown/time limit | No definitive feasibility conclusion or usable result was established. |
| Invalid input/model | The request or mathematical formulation is invalid. |
| Failed | Execution error; distinct from mathematical infeasibility. |

Mandatory constraints must not be silently relaxed. When constraints conflict, the planner may revise assumptions or tasks through an explicit new version; the application does not authorize changing mandatory maintenance rules.

### Verification focus

Check resource overlap/capacity, precedence, parts timing, deadlines, commitments, discretization and independent validation. Compare with an earliest-deadline or another defined baseline on common task instances.

## 7. F06 — Compatible Maintenance Grouping and Parts Bottlenecks

### Purpose and users

Help planners reduce repeat groundings where justified, and help logistics coordinators understand and reserve required parts.

### Inputs

Task compatibility/grouping rules; permitted windows; maintenance durations; part quantities and availability; reservations; early-maintenance penalties or useful-life tradeoffs.

### Behaviour

1. Identify candidate tasks that may share a grounding according to explicit rules.
2. Evaluate group scheduling while retaining deadlines, resources, ordering and task-specific durations. Grouping does not imply all work can happen simultaneously.
3. Show tasks included, the rule permitting grouping, and the estimated tradeoff relative to separate work.
4. For each task/proposal, show required quantities, available/reserved quantities and the assumed arrival of shortages.
5. An unapproved proposal does not consume stock. Approval performs current availability checks and reservations atomically with plan commitment.
6. Concurrent approval requests must not reserve the same unit twice or drive available stock below the permitted quantity.
7. Cancelling/revising committed work releases or adjusts reservations according to explicit lifecycle rules. Consumed stock is not restored merely because a historical plan is cancelled.
8. Manual inventory corrections require authorization, reason and history.

### Outputs and verification focus

Outputs: grouped proposal, bottleneck details, reservation/consumption history and configuration provenance.

Check grouping compatibility, early-work tradeoffs, stock races, revisions and release/consumption behaviour. Inventory forecasting, automatic purchasing and supplier messaging are excluded.

## 8. F07 — Fleet Availability What-If Simulation

### Purpose and users

Help supervisors and planners compare maintenance alternatives under explicit logistics and usage assumptions.

### Inputs

Versioned fleet mappings, starting states, usage schedule, component-life/health assumptions, candidate maintenance policies/plans, repair/arrival distributions or fixed values, resources, horizon and replication settings.

### Behaviour

1. Select a scenario or create a named revision from permitted inputs.
2. Validate units, distributions, relationships and initial conditions.
3. Define the scenario's availability states and denominator before running. Explain whether metrics use aircraft-time, count at a selected instant, or another declared definition.
4. Submit a durable simulation job. Run baseline and candidate alternatives under comparable scenarios; retain seeds and sampling/version details.
5. Model grounding, resource acquisition/waiting, work completion and return to simulated availability according to stated rules.
6. Record downtime, resource waiting, stockouts, unplanned groundings and applicable useful-life penalties. Only report metrics the model supports.
7. Display repeated-run summaries and variability where stochastic replication is used. A deterministic run must not receive a fabricated confidence interval.
8. Label outputs simulated projections, with links to assumptions and scenario/model/policy versions.
9. Comparisons with mismatched horizons, fleet mappings, units or scenario definitions are blocked or explicitly qualified. Changed assumptions produce a new run, never a silent rewrite of prior results.

### Outputs and verification focus

Outputs: scenario revision, run manifest, per-policy metrics, variability and event histories sufficient for relevant checks.

Verify small reference cases, conservation/state transitions, event ordering, common comparison inputs and recorded seeds. Maintenance reset/replacement effects are assumptions unless supported by data. The simulation does not optimize flight/mission assignment or establish operational readiness.

## 9. F08 — Data-Quality and Robustness Controls

### Purpose and users

Help reviewers distinguish usable evidence from incomplete, stale or unsupported inputs.

### Inputs

Observation validation rules; model history requirements; expected units; supported operating regimes; missingness/imputation policy; freshness definition where applicable.

### Behaviour

1. Validate observations at import and model input at assessment time.
2. Record quality findings separately from model estimates.
3. Identify observed versus imputed values. Apply only the model's evaluated imputation/transformation policy.
4. Determine assessment eligibility using explicit criteria. Distinguish blocking failures from warnings.
5. Show qualified results with visible limitations; withhold results when the configured policy requires it.
6. Propagate assessment quality into alert and planning eligibility. A withheld assessment cannot silently supply a numerical maintenance window.
7. Retain mandatory tasks when health prediction is unavailable.
8. Quality flags reflect conditions detectable by the implemented checks. Do not claim detection of every out-of-distribution state.

### Verification focus

Inject missing values, contiguous sensor outages, noise and supported regime changes according to the research protocol. Report prediction/interval degradation and how often results are withheld. Do not interpret imputed signals as measured physical recovery.

## 10. Human Review, Approval and Completion

Approval is a supporting workflow connecting F05/F06 to maintenance records.

1. An authorized reviewer opens a proposal with its evidence, input version and constraints.
2. Review includes warning/quality status and the provenance of any projections used.
3. Approval rechecks the current plan version, tasks, stock and resource commitments. A changed state produces a conflict requiring review; it must not silently approve a modified plan.
4. Commit the approved version and its reservations consistently. Repeated submission of the same operation must not duplicate commitments.
5. Record approver, decision time, proposal version and supplied review reason where required by the permission policy.
6. Create or associate approved work records with the committed tasks.
7. Completion records actual work status, timing and relevant part consumption. Partial completion is distinct from completing every task.
8. Update future views/planning inputs through recorded changes. Do not erase historical predictions or automatically retrain a model after completion.

The initial application records demonstration work; it does not perform repairs or provide aircraft clearance.

## 11. Durable Calculations and Result Consistency

Prediction batches, optimizer runs and simulations may execute outside web processes.

- Record job identity, owner, type, input/configuration snapshot and lifecycle state.
- Distinguish queued, running, succeeded, failed, cancellation-requested and cancelled states; progress may be unknown rather than an invented percentage.
- Retries retain attempt identity and must not duplicate material effects.
- Publish dispatch reliably using the specified job/outbox design.
- Persist results before announcing successful completion.
- Reject late results from invalidated/cancelled/superseded attempts according to explicit lifecycle rules.
- Cancellation may require cooperative processing; distinguish a request from confirmed termination. Never imply a killed computation has rolled back every external effect automatically.
- Restarts allow recovery or a clearly recorded failure rather than silently lost work.
- Users can retrieve current state after reconnecting; live events are not the only record of job completion.

Detailed transport, retry and state-transition contracts belong in `docs/engineering/job_lifecycle.md` and `events.md`.

## 12. Cross-Feature Interface Requirements

The default entry is `/dashboard`; `/welcome` is an optional workflow guide, and `/overview` redirects to it. Fleet operations connect aircraft/component evidence, findings review, confirmed work scheduling, supply and recorded outcomes. Engine register/component/planning screens remain in Research with retained component context and explicitly fleet-wide general solver scope. Component pages present saved model evidence before sensor charts; the research action remains “Calculate maintenance schedule.” Presentation does not automatically generate qualified maintenance tasks from predictions.

The Fleet entry explicitly explains the AI's maintenance problem and links to `/ai`, also available as **AI & evidence** in navigation. This view separates learned remaining-life estimation, alert policy, constraint optimization and scenario simulation. Its component selector uses fleet mappings and authoritative component/assessment records, retains selection in the URL, rejects mismatched component/aircraft or assessment provenance, displays quality findings and preserves unavailable states. Users can open sensor history/quality from the same component. Static explanation remains visible during record retrieval failure; no canned numerical output, operational savings or whole-aircraft diagnosis is shown.

Every principal screen provides appropriate loading, empty, unavailable/error, stale and permission-denied states. Data-quality and uncertainty indicators must be understandable without relying on colour alone.

Charts identify units, legends and context. Component selections and date/cycle cutoffs must remain consistent across linked views. Frontend formatting must not change the meaning of backend units. A UI preview does not constitute validated plan approval.

Synthetic/demo inputs are identifiable in relevant views and provenance. Avoid presenting scheduled maintenance status, component health and simulated availability as a single unexplained safety score.

## 13. End-to-End Demonstration Contract

The principal demonstration must be able to:

1. Load labelled fleet/logistics fixtures and a supported held-out engine history.
2. Replay that history at explicit cutoffs without future-input leakage.
3. Display an evaluated assessment, uncertainty and evidence.
4. Display the resulting alert history.
5. Generate a checked proposal with a visible resource/parts constraint.
6. Revise one assumption and obtain a separately versioned proposal.
7. Compare alternatives through a reproducible simulation.
8. Review/approve a plan with current-state reservation checks.
9. Show a sensor-outage case with the prescribed quality response.
10. Retrieve the associated records and manifests explaining what was measured, estimated or assumed.

Do not invent fixed prediction accuracy or availability gains in the demo. Use actual evaluated results and label scripted fixtures. Acceptance criteria will define pass/fail evidence for this specification.

## Aircraft inspection presentation and supply what-if

The Fleet entry offers an illustrative aircraft with only API-verified mapped engine selection. Spatial/list selection and retained URL context lead to actual assessment/history/quality, input/model provenance and component task/stock context. No physical installation verification, unmodelled component assessment or validated airframe twin is inferred. Keep scientific/permission/job/approval contracts authoritative.

`GET /api/components/{id}/maintenance` exposes read-only task requirements and currently free part stock, with an explicit 8-hour slot unit. It does not reserve inventory or infer repair tasks from a prediction. A new scenario revision may set `part_available_hours`: a global synthetic common supply-ready time measured from scenario origin, nonnegative and strictly before the horizon. Events wait for supply before requesting a maintenance bay. Retained metrics separate part wait from bay queue wait, while grounded time includes both. Defaults preserve prior supply-ready-at-zero behavior. Parent scenarios and saved outcomes stay immutable; compare runs only under matching retained demand, fleet count and horizon. This research assumption is not an inventory lead-time forecast or approved maintenance cost.

The exact selected proposal has a Reservations & work history panel backed by `/plans/{id}/commitment`. It shows actual retained part commitment quantities/statuses and task/work identities, versions, consumed units, outcome notes and recorded timestamps. It remains read-only; work-outcome mutations keep their existing supervisor-only version contract. Proposed plans explicitly have no commitment. This closes the presentation path from approval to retained history without inferring stock from a plan assignment.

## Aircraft twin showcase (2026-10-09)

Camera distance is fitted to the actual normalized model bounds and current viewing direction, including pointer orbit and preset interpolation, with a 12% projection margin. Desktop camera/component controls share a spaced stack rather than independent absolute positions. Camera buttons use consistent centered labels and target sizes. Component condition opens a labelled modal side drawer with every selected-record component sorted by condition/health, returned life units, direct evidence links and a system-map shortcut. Escape/close dismiss it and restore trigger focus; navigation/replay changes close it so prior records do not persist. Usage values have consistent line heights; details actions retain a flat underline.

Following explicit approval of a visual-only alternative, the aircraft-detail studio now uses an authored Tejas-inspired delta-wing fighter GLB with cockpit/intake/exhaust/gear and surface details, plus a matching simplified fallback silhouette. The heading and expandable accuracy notice identify it as illustrative. It replaces the transport only in this studio, preserves selected-record evidence/browsing and does not assert that the synthetic fleet is that airframe or shares its physical engine/component layout. Engineering validation remains unavailable. Geometry source/build/provenance are in the asset register.

Current presentation uses a model-first white/pale-neutral showroom with a larger default three-quarter view and compact front/side/top camera controls on the right; shared navigation remains frosted. Aircraft identity and condition occupy the upper stage; four API-backed usage/health statistics occupy a separate lower band. Component condition opens an explicit modal drawer rather than an always-visible card column, retaining all condition/health-ordered components, returned remaining-life units and direct evidence links. History/advisory tabs and system details follow the showroom. Mobile arranges controls in separate rows without widening the page. Reference-to-delivery differences are recorded in `docs/design/aircraft_reference_comparison.md`. Engineering-accurate fighter geometry is explicitly pending authorised source data and a chosen airframe; the existing illustrative model is not such a deliverable.

The aircraft page shares the dashboard's soft green/blue ambient background; the model stage adds a restrained mint wash without tinting model materials or white evidence cards. The stage has a decorative pale flexible grid: its dip follows camera/aircraft motion and pointer movement adds decaying water-like waves with a subtle soap-film sheen. Foreground data/model/controls remain unblurred and the layer does not capture input. Reduced motion freezes the grid. Background animation pauses offscreen, in hidden documents and during component-condition inspection. This effect changes no condition or scientific semantics.

The fleet-health aircraft detail Digital twin tab adds an illustrative studio-lit 3D collection with vertical pitching transitions and a pale-neutral model background. Browse only API-returned aircraft through next/previous, selector, arrow keys or model-region wheel input. Fetch and validate the next aircraft identity before starting the transition; retain current data and show an error on failure. Flight hours, cycles, health and open-advisory counts in the lower band belong to the selected synthetic aircraft snapshot. Unknown values stay unavailable. Side/top/three-quarter camera views and pointer orbit are presentation controls. Reduced motion skips interpolation. Asset/renderer failure keeps the poster, records and system/component evidence usable. The system map and component tree remain linked to the selected aircraft; quantitative and approval contracts are unchanged. See `docs/design/3d_viewer.md` for timings, reconstruction limits and resource lifecycle.

### Interactive aircraft blueprint

The showroom's bottom orbit/scroll instruction caption is removed at the user's request. Pointer orbit, wheel/arrow browsing and the labelled aircraft/camera buttons retain their existing behavior.

Immediately below the studio, a unified inspection workspace retains aircraft/snapshot context and Blueprint, Components, History and Advisories tabs. Component records open directly, system rows support keyboard expansion, and switching tabs keeps the showroom mounted. Explore blueprint selects its tab and scrolls to the workspace. The selected aircraft has an authored multi-view fighter blueprint and optional rotatable translucent 3D cutaway of the existing visual GLB with solid component assemblies and top/front/side/three-quarter camera presets. Drawn assembly regions and a keyboard-operable register use only the selected API response. Watch/degraded/critical/failed records or current non-completed/non-dismissed advisories are red condition findings; maintenance is separately blue and healthy/no-advisory records green. A findings-only filter never synthesizes faults. Twenty known synthetic catalogue types have explicit conceptual locations and illustrative assembly models; unsupported types retain their records without invented spatial mappings or structures.

Selecting a drawn assembly/register entry opens a modal inspection with assembled/exploded/wireframe structures, orbit/reset controls, actual identity/serial/health/life/risk and current advisory references. Evidence links open the authoritative component page. Changing aircraft/cutoff remounts the blueprint and discards previous selection. Escape/close returns focus to the selected register item. Render failure preserves textual records/evidence and the SVG drawing. Geometry and locations are labelled conceptual: red highlights the component's record, not a diagnosed internal defect. This presentation extension does not implement a validated physical twin, real installation map or root-cause analysis.

## Local customer trial (2026-10-05)

### Shared workspace navigation

Workspace backgrounds share a restrained flexible grid behind content, not over evidence cards, charts or forms. The aircraft-detail stage retains its model-following grid with no duplicate workspace renderer. Grid rendering sleeps after motion/ripples settle, wakes for pointer/aircraft changes, bounds sample/raster cost, and uses lighter mobile geometry. Touch scrolling does not trigger waves; reduced motion is static. Hidden/offscreen surfaces and open navigation/search dialogs pause background work. Decoration never determines data or interaction availability.

Operations, aircraft and research routes use one consistent frosted navbar and mobile destination list. Header sizing/spacing are responsive by viewport only, never by route. Six primary operations links retain their order; More holds operational support tools and Research holds the engine dataset tools. Search, theme, fleet alerts and account tools remain present, with server-backed badges and route-active states. Research content retains its separate scientific context and permissions; shared navigation does not confer new authority. Expanded menus stay within the viewport and close after route selection; the mobile dialog supports Escape and trigger focus restoration.


`/demo` implements the connected, customer-entered rehearsal specified in [customer_trial.md](customer_trial.md) and ADR 0005. It uses existing ingestion/model jobs, planning, simulation and approval/work services. Each immutable case has dedicated synthetic resources and retained results. A visible versioned utilisation/window policy bridges AI cycles to a synthetic review window; ordinary fleet task windows are unchanged. Customer trials require development plus demo authentication. Missing/mismatched/withheld AI blocks an evidence-informed trial proposal; hard constraints remain enforced. The browser supports entered history/cutoff/logistics, real calculations, received-stock replanning, explicit approval and work outcomes. This adds demonstrator behaviour without claiming operational policy qualification or full F01–F08 acceptance.

## Connected workspace consolidation — 11 October 2026

Fleet operations use one findings queue, one maintenance workspace (work board, bays/timeline, archive), and one supply workspace (inventory/demand, requests). Aircraft/component handoffs retain context and scoped record views; aggregate views identify fleet-wide scope. Proposed findings require confirmation before the scheduling action is offered. Work lifecycle controls live on the readiness-aware board. Old duplicate URLs preserve context through redirects. Desktop/mobile/search use one navigation inventory. Engine research keeps its separate dataset, exact planner approvals and trials, explicitly independent of fleet replay. See [user flow](user_flow.md) and [site audit](../design/site_flow_audit.md).

## Copilot response delivery refinement — 2026-10-12

Exact whole-question matches for fleet count/current availability, recorded availability changes, the 30-day forecast, selected sensor history, open aircraft maintenance and explicit part stock bypass language inference while retaining selected-date service data, reserved/available stock distinctions and evidence artifacts. Ambiguous, unsupported causal, future-date and what-if questions use the existing validated tool loop. Longer answers stream provisional text, then replace it with the final checked reply, citations and warnings. Private Ollama inference is the default; enabled local-only mode rejects hosted providers, cloud model names and public endpoints. Hosted inference requires deliberately disabling local-only mode and configuring a private key. There is no guaranteed hosted latency or unlimited free usage.

### AeroCare product identity and connected workspace presentation

AeroCare is the visible product name. The supplied logo appears in navigation, login and report headers; browser metadata, help and the maintenance copilot use the same identity. Existing record IDs, API paths, database names and configuration keys remain stable. History downloads use an AeroCare filename prefix while preserving their import schema and provenance. The aircraft register remains lightweight. Selecting an operational aircraft opens its Overview with the existing interactive illustrative airframe, camera controls and snapshot-backed statistics. Explore aircraft switches directly to the Blueprint URL tab; the blueprint does not download on Overview. Overview, Blueprint, Components, Maintenance and History share one aircraft identity and context. Old visual URLs resolve to Blueprint; old twin URLs resolve to Overview. Model failure preserves textual records and navigation. Status badges and health/attention metrics use labelled semantic colours, without inferring a physical fault from the illustrative geometry. The overview workflow toolbar keeps role context secondary to review, work and supply shortcuts.

### Complete workspace UI and control audit — 2026-10-13

Overview uses five KPI cards in one desktop row, availability/downtime charts in a 7:5 split, and system health/priority cases in a 5:7 lower row, matching the supplied 20 October reference. Panels stack at widths of 1100px or less. Overview metric cards use compact desktop sizing (152px measured height, 34px values) and share label/value/supporting-text rows; chart panels have equal heights and aligned heading separators, while health and priority panels stretch to equal lower edges. Compact priority-card spacing and consistent padding/radii retain the same content and actions. Mobile charts reserve additional height for wrapped headings and legends. The Overview desktop header follows the latest supplied compact reference (72px bar, 184px logo, 40px navigation, 42px action controls and 13px text). Its frosted layer uses a 66%-opaque pale surface with 26px blur and 1.15 saturation; other pages and mobile toolbar sizing remain unchanged. The health matrix fills its panel, retains every aircraft through bounded scrolling, exposes keyboard cell descriptions and links to the selected aircraft/system. Colour labels distinguish restrictions, review, available resources, analysis and maintenance.

Maintenance separates the work queue, planning/schedule, case register and history into URL-addressable views rather than placing a complete case table ahead of every work control. Case actions reveal the applicable review/planning/execution section. Mandatory tasks do not offer predictive dismiss/monitor forms. Proposal controls require the current planning step; the server remains authoritative on evidence, permissions and commitments.

Header and Settings share a persistent light/dark preference, including cross-tab storage updates and a session fallback when storage is unavailable. Theme changes update chart palettes without remounting or discarding unsaved forms. Appearance is available to all signed-in roles; capacity editing retains its existing authorization. Account separates identity and role responsibilities; Help provides labelled guidance and sandbox links. Escape closes account/notification menus and restores focus. Sign-out failures remain visible instead of becoming an unhandled promise. The mobile copilot entry is in the header rather than covering page controls.

Research surfaces retain one primary heading and their own dataset context. Research inventory does not show misleading operational tabs, and research views do not display operational fleet workflow counts. Spatial aircraft/component selection preserves the research dataset and updates the selected aircraft route. Illustrative model failure retains a matching-family preview, records and a working blueprint action. This presentation work does not establish aircraft diagnostic qualification, scientific acceptance or public-deployment readiness.

### Navigation-state follow-up — 2026-10-13

Aircraft register filters, search, view and sorting use URL state so reloads, shared links and returning from a detail page retain the selection. Invalid findings page numbers resolve to an available page; an out-of-range case queue offers a direct first-page recovery. Workspace search retains page shortcuts when record search fails, supports retry and scrolls keyboard selection into view. Empty results cannot move the selection below zero. Shared section tabs use one keyboard focus target with Left/Right, Home and End navigation.

## Aircraft-detail composition — 13 October 2026

Operational aircraft detail uses Summary, Components, Maintenance, History and Visual
inspection URL-backed tabs. Summary orders compact identity, local tabs, recorded
operational status, a contained airframe viewer, four statistics and aircraft-scoped
findings/maintenance summaries. Blueprint and assembly tools belong to Visual inspection;
its Aircraft model / Blueprint & assemblies selector mounts only the chosen viewer.
Legacy `tab=blueprint` remains readable as Visual inspection.

Current agency work is read from the authoritative work-order service, including recorded
closures, rather than inferred from predictive findings. An aggregate health score or zero
open findings does not clear a restriction. Missing ownership, blockers and return dates
remain explicit. An agency promise is labelled separately from a confirmed return.
Historical replay uses snapshot work records, excludes current cases/proposals/task deadlines,
and does not retrieve them as historical evidence. Navigation prefetches the matching detail
key and changes the record together; stale aircraft-specific query and pinned AI context
are cleared. Previous/next controls stop at register boundaries. Existing model assets,
geometry, evidence drawers and permissions are preserved.

### Aircraft-local Maintenance tab — 13 October 2026

The selected aircraft's tab now uses a single scoped worklist instead of stacking the
fleet case table, an overlapping work card and repeated long advisory cards. Active work,
findings/engineering decisions and mandatory requirements have separate responsibilities.
A predictive case and its matching finding share one entry and action; cases explicitly
linked to visible work are not repeated in the review section. Mandatory cases do not
suppress an independent predictive finding for the same component. Long assessment text
is expandable. Upcoming task deadlines are not presented as work already in progress.
Case and work actions retain their existing routes and server permissions.

## Aircraft showroom refinement — 2026-10-14

The aircraft model uses a continuous, borderless surface, a large fitted airframe, compact camera presets and an external browsing/action footer. The local animated grid is removed from this viewer. Model-only opacity changes use a 100 ms departure and 220 ms arrival after successful next-record retrieval; no taxi/rotation transition remains. Identity, records and statistics change together. Reduced-motion browsing skips these fades. Camera presets interpolate over 360 ms, or switch immediately under reduced motion. Component evidence, blueprint handoff, family-specific fallback and browsing boundaries remain available.

## Aircraft onboarding and availability evidence — 2026-10-14

Aircraft registration and installed-component/source-record onboarding follow the [registration
contract](../engineering/aircraft_registration.md). The dashboard reports unassessed user-entered
aircraft separately, without invented availability/health or mixed research data. JSON batch preview,
atomic commit, duplicate protection, cumulative-usage checks and retained mandatory requirements are
implemented; universal sensor/model coverage is not implied.

Analysis adds a saved, worker-backed Availability study with fair within-case FIFO comparisons,
supply sensitivity, equal outcomes and impossible deadlines. The planner objective now minimises
union aircraft grounding slots before makespan; versions and limits are in the [study protocol](../research/availability_study.md).

## Live replay and connected visual engine — 14 October 2026

`/telemetry` provides a configured-demo-only FD001 replay transport with persisted source identity,
ordered frame validation, duplicate/rejection audit, pause/resume and receipt/observation freshness.
Bounded accepted prefixes feed the shared immutable-import and assessment job pipeline at 30-cycle
boundaries. A conceptual 3D engine envelope and top-down schematic show the same component's
snapshot-bound review concern; unmapped parts remain unassessed. Evidence links lead to the existing
component/review journey. See [transport contract](../engineering/live_telemetry_demo.md). This adds
a live-ingestion demonstration without changing the real-aircraft/physical-twin scope gates.

## Dashboard overview invitation — 2026-10-15

On every full workspace page load/refresh, show a compact welcome dialog with Skip and Start
overview. Keep dismissal in component memory only; do not persist a seen flag. Internal navigation
within the workspace must not reopen it. Skip, Escape and completion close the dialog and return
focus to the workspace. Starting the overview highlights existing navigation controls for fleet
overview, aircraft, AI findings, maintenance/spares, simulation and Ask AI. Back/Next navigate the
overview itself, without navigating product routes or changing records. At narrow widths highlight
the existing navigation-menu button for hidden navigation links. Retain current data, routes,
dashboard layout and permissions. The dialog follows the current light/dark theme.

### Role-first overview refinement

The invitation starts with an unselected Choose your role dropdown using the four existing product
roles: maintenance engineer, maintenance supervisor, logistics team and fleet manager. Start overview
is disabled until selection. Each role has its own steps, ordering, responsibilities and evidence
boundaries. Change role on the first guided step returns to the invitation; Back returns between
steps. Choosing a tour role does not switch the account/demo role, grant permissions or alter data.
The role selection resets on refresh along with the invitation; Skip needs no selection.

## Workspace-first account entry — 2026-10-20

The public root opens the four workspace cards before credentials, including when a server
session is already restored. Clicking a card selects it; Select workspace explicitly continues
to `/login?workspace=…`. An existing session is ended only when the visitor confirms a new
workspace. Failed sign-out stays on entry with an actionable error. Anonymous entry does not
prefetch protected fleet records. Direct login/signup links without a valid workspace show
the selector; valid workspace links remain refreshable.

Login and Create account retain the selected workspace across mode changes and refresh.
Change workspace returns to the cards and clears password fields. Login submits the workspace
for existing server authorization and opens the authenticated role's home. Protected record
bookmarks and ordinary refresh inside a signed-in workspace retain their existing behavior.

Signup retains the normalized account ID, clears passwords and returns to the selected
workspace's login without creating a session. In the explicitly configured isolated public
demo, new accounts support all four workspaces and login applies the chosen session role.
Previously registered viewer accounts can use their existing password in any chosen demo
workspace too. Normal production signup remains viewer-only; staff access still requires
assignment there. Disabled signup, password mismatch, duplicate IDs, rate limits and backend
errors retain their recovery paths. The demo policy cannot be enabled in production.

This section supersedes account-first public entry. Local header-demo entry is unchanged.

## Role workspace entry — 2026-10-16 (historical server entry)

Replace the tour's native role dropdown with a dedicated visual workspace entry, using the shared
layered grid and green/white surfaces. Local development explicitly identifies role selection as
password-free demo entry: selecting one of the existing four role cards applies the actual local
demo role and opens its existing home. Preserve deep links to aircraft/cases/research records.
Real account sign-in retains the existing credentials, CSRF, registration and lockout behaviour;
only the server-assigned workspace is selectable after authentication. Client cards cannot promote
an account. Each successful sign-in clears entry completion; normal refresh retains workspace entry
within the tab but still shows the optional overview. Change workspace reopens entry. No fake login,
private role credential storage or real user assignment is introduced.

The overview automatically follows the selected/assigned workspace role, without a second dropdown.
The existing dashboard's Priority actions defaults to the case's next responsible team (fleet
manager sees all); All teams retains shared context. A team queue is not an individual assignment.
Existing KPIs, fleet data, twin, records and maintenance/supply/scenario flows are retained.

### Progressive hover entry — 2026-10-16

On a fine mouse pointer, staying over an available role card reveals the exact selected green
surface left-to-right over two seconds. Completion enters that role through the existing entry
function; it does not represent data loading or grant additional access. Leaving, switching cards,
pointer cancellation, Escape on the card, window blur or visibility changes cancel the dwell.
Click/tap selection and Open workspace remain available; keyboard focus alone never enters.
Disabled server-role cards cannot start the animation or enter. Reduced-motion preference removes
the moving fill while retaining the delay and explicit entry alternatives. Reuse existing role
homes, deep-link preservation and permission boundaries; no fleet-data changes.

### Liquid role selection and explicit entry — 2026-10-16

Supersedes automatic hover entry: the exact selected-card green rises behind a gently moving liquid
edge. Completing the two-second fill selects the role only. No hover, timer or animation callback
may enter the workspace, change the effective account/demo role or navigate. Only Select workspace
confirms entry. Pointer cancellation retains any previous completed selection. Click/tap/keyboard
and reduced-motion alternatives remain available, and locked roles remain inert.

Warm the read-only engine-readiness query during the authenticated role-entry screen. Reuse that
cache when the workspace opens, with a single readiness observer and a five-second connection
deadline without automatic request retry. Incomplete engine generation still polls; unavailable
status shows an explicit Retry state. Live events open only after workspace entry, close while the
tab is hidden, and reconnect with authoritative-query refresh on return. Do not change fleet data
or hide connection failures with fabricated ready states.

### Contained tour highlights and workflow cards — 2026-10-16

Tour outlines sit two pixels inside the visible control and inherit its corner radius. Dim the
surrounding page without a protruding halo. Track navigation sizing changes, including asynchronously
loaded badges, as well as viewport changes; hidden mobile controls use the existing menu fallback.
Show each of the five maintenance-flow items as an individual rounded card with consistent gaps.
Use green value badges for nonzero work counts and the simulated availability forecast; zero counts
remain neutral. Preserve values, links, role ownership and stage semantics. Cards wrap responsively.

### Reference workflow bar — 2026-10-16

Supersedes the separate-card presentation above: use one white rounded bar with five equal desktop
columns, no individual borders or count capsules, and a pale green active step. Keep neutral plain
counts, green role ownership indicators and existing links/data. Wrap only on smaller screens.
Use the existing AeroCare logo, six primary navigation links (Analysis for `/analysis`), and
search/theme/Ask AI/notifications/account controls. More and Research remain accessible in the
account menu and mobile navigation. Preserve the contained tour highlights.

Availability visual refinement: the forecast alone uses a compact pale green badge, stronger green
percentage and a slim proportional track. Keep the same forecast value and simulated-forecast title;
unavailable data stays a dash without a filled track. Other workflow counts remain plain.

### Viewport-contained workspace entry — 2026-10-17

Keep role selection inside the viewport with a dedicated, always-visible confirmation area. Tighten
spacing and role-card height on laptops; on narrow screens prioritise the role panel over decorative
intro copy. On constrained heights, only the role content scrolls; it must not overlap the confirmation
area. Preserve explicit Select workspace, all four roles, liquid selection and permission boundaries.

Remove the redundant `01 / WORKSPACE` label and top spacing. At short viewport heights, omit repeated
interaction guidance and secondary descriptive copy so the complete role grid and confirmation fit
without internal scrolling at the verified laptop/phone dimensions. Preserve role names, icons,
destinations, selection state and demonstration-data footer. Overflow remains an accessibility
fallback for enlarged text or other constrained viewports rather than clipping role choices.

Availability refinement: retain green forecast text and proportional track, but use a transparent
badge background and border when the availability step is unselected. Only its selected state gets
the green fill/border. Hover alone must not fill the percentage badge.

## First-login tour persistence — 20 October 2026

Supersedes refresh-triggered invitations: show the tour once per account in the current browser.
Record that it has been presented immediately, so refreshing even before Skip/Finish does not
reopen it. Skip, completion, navigation, new tabs and later sign-ins retain that preference. Different
accounts have independent flags; local-demo roles have independent demo identities. Only a browser
preference is stored, with no credentials. Clearing site storage or using another browser resets it;
this is not a cross-device server profile. Storage denial falls back to memory for the current page.

Health-card interior reference refinement: preserve desktop outer bounds while placing sort controls
and all four legend items in one row, removing only this panel's heading divider, and using the
reference's square health swatches, circular maintenance marker and evenly spaced rectangular cells.
The matrix retains all aircraft through internal scrolling and keeps its existing selection/sorting.
Mobile retains its existing wrapping layout and outer dimensions.

Priority actions reference refinement: remove this panel's heading divider and stretched action
whitespace. Retain two-by-two desktop case boxes with consistent compact text, badges, spacing and
review buttons; use one column on phones. Case identities, details, role filtering and links remain.

Aircraft register reference presentation: five compact cards per desktop row above 1240px, 156px
minimum card height, 18px tail labels and 46px health rings. Keep all six status filters, live counts,
search, Cards/Table and Risk/Health/Tail sorting together in a responsive toolbar. Controls wrap on
smaller screens, preserving current data, URL filter semantics, permissions and record navigation.

Aircraft component expansion layout: maintain fixed name/HI/state/risk/RUL/advisory/evidence column
widths through expand/collapse, use the green selected-row theme, and keep serial/criticality details
inside the name column. Preserve evidence links and system toggle accessibility; narrow viewports
scroll inside the table container rather than changing page width.

Findings reference presentation: use Inter for heading, workflow labels, table text and actions;
Roboto Mono for compact rounded filter values and tail search. Keep the live status options and
existing role-dependent actions. The availability reading uses green Inter text and a proportional
track with transparent background when unselected. Changes are scoped to Findings; no forecast,
status, count, role or case data is changed to reproduce screenshot numbers.

Maintenance reference presentation: operational queue/History share Inter heading/body typography,
compact coloured due-task boxes with monospaced due-day values, consistent confirmed-finding cards,
and reference Planned/Recorded work panels. Preserve due-task precedence, role restrictions, work
records and all scheduling actions. Desktop queue columns use 2.4:1, stacking at 1100px; research
workspaces are excluded. The forecast reading remains green on a transparent unselected background.

Findings advisory drawer reference presentation: use a frosted right panel with a blurred overlay,
compact Inter headings and body text, monospaced advisory identifiers, a coloured action banner,
rounded case context and four metric cells. Keep case navigation, evidence, model details and all
existing advisory data. Desktop width is 630px, constrained to the viewport on mobile; case actions
wrap on narrow screens. These styles are scoped to the Findings drawer.

Operational Spares reference presentation: begin with the workflow strip, retain an accessible
page heading, then show Requests/Inventory/Deliveries tabs and role guidance. Use Inter typography,
rounded panels, a compact request empty state and neutral shortage rows with textual status pills.
Availability retains its live value with a green reading and slim proportional track. Research
inventory, stock calculations, request lifecycle and role permissions remain unchanged.

Scenario comparison presentation: separate curves, impact cards, assumptions and supporting
results with a consistent 16px vertical gap. Expanded assumption snapshots scroll horizontally
inside their own block when necessary; simulation values and calculations remain unchanged.

Account navigation: More and Research use compact disclosure rows with chevrons and indented
destination links. Avatar sizing/glass selectors apply only to the profile's direct summary;
nested disclosures retain normal menu sizing. Preserve native keyboard expansion, visible focus,
scroll containment, existing destinations and account-menu close behavior.

Audit hardening — 20 October 2026: workflow stage navigation retains aircraft, component, case
and replay parameters. Aircraft browsing retains the active tab, inspection and return URL while
clearing selections that belong to the previous aircraft. Research engine selection preserves its
dataset/view. Disabled trials provide installation guidance and return navigation. A disabled
assistant is omitted from the first-login tour. Mobile blueprint handoff closes the component drawer
before selecting and scrolling to the rendered blueprint. Shared header styling applies consistently
across routes; 320px telemetry controls and short-screen workspace entry remain contained.

## Import form consistency — 20 October 2026

Aircraft onboarding previews apply to the exact source reference and uploaded JSON content.
Changing either requires validation again; a delayed response for older inputs cannot enable
saving or display its preview as current. Clearing an upload clears the pending content, and
older asynchronous file reads cannot replace a later selection. Moving to a different aircraft
resets that aircraft's import form. Server-side atomic validation remains authoritative.

The ingestion tester rejects JSON null, non-object bodies and missing readings arrays with
a visible validation message instead of a browser exception. Reset sample clears validation
errors as well as the prior result.

Aircraft browsing shows an unknown position/count while the register is unavailable, rather
than a fabricated first position out of zero. The loaded register supplies the actual position.

## Copilot common-question routing — 2026-10-20

Complete, bounded wording variants for fleet counts/availability, urgent findings,
spare shortages, selected aircraft/open work, sensor trends and the standard forecast
use existing permission-checked services without inference. Preserve selected dates,
record scope, source links and synthetic/projection labels. Do not truncate compound,
hypothetical or explicitly dated questions into generic current counts. Ambiguous
flight/fight/fighter queries ask whether the user means aircraft; no flight-booking
or fighter-specific coverage is inferred. Missing selections prompt for a record;
missing spare records do not imply zero stock. Complete greetings use site guidance.
Model interpretation/explanation stages appear in the chat while generation runs;
failed, cancelled or truncated answers cannot leave a completed fabricated response.

## Assistant latency and inference contention — 20 October 2026

Current fleet-count/availability and recorded-downtime answers retrieve recorded state and a
14-day observed history without preparing a Monte Carlo forecast. The dashboard summary API
retains its existing forecast by default; forecast questions continue through the dedicated
forecast tool. The internal fleet-summary tool now contains recorded fields only and directs
forecast requests to `get_existing_forecast`. Snapshot, replay, role and evidence rules remain.

Bounded self-introduction questions still use the configured model, with the full system rules
and conversation history, but omit unrelated maintenance-tool definitions. Compound requests
and ambiguous follow-ups retain the full permitted tools. One local inference turn per API
process is admitted at a time; overlapping model questions receive a retry message rather than
competing for CPU. Direct records and guidance remain usable during an inference turn. This
process-local gate does not coordinate separate API processes or other model clients.

Model-call timing logs contain counts/durations only, never prompts, generated replies, record
identities, endpoints or credentials. Operator diagnostics can time read-only record questions
and, explicitly with `--benchmark`, one synthetic model introduction. No model/provider change,
output-budget reduction, automatic model download or inference-speed guarantee is introduced.

Greeting transport refinement: a validated completed answer is terminal even if the connection
remains open; release that transport promptly. Invalid final responses and incomplete streams
retain explicit failures. Authentication read connections must be returned before long model
streams/inference and model-availability probes. TLS supports HTTP/2 to multiplex event streams
and ordinary API calls.
Timing logs for all answer modes contain computation metadata only; no greeting or other user
text is copied into logs. Greeting service timings and end-to-end VM timings remain distinct.
