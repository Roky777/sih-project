# Acceptance Criteria

**Project:** Aircraft Predictive Maintenance & Fleet Availability
**Problem statement:** PS 26249
**Repository location:** `docs/product/acceptance_criteria.md`
**Status:** Acceptance specification; original full release remains incomplete. Individual implemented checks and retained results are recorded in [project status](../team/project_status.md), [release readiness](../operations/production_readiness.md) and [UI verification](../design/ui_verification.md); this specification is not a completed release acceptance record.
**Related documents:** `intent.md`, `scope.md`, `docs/product/feature_specifications.md`

## 1. How Acceptance Works

This document defines evidence required to accept the scoped demonstrator. Planned capability, implemented capability and validated capability are distinct.

Each criterion receives one status: **not run**, **passed**, **failed**, or **blocked**. A blocked or unrun required criterion does not count as passed. Associate results with a source revision and the exact input/configuration versions used.

Passing functional checks does not establish predictive accuracy, simulation validity or operational suitability. Scientific claims require their own evaluations. The release remains a demonstrator using supported engine data and labelled logistics assumptions.

### Evidence record

For each criterion, retain:

- Criterion identifier and status.
- Source revision, environment and relevant versions.
- Input/fixture/dataset/configuration identifiers and hashes where applicable.
- Test or evaluation command and output artifact.
- Actual outcome and comparison with the required condition.
- Limitations, failures or unresolved dependencies.

Machine-verifiable checks should retain machine-readable results. Screenshots or walkthrough recordings demonstrate interface behaviour but do not substitute for constraint, concurrency or leakage checks.

## 2. Evaluation Decisions Required Before Testing

The following values are not invented here. Define them in the referenced protocol, version that decision, and freeze it before the corresponding final evaluation.

| Decision | Required specification | Owning document |
|---|---|---|
| Dataset support | Subsets/regimes, engine partitions, target definition/capping, cutoff/window rules and preprocessing. | `docs/research/dataset_protocol.md` |
| Prediction acceptance | Baselines, error metrics, late-prediction penalty, aggregation, repetitions and an application-relevant acceptable error bound. | `docs/research/evaluation_protocol.md` |
| Uncertainty acceptance | Nominal interval level, calibration procedure, coverage tolerance, acceptable width, groups and sufficient sample criteria. | Evaluation protocol |
| Alert acceptance | Policy thresholds/margins, event definition, warning horizon, false/missed-event budgets and schedule-change comparison. | Evaluation protocol and alert configuration |
| Planner acceptance | Instance families, units/discretization, objectives, baseline, time limit and required quality/runtime. | Evaluation protocol and scheduling configuration |
| Simulation acceptance | State definitions, usage/repair/logistics assumptions, replications, comparison metrics and sampling procedure. | `docs/research/simulation_assumptions.md` and evaluation protocol |
| Responsiveness | Target hardware/browser, dataset/visible-chart size, user concurrency, concurrent jobs and latency/resource budgets. | Acceptance benchmark configuration linked from evaluation protocol |

Decisions may be informed by training/validation experiments or stakeholder needs. Do not choose thresholds after inspecting the final test outcomes merely to make a result pass. A changed protocol requires a separately identified evaluation and an honest account of previously inspected data.

## 3. F01 — Unified Records

| ID | Required condition | Evidence |
|---|---|---|
| AC-F01-01 | Supported valid imports produce correct component/observation/task relationships and source/unit metadata. | Import fixture checks and database/API assertions. |
| AC-F01-02 | Reimporting an identical source/version does not duplicate observations or tasks; conflicting existing values follow the documented correction policy. | Repeated/conflicting import tests and provenance history. |
| AC-F01-03 | Malformed identities, invalid cycles/times and unsupported units are rejected or explicitly reported under the configured partial-import policy. | Invalid-input cases and accepted/rejected counts. |
| AC-F01-04 | A displayed assessment or proposal links to its actual input snapshot; later corrections do not silently rewrite historical evidence. | Versioned correction and retrieval checks. |

## 4. F02 — Life Prediction and Uncertainty

| ID | Required condition | Evidence |
|---|---|---|
| AC-F02-01 | Engine identities do not leak across required disjoint partitions; fit transformations use only permitted training data. | Split manifests, transformation provenance and leakage checks. |
| AC-F02-02 | Training and serving apply the same versioned transformation, feature ordering, units and target definition. | Parity check on a fixed input with an explicit numerical tolerance. |
| AC-F02-03 | Historical replay cannot consume observations beyond the selected cutoff or future target labels. | Cutoff tests, including modifications to future observations that leave current inputs unchanged. |
| AC-F02-04 | Classical and sequence candidates are evaluated under the same protocol; the selected model meets the predeclared error requirements. | Held-out metrics and subgroup/repeated-run results where specified. |
| AC-F02-05 | Intervals meet the predeclared coverage/width requirements on eligible evaluation groups; insufficiently supported groups are disclosed. | Coverage, width and sample-count reports with calibration provenance. |
| AC-F02-06 | Results contain model/input/calibration versions and quality state; invalid or unsupported results are qualified/withheld by the defined policy. | API/output validation and model-support cases. |

