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