Do not require a neural model to beat a classical model. If the baseline is stronger, it may be selected. If no candidate meets the declared quality requirements, this feature is blocked for its claimed support boundary; revise the scope or method explicitly rather than fabricate success.

## 5. F03 — Prediction Evidence

| ID | Required condition | Evidence |
|---|---|---|
| AC-F03-01 | Evidence charts, influences, cutoff and provenance belong to the same assessment/input version. | Version-alignment assertions and a reviewed evidence card. |
| AC-F03-02 | Units, missing/imputed values and known limitations are visible; unknown physical sensor mappings remain labelled as such. | Interface walkthrough and metadata cases. |
| AC-F03-03 | The chosen explanation method is evaluated under the declared stability/fidelity checks and its limitations are recorded. | Explanation evaluation, reference/baseline definition and examples. |
| AC-F03-04 | Unsupported/failed explanation generation produces an explicit unavailable state without invented fault causes or a misleading narrative. | Failure/unsupported cases. |

## 6. F04 — Stable Alerts

| ID | Required condition | Evidence |
|---|---|---|
| AC-F04-01 | Alert state changes match the versioned policy, including persistence/hysteresis and chronological input rules. | Fixed-history reference cases. |
| AC-F04-02 | Repeated assessment/event delivery does not duplicate transitions; acknowledgement does not resolve deterioration. | Deduplication and review-state tests. |
| AC-F04-03 | Invalid/withheld assessments do not silently clear an active health concern; overdue mandatory work stays visible. | Degraded-data and mandatory-task cases. |
| AC-F04-04 | The selected policy meets the frozen alert budgets and is compared with a threshold baseline. | Warning time, missed/false-event and recommendation-change reports. |

Alert stability alone is insufficient: reducing changes while increasing missed events beyond the accepted budget fails the policy requirement.

## 7. F05 — Maintenance Planner

| ID | Required condition | Evidence |
|---|---|---|
| AC-F05-01 | Every proposal presented as usable passes independent checks for mandatory deadlines, capacity/qualifications, precedence, parts timing and fixed commitments. | Validator outputs for representative and boundary instances. |
| AC-F05-02 | Invalid inputs are distinguished from mathematical infeasibility, execution failure and time-limit/unknown outcomes. | Controlled cases for each exposed outcome. |
| AC-F05-03 | Feasible and optimal labels match solver status; objective/bounds and settings are retained when available. | Solver-result contract checks. |
| AC-F05-04 | Revising a task/resource/assumption creates a new proposal version; editing a timeline cannot bypass validation. | Revision and edit/revalidation tests. |
| AC-F05-05 | The planner meets its declared runtime/quality requirements and is compared against a defined baseline on common instances. | Benchmark manifest, objectives, statuses and runtimes. |

Hard-constraint violations in any accepted proposal fail acceptance. A small-instance feasibility check does not prove all possible schedules are correct; retain the tested scope and use validation on every returned proposal.

## 8. F06 — Grouping and Inventory

| ID | Required condition | Evidence |
|---|---|---|
| AC-F06-01 | Grouped tasks satisfy documented compatibility, windows, duration and resource constraints; grouping benefits/tradeoffs are reported honestly. | Grouping reference cases and comparison with separate work. |
| AC-F06-02 | Unapproved proposals do not consume/reserve stock; approved plans reserve exactly their required quantities. | Stock/reservation assertions before and after approval. |
| AC-F06-03 | Concurrent requests for insufficient shared stock cannot double-reserve it; failed approval does not leave a partial commitment. | Concurrent transaction and rollback tests. |
| AC-F06-04 | Cancellation/revision releases only eligible reservations; previously consumed parts are not automatically recreated. | Reservation lifecycle cases. |
| AC-F06-05 | Shortage quantities, arrivals and inventory corrections are traceable to actual fixture/record versions and authorized changes. | Bottleneck and audit checks. |

## 9. F07 — Availability Simulation

| ID | Required condition | Evidence |
|---|---|---|
| AC-F07-01 | Small deterministic reference cases produce expected grounding/waiting/completion states and metrics within defined tolerances. | Analytically understandable cases and event traces. |
| AC-F07-02 | Resource occupancy respects capacity and aircraft/component state transitions remain consistent. | Simulation invariants, including simultaneous-event cases. |
| AC-F07-03 | Each run records scenario/policy/model versions, horizon, state/metric definitions, usage conversions and sampling settings. | Run manifest inspection. |
| AC-F07-04 | Alternative policies use comparable inputs and the declared sampling procedure; mismatch is blocked or prominently qualified. | Comparison contracts and paired-scenario checks. |
| AC-F07-05 | Stochastic results report the declared replication summaries/variability; deterministic results have no fabricated uncertainty. | Per-run and aggregated outputs. |
| AC-F07-06 | Outputs are labelled simulated projections; repair/reset effectiveness and synthetic logistics assumptions are inspectable. | Interface review and assumption links. |

No fixed availability improvement is assumed. A worse-performing plan must remain visible as such. If claiming improvement, report the baseline, scenarios, repetitions, variability and scope supporting the claim; do not generalize it to an actual fleet.

## 10. F08 — Data Quality and Robustness

| ID | Required condition | Evidence |
|---|---|---|
| AC-F08-01 | Declared checks detect their defined missing/invalid/stale/out-of-order conditions and retain interpretable findings. | Quality-rule fixtures, including valid edge cases. |
| AC-F08-02 | Imputed values remain distinguishable from observations; qualified/withheld states match the policy. | Transformation and assessment-output checks. |
| AC-F08-03 | A withheld assessment cannot silently provide numerical planning input or healthy status; mandatory tasks remain actionable. | Cross-feature degraded-data workflow. |
| AC-F08-04 | Missingness/noise/regime robustness experiments meet the declared support requirements or explicitly narrow the support boundary. | Error/coverage/withholding results for each intervention. |

Do not claim universal out-of-distribution detection. The supported checks, their evaluation and limitations define the feature's acceptance boundary.

## 11. Supporting Workflow and Reliability

| ID | Required condition | Evidence |
|---|---|---|
| AC-S01 | Permissions are enforced server-side; unauthorized viewing/editing/approval is rejected without unintended state changes. | Permission matrix cases. |
| AC-S02 | Approval rechecks current plan/task/stock/resource versions. Stale proposals produce a conflict, not silent approval of changed content. | Competing edit/approval cases. |
| AC-S03 | Repeated approval requests do not duplicate work records or reservations; material decisions retain user/time/version evidence. | Idempotency and audit assertions. |
| AC-S04 | Partial work completion, part consumption and remaining tasks are represented correctly; historical assessments remain unchanged. | Completion lifecycle cases. |
| AC-S05 | Killing/restarting an API or worker produces a recoverable job or explicit failure, with no silently lost recorded job. | Fault-injection recovery record. |
| AC-S06 | Repeated messages/retries cannot duplicate accepted effects; superseded attempts cannot replace the authoritative result. | Retry/deduplication/stale-result cases. |
| AC-S07 | Interrupted dispatch is recoverable under the outbox design; success is announced only after durable result persistence. | Dispatch interruption and completion-order tests. |
| AC-S08 | Cancellation-requested and cancelled states are distinct; late results follow the declared cancellation policy. | Cancellation race cases. |
| AC-S09 | Reconnecting clients can retrieve authoritative job/results independently of live events; replay does not duplicate UI state. | Connection interruption and state-retrieval tests. |

## 12. Interface, Reproducibility and Responsiveness

| ID | Required condition | Evidence |
|---|---|---|
| AC-X01 | Principal screens handle loading, empty, error/unavailable, stale and denied states without plausible-looking substitute outputs. | State walkthrough and applicable E2E checks. |
| AC-X02 | Core actions work with keyboard navigation; focus is usable; warnings/statuses have text labels and are not colour-only. | Keyboard/focus review and automated checks where useful. |
| AC-X03 | Chart units, cutoffs, selected components and provenance stay consistent across linked views. | Linked-interaction checks. |
| AC-X04 | Repeated evaluation with the retained environment/configuration reproduces required outcomes within declared tolerances. | Reproduction commands and comparison outputs. |
| AC-X05 | API/worker isolation and UI responsiveness meet the declared budgets under the declared workload/hardware. | Latency/resource/error reports while calculations run. |
| AC-X06 | Public API/client contracts match the implemented schema; migrations and a representative restoration preserve required relationships/results. | Contract generation checks, migration/restore record. |

Reproducibility is evaluated within the declared environment. Do not promise identical floating-point outputs across every machine or library release. A restored database must retain resolvable artifact references; database backup alone may not preserve model/data files.

## 13. End-to-End Release Gate

The release walkthrough must complete these connected cases using the tested source revision:

1. Import supported engine history and labelled fleet/logistics inputs.
2. Replay a held-out engine without future-input leakage.
3. Inspect assessment, interval, evidence and alert history.
4. Generate a checked proposal exposing a known parts/resource constraint.
5. Revise one logistical assumption and retain separate proposal versions.
6. Compare alternatives through reproducible, labelled simulation results.
7. Approve a plan with current-state checks and consistent reservations.
8. Record work/completion without rewriting historical evidence.
9. Inject degraded sensor input and observe the specified quality response.
10. Interrupt/recover a calculation and retrieve its authoritative state/result.

Required functional criteria must pass, evaluation decisions must be frozen, and scientific criteria must meet those decisions. Any unrun/blocked requirement must remain explicitly incomplete. A narrowed demonstration requires a deliberate scope/specification change; it must not be labelled the original full release.

## 14. Claims Allowed by Acceptance

Acceptance may support statements about tested records, supported simulated engine predictions, constraint-checked proposals and scenario-specific simulation outcomes.

It does not establish real military fleet improvements, regulatory certification, whole-aircraft diagnosis, guaranteed failure prevention or airworthiness clearance. Competition presentation and documentation must stay within the evidence actually retained.

## Aircraft inspection redesign acceptance

Decision-flow presentation additionally checks default dashboard routing, optional guide and Research entry, API-backed open-work records without an inferred health classification, aircraft → findings → maintenance → supply with retained context, separate research register → component → planner scope, shared navigation grouping and keyboard focus restoration, mobile viewport containment and API failure without a fabricated empty/healthy state. Source-rendered screenshots and browser checks are indexed in UI verification. A participant understanding study remains required separately; route tests are not usability acceptance.

AI visibility checks additionally verify the Fleet explanation/navigation path, `/ai` saved estimate/interval and quality state, selection/reload, component/aircraft and assessment-version alignment, withheld/no-assessment handling, API failure/retry and mobile navigation/containment. Retain labelled-fixture browser evidence separately from live model evaluation and the participant comprehension study. Presentation checks do not close independent alert, explanation-stability or robustness gates.

Verify actual rendered screens, not rewritten specifications alone. Required checks: mapped annotation/list parity; aircraft/component identity reconciliation and delayed-response protection; renderer/model/no-WebGL fallback retaining evidence/actions; history units/cutoff/table alternatives; actual interval metadata and unavailable explanation states; exact-plan approval and stale conflict; versioned supply assumptions preserving prior outcomes; honest job/result status. Capture 1440×900, 1366×768, tablet and mobile, keyboard, reduced-motion and 200% zoom. Record source revision/check scope, actual screenshots, device/browser and asset/orbit measurements in UI verification.

Proposed initial budgets are ≤10 MB compressed model and ≤2K textures, and median orbit frame interval ≤33 ms on the recorded demonstration device. A measured pass on one device is not a cross-device guarantee. Participant comprehension of aircraft/component/evidence/proposal remains to be evaluated. Original public HTTPS, independent complete-history alert evaluation and operator-approved costs/targets remain blocked where prerequisites are absent; this redesign cannot close those gates.

### Customer-trial verification boundary

The local `/demo` journey must retain entered input identities and actual model/plan/run/work results; isolate trial resources from ordinary fleet proposals and other trials; require matching available AI for the trial policy; preserve mandatory deadlines; distinguish expected from received stock; invalidate stale proposals; and reserve/consume parts through existing transactions. Check both insufficient history and an impossible AI-informed window. Browser transitions do not establish participant comprehension, model qualification or full release acceptance. See [customer_trial.md](customer_trial.md) and [UI verification](../design/ui_verification.md).

## Aircraft twin showcase verification

Shared navbar checks compare geometry, glass styling, destination order and header tools across operations, aircraft and research routes at desktop/mobile widths. Menus retain research-tool access, active states and route-close behaviour; mobile supports Escape/focus return. Header tools must not clip or widen the viewport. Authentication screens are outside the workspace shell.

Camera containment must cover arbitrary pointer orbit and interpolated preset angles, not just settled presets. Project the normalized model-bound corners across representative azimuth/elevation/aspect combinations with a safety margin; capture actual pointer drags at desktop/laptop/tablet/mobile sizes. Camera controls and the component toggle must retain at least a 16px desktop gap.

The component-condition drawer must show all components from the selected API response with identity/RUL/evidence parity; support keyboard Enter, Escape and close-trigger focus restoration; navigate to actual evidence; and dismiss when exploring the system map or changing aircraft/replay. Check mobile containment and independently scrollable component content. Modal behaviour is not a full accessibility certification.

The model-first showroom additionally checks selected-record component/evidence link parity after expanding Component condition, returned remaining-life labels, hidden detailed cards on initial load, a separated desktop model/camera-control split, desktop/laptop stage fit and non-overlapping camera/browse controls at all captured widths. History/advisory navigation follows the showroom in visual and DOM order. Still-image references do not prove airframe geometry or engineering accuracy; authorised source geometry/configuration and validation remain prerequisites.

For the decorative flexible grid, verify pointer and camera movement change only the background paths, controls retain input and records/browsing remain usable, the stage remains white with sharp foreground content, and mobile does not widen the page. Reduced motion must retain identical static paths despite pointer/camera changes; component inspection pauses background updates. The layer is accessibility-hidden and not a physical simulation.

The optimized Canvas2D grid must stop drawing when settled/offscreen and remain static under reduced motion; verify this with actual draw counts, not an unchanged image alone. Verify one background renderer per workspace page, stage-specific aircraft rendering without duplication, shared coverage of operations/research pages, mobile raster bounds and unblurred foreground controls/evidence. Compare the same documented active/idle workload before/after optimization and retain measurements; one local profile does not establish universal device performance.

For the approved visual-only fighter, verify the studio requests the authored fighter GLB and not the transport; root provenance declares no engineering validation; front/side/top/three-quarter captures render; generator surfaces have finite vertices/normals and mirrored delta-wing bounds; failure uses the labelled fighter silhouette while retaining records/evidence. Asset generation and unit/browser checks do not establish aerodynamic, dimensional, installation or physical-system accuracy.

Verify studio rendering and side/top/three-quarter controls; forward, reverse, selector, keyboard and model-region wheel browsing; a persistent canvas between aircraft; next-record retrieval/identity checks and input locking; failed/delayed/mismatched response retention; reduced-motion switching; renderer/model failure preserving records and component evidence; and viewport containment at 1440×900, 1366×768, 900×1000 and 390×844. Check usage statistics against the selected API snapshot. Transition screenshots verify reconstructed poses, not exact timing parity with an unavailable reference video. Shared illustrative geometry must not be presented as separate validated airframes. Record executed scope and actual captures in `docs/design/ui_verification.md`.

## Interactive blueprint acceptance

Verify the blueprint opens from the selected aircraft's Blueprint tab, contains only the selected snapshot's component identities, and matches state/advisory findings without turning missing mappings or maintenance into invented red failures. Check current vs completed advisory handling and all twenty catalogue model mappings. Clicking a drawn assembly or keyboard register entry must open the same component's illustrative structure and API-backed evidence; assembled/exploded/wireframe, camera reset, Escape/focus restoration and evidence routing must work. Verify aircraft/replay changes clear selection, unknown types remain inspectable without a fabricated model, no-WebGL retains records, and desktop/mobile layouts and modal scroll remain contained. Retain actual captures and executed checks; geometry integrity is not engineering accuracy or fault diagnosis.

## Release-v2 evidence status — 2026-10-05

Resource-aware planning, episode behavior, actual-plan replay, PostgreSQL exclusion races, real queue recovery and fresh restore now have executed bounded evidence. Required original scientific stability/robustness/performance decisions, intended-user understanding, external aircraft qualification and public deployment must not be relabelled passed. The detailed eight-workstream ledger is `docs/team/release_acceptance.md`. Completing local engineering checks does not narrow the original release silently.

Verify the aircraft showroom integrates below the floating navbar without a replay row or duplicate System map. Inspect top/front/side 2D projections and all 3D camera presets, cockpit visibility, whole-assembly red material coverage and direct selection without locator circles. Component records/evidence must remain reachable.

Verify Overview, Blueprint, Components, Maintenance and History share one workspace and snapshot identity, contain their mobile width and retain evidence links. The showroom mounts in Overview; Blueprint opens directly without a duplicate showroom. Component system rows must expand from the keyboard. Explore blueprint must restore its tab from History or Advisories and reveal the workspace navigation. Empty histories/tasks/work orders should have explicit recorded-empty states.

## Connected workspace consolidation — 11 October 2026

Fleet operations use one findings queue, one maintenance workspace (work board, bays/timeline, archive), and one supply workspace (inventory/demand, requests). Aircraft/component handoffs retain context and scoped record views; aggregate views identify fleet-wide scope. Proposed findings require confirmation before the scheduling action is offered. Work lifecycle controls live on the readiness-aware board. Old duplicate URLs preserve context through redirects. Desktop/mobile/search use one navigation inventory. Engine research keeps its separate dataset, exact planner approvals and trials, explicitly independent of fleet replay. See [user flow](user_flow.md) and [site audit](../design/site_flow_audit.md).
## Copilot delivery acceptance — 2026-10-12

- Direct fleet/stock, recorded-availability, forecast, sensor-history and open-maintenance answers preserve the selected cutoff, units and reservation distinctions without requiring model availability. Ambiguous, unsupported causal and future-date questions are not classified as exact direct questions.
- Streaming uses the same authenticated session, CSRF and role context as JSON requests. Interrupted or malformed streams cannot become a completed answer; final checked citations/warnings replace provisional text.
- Hosted transcripts pair tool responses with their call IDs, and credentials remain server-side. Missing credentials and free-quota failures stay explicit. Hosted performance requires a live configured account measurement; a mocked adapter check is not that measurement.
- The aircraft floor continues beneath the stats without a separate strip background or border; desktop/mobile controls and record values remain usable.

## Aircraft presentation consistency — 2026-10-13

- Fit each selected airframe's actual mesh bounds into the area between its heading and statistics, including after a change of model family or camera view. Keep the full transparent shadow canvas and continuous floor beneath the unboxed statistics.
- Position the contact-shadow ground below the selected model's lowest geometry. Reserve mobile space between the blueprint action and floating copilot.
- Use the active workspace theme in aircraft component and blueprint inspection portals. User-message text inherits the bubble's foreground colour.
- Identify the five authored visual models as illustrative; do not imply engineering-validated replicas. Preserve the existing typeface, navigation inventory and record semantics.

## Page-loading behaviour — 2026-10-13

- The aircraft register must not download the showroom, blueprint, WebGL renderer or orbit controls. Aircraft identities come from lightweight shared metadata.
- Below-the-fold blueprint code loads when inspection enters the viewport, including after Explore blueprint. Reserve the showroom footprint during its loading fallback so it does not trigger inspection prematurely.
- Measure heading/statistics insets when fitting changes, rather than reading DOM layout inside each camera animation frame. Preserve model framing, component links and mobile controls.
- Compress eligible static and API responses at the local proxy while retaining security headers. Keep unhashed assets revalidated and do not cache private API records publicly.

## Model-first aircraft overview revision — 2026-10-13

- Register navigation remains free of 3D/blueprint code until an aircraft is selected. Selected Overview shows its illustrative live model and matching snapshot statistics.
- Explore aircraft navigates to `tab=blueprint` for the same aircraft, preserving query context; Blueprint loads on demand and no duplicate showroom remains above it.
- Identity and section navigation stay below the sticky navbar at desktop/mobile widths. Camera controls, semantic status labels, component evidence and maintenance cases remain accessible.
- Legacy visual/twin links resolve to the new sections. Models remain illustrative, not verified installation or diagnostic maps.

## Workspace presentation and control regression — 2026-10-13

- Inspect all primary routes, local tabs, utility/settings pages and representative case, work, request and engine/component details at desktop and phone widths in light/dark themes. Record actual route coverage, missing data, page exceptions and overflow.
- Verify theme/header/settings synchronization, persistence after reload, cross-tab updates, retained unsaved edits and readable action contrast. Utility settings remain reachable independently of capacity-edit permissions.
- Verify menu Escape/focus restoration, phone copilot access without covering forms, and protected/disabled controls with meaningful prerequisites.
- Verify a mandatory task cannot offer predictive review controls; case actions reveal their next section; research selection retains its dataset/aircraft context; a failed model preserves matching preview and blueprint navigation.
- UI/browser checks do not substitute for server authorization, stock/resource competition, scientific/model acceptance, intended-user acceptance or deployment/backup verification.

## Restrained aircraft showroom — 2026-10-14

Verify the model and shadow have a continuous background; camera and browsing controls remain outside the fitted model. Successful navigation waits for validated next-record data before a short opacity transition. Failed requests keep the current aircraft visible and usable. Reduced motion skips model fades and camera interpolation. Check all five families at desktop/mobile widths, camera reset, component evidence and the Explore aircraft handoff. Fixture-backed UI checks do not establish live backend integration.

## Onboarding, study and copilot refinement — 2026-10-14

Verify unique/permission-checked registration, component installation, historical membership,
read-only import preview, atomic invalid-batch rejection, idempotent imports and retained records
through reload. New/unsupported records must remain unassessed; mandatory requirements remain
visible. Register/dashboard/research counts must identify their distinct cohorts.

Verify the grounding objective against independent simulation, overlap union, qualifications,
parts and deadlines. The frozen study must retain exact inputs, ties/infeasibility, source hash,
metrics, assumptions and saved worker result. Do not label supply improvements as model accuracy.

Common site/record answers must bypass inference, ask for missing selection and preserve cutoff,
role and sources. General explanations with unmatched numerical/citation evidence are withheld;
this heuristic does not prove all remaining prose correct. Verify adversarial questions, private
configuration, malformed streams and the running-machine response measurements.

## Live replay / connected visual evidence

Verify concurrent duplicate delivery stores a cycle once; gaps, timezone-naive/future/nonfinite
frames never reach assessment inputs. Paused/historical/denied-role writes must fail. At a 30-cycle
boundary verify exact accepted-prefix import, correction ancestry, model job and input-bound result;
no future source values or prior snapshot score is substituted. Check stale observation/receipt,
reopen and completed-state behavior. Model and 2D map retain a review concern during stale transport,
keep unsupported parts unassessed and link to the identical component evidence. Verify real worker
results, phone overflow and missing-model/source states. Physical/operational validation is external.

## Offline operational-evidence preparation — 2026-10-14

Verify unioned downtime per aircraft, membership/window clipping, unknown exposure and bounds,
null availability with no known state, open-record censoring, membership gaps, touching boundaries,
timezone offsets and redelivery. Reject conflicting event IDs/states, undeclared aircraft and
invalid clocks. Retain input/source/implementation hashes. The handover checker must expose
omitted/null sections and pending acceptance states. Populated fields alone never establish
authenticity, pilot authorisation, model/geometry qualification or operational benefit.
See [export contract](../pilot/availability-export.md); synthetic references remain labelled.

Model/geometry evidence-package audits must reject missing scope/artifact roles, changed hashes,
out-of-root paths/symlinks, duplicate roles, model asset partition leakage, and criteria declared
at/after evaluation start. Binding-complete test packages must still explicitly establish no
operational qualification. These checks do not authenticate reviewers or prove artifact content.

## User-requested prototype presentation restoration — 2026-10-14

The supplied full-screen aircraft reference replaces the compact aircraft-viewer layout requirement.
Verify the green grid, large three-quarter model, right-side camera controls, lower statistics,
AeroCare wordmark and More/Research menus. Retain selected-record identity through browsing/error,
component evidence, blueprint handoff, current maintenance/summary records below the stage,
desktop/mobile containment and reduced motion. Research menu selection must distinguish its dataset
from ordinary aircraft. Models remain illustrative and values come from the actual selected record.

## Multi-subset research demonstration — 2026-10-15

Use the frozen protocol in `docs/research/multidataset-demo-protocol.md`. Separate FD002–FD004
fits must preserve engine-disjoint partitions, fit-only transformations and calibration before
test targets; a changed test label must not change weights or predictions. Retain source,
configuration, split, model and implementation hashes, actual denominators, excluded endpoints,
capped/uncapped errors and empirical interval coverage. Historical inspected FD001 stays labelled.
No cross-subset pooled score or operational model promotion is implied.

The Research dataset/engine selectors must preserve source identity and cutoff-bound sensor
history. Withheld records contain no numerical prediction/interval or invented influence. Missing,
corrupt or mismatched reports produce explicit errors, including under authenticated API access.
Install verified JSON reports atomically; refuse different installed evidence and never load
research weights from the read-only browser path. Register drawings/revisions/reviewers as pending
where absent; do not interpret authored catalogue layouts as approved installations.

The existing preventive simulator must retain its actual aircraft-day denominator, horizon, seed,
repair/stock/capacity inputs and intervention assumptions. Display availability and difference
formulas, preserve negative results and distinguish missing snapshots on older runs. Verify the
full existing FD001 input-to-work journey and restored aircraft UI. Public frontend smoke testing
must record its actual backend state; a correct offline screen does not establish public readiness.

## Dashboard overview invitation — 2026-10-15

Verify invitation on initial page load and after refresh; Skip and Escape dismiss without changing
the current route. Internal navigation after dismissal must remain uninterrupted. Start overview,
Back, Next and Finish must work and highlight actual visible controls, with the menu-button fallback
on mobile. Confirm selected-aircraft record identity remains unchanged and dialog fits phone widths.
Use an accessible labelled modal with contained focus; return focus on dismissal. No backend command,
new record, persisted tour-dismissal flag or dashboard redesign is part of this change.

Role-first refinement: require an explicit dropdown selection before Start overview, allow Skip
without selection and reset selection on refresh. Verify all four roles show distinct, relevant
first/second steps and Change role returns to the selector. Verify the engineer path can finish,
mobile navigation highlighting still fits, and account-role storage and selected-aircraft records
are unchanged by tour selection. Existing research/aircraft journeys must remain usable after Skip.

## Workspace-first account entry — 2026-10-20

Verify anonymous root and direct auth URLs without a valid workspace show four role cards,
no credential form or protected fleet requests. Card selection requires explicit Select
workspace confirmation. Root also shows cards with a restored server session; confirming a
workspace ends that session with CSRF before displaying its login. Verify all four workspace
URLs, phone layout and server-validated role homes. Signed-in record refresh stays usable.

Signup and login retain the selected workspace across refresh and mode changes. Verify viewer
signup followed by Fleet manager login, staff signup explaining administrator assignment,
normalized account IDs, cleared passwords and Change workspace. Preserve password mismatch,
duplicate-ID, cooldown, disabled-registration, retry and offline tests. No public selection
or signup may elevate account permissions. Browser fixtures establish UI behavior, not actual
production authentication or deployed registration persistence.

## Role workspace entry — 2026-10-16 (historical server entry)

Verify four keyboard-operable visual role cards, explicit selection/disabled continue, correct local
role/home, preserved record deep links and role-specific tour. Refresh must retain tab entry while
showing the overview. Change workspace must reopen entry. Login failures and offline/registration
states remain truthful. Under server authentication, only the assigned role card can be selected;
no local role or browser field can elevate account permissions. Verify real sign-in presentation,
role-limited entry and actual local API role denial. Check desktop/mobile, reduced motion and shared
grid rendering. Dashboard priorities follow next_action.role with All teams available, rather than
claiming personal assignment. No fleet KPI or underlying record may be changed by choosing a role.

Hover entry: check intermediate fill, exact green colours and correct role/home on completion
without clicking. Check that moving away, switching cards and window blur cancel entry even after
the original dwell duration. Verify touch does not start a dwell; keyboard selection and explicit
entry still work. Disabled assigned-role alternatives must remain inert. Confirm card text stays
above the fill, and reduced motion does not trigger immediate navigation.

Liquid refinement: assert intermediate rising-wave fill and unchanged green stops; a completed hover
sets aria-pressed but leaves URL, session-entry marker and effective demo role unchanged. Require
Select workspace for navigation, including reduced motion. Verify readiness prefetch is reused,
no event stream opens before confirmation, hidden tabs release/reconnect streams, and a stalled
engine request yields an actionable error within its five-second deadline.

Tour/card refinement: inspect every step of all four role tours on desktop and mobile. Highlight
bounds must stay inside their target and never overlap neighbouring navigation controls, including
after badge counts load. Across findings, maintenance and spares, verify five separate bordered cards
with at least eight pixels between them, no horizontal overflow, and an unchanged API-backed forecast
percentage in a coloured badge. Preserve existing role-entry and overview interactions.

Reference revision supersedes separate cards/coloured metric badges: at desktop widths above 1000px,
verify five steps in one row inside a rounded white bar, no individual borders and plain forecast
value equal to the API value. Verify narrow screens fit without horizontal overflow. Retain tour
containment checks and access to secondary destinations through account/mobile navigation.

Viewport entry: before and after selecting a role, the entire Select workspace button must remain
inside the viewport without page scrolling. Check laptop, tablet and small phone dimensions. If role
content scrolls internally, its last card must remain reachable above the confirmation area. Preserve
entry permissions, explicit confirmation and liquid-selection behavior. Unselected forecast badge
must be transparent with green text/track; selected availability keeps its green fill.

First-login tour revision: a new account/browser shows the invitation once. Refresh during the tour,
refresh after Skip/Finish, new tabs and subsequent sign-ins of that account do not show it again.
Another account in the same browser receives its own first invitation. Preserve role-specific steps
and account permissions. Older criteria requiring an invitation on refresh are superseded.

Audit regressions — 20 October 2026: verify dataset/view retention when changing research engines;
selected record/replay retention between workflow stages; aircraft tab/inspection retention and
clearing stale component/case selections when browsing; disabled-trial guidance; tours with the
assistant disabled; mobile drawer-to-blueprint scrolling after close; saved telemetry selection at
320px; short-screen role confirmation; matching-family model fallback and recovery on family change.
Verify recorded work/parts detail links and missing-record recovery. Preserve resource-booking
conflicts rather than weakening scheduling constraints to make a demonstration pass. Read the dated
product audit for executed coverage, failures/retests and remaining release gates.

## Import form regression acceptance — 20 October 2026

Delay an onboarding preview, edit its source reference, then release the response: Save must
remain disabled and the stale preview must not appear as current. A fresh preview of the edited
inputs must enable Save. Clear a validated file: content and validation must clear; selecting
a replacement requires a new preview. Older file reads must not overwrite the current file,
and aircraft changes must reset import state.

Submit JSON null in the ingestion tester: show the readings-array validation message without
a page exception or a write request. Reset sample must clear the error and restore the sample.

Delay the aircraft register response while opening a detail page: browsing must stay disabled
and position/count must remain unknown. Releasing the response restores the actual position
and navigation without changing the selected aircraft.

## Copilot common-question routing — 2026-10-20

Verify greetings, natural current-availability wording, polite prefixes and aircraft
synonyms avoid model initialization. Retrieve each count from the current authorized
snapshot, retaining dates and evidence. Verify findings, stock, selected-aircraft,
work, sensor and forecast variants map to their existing routes. Compound requests,
future dates, explicit other record IDs and hypothetical conditions must not become
unqualified current answers. Verify ambiguous flights/fights/fighters and missing
record selections produce clarification; unknown parts produce missing-record states.
Verify streamed model status, final replacement, cancellation, timeout, malformed and
truncated responses in the browser. CPU model throughput and public deployment latency
must be measured separately; a fast direct answer does not prove fast arbitrary AI.


## General copilot conversation regression — 2026-10-20

Unmatched conversational questions reach the model with history and selected context
without loading fleet data. Product instructions have a shared reference and a typed
help tool. Operational answers retain fresh tool retrieval and existing role/cutoff rules.
Missing citation syntax triggers at most one tool-free correction; invented figures or
invalid citations remain withheld. First-call drafts remain provisional until final checks.
The opt-in real Qwen smoke check must exercise model mode with unfamiliar wording and
retrieve/cite synthetic fixture counts; phrase-route tests alone are insufficient evidence.

## Assistant latency regressions — 20 October 2026

Current and historical count/availability/downtime answers must retain their recorded values,
cutoffs, citations and observed-series cards while completing with both inference and forecast
functions forbidden. The standard dashboard summary must retain its default forecast contract.
Self-introduction still exercises model inference without maintenance schemas; compound record
questions and unclear follow-ups keep their permitted tools. With local inference occupied,
a second model request returns a retry message, while direct guidance remains available; failure
and cancellation must release the inference slot. Timing reports must exclude questions,
answers, credentials and record data. Measure configured VM model load, prompt processing,
generation and end-to-end latency separately before asserting any production speed target.

For a valid final answer event followed by a deliberately open transport, the UI must display
the checked final answer, stop its spinner and cancel the remaining stream. Retain malformed,
truncated, cancelled and provisional-text protections. Release the request's authentication
read transaction before starting a model stream, synchronous inference or a model-status probe.
Verify an unavailable model probe starts only after the authentication connection is released.
Validate TLS HTTP/2 negotiation, and check hi/hello without a model service; actual authenticated VM timing
must still be measured separately.
