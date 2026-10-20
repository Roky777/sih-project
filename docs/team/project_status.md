# Project status — 2026-10-05

## Public demonstration integration — 2026-10-05

The original React product now has a GitHub Pages deployment workflow and repository deployment link: **https://pallavpushkar3-gif.github.io/sih-project/**. Pages opens an isolated, session-authenticated local Docker demo over an HTTPS tunnel, using the complete-app origin to avoid third-party cookie restrictions. It shows **Demo backend offline** when the backend is unavailable. This is an intermittent demonstration, not a continuously hosted government deployment. Startup and URL rotation are documented in [Pages and tunnel deployment](../operations/pages_and_tunnel.md).

Executed preparation checks: frontend lint/type/build and six unit tests; backend Ruff/mypy plus 69 unit/verification/security tests; five TLS customer journeys; Chrome login and SSE across two TLS origins, and actual third-party-cookie blocking with the complete-app fallback. The actual public Pages/tunnel check passed trusted TLS, automatic fallback, Secure/HttpOnly/Strict cookies, exact-origin CORS, missing/forged CSRF rejection, a live SSE connection and the offline screen. An initial public journey run passed only 1/5 because uncompressed UI/3D assets exceeded local test load deadlines through the free tunnel. Static assets now come from Pages and the tunnel compresses JSON; the final public Chrome recheck passed **all five customer journeys in 2.0 minutes** (48.8s complete flow, 8.1s withheld-history case, 14.1s tight-window case, 14.5s uploaded-history case, 31.1s health-replay case). The final images use strict cookies and a Pages-hosted static build. These are demonstrator checks through trusted public HTTPS; they are not intended-agency acceptance or continuous uptime certification. A coordinated isolated backup retained the schema, 27 table fingerprints and seven artifact files. No scientific results changed.

## Current implementation update — 2026-10-05

The research-backed assignment now adds qualified crew/bay scheduling and database-enforced bookings, causal review episodes and a separately retrained lifecycle benchmark, exact saved-plan/FIFO simulation, conservative import/quality handling, bounded recovery, scoped queries/events, fresh installation and database-plus-artifact restore tooling. The original release is still **not fully accepted or government-qualified**. Use [the current eight-workstream acceptance ledger](release_acceptance.md) and [scientific report](../research/release_evaluation.md) for final executed evidence; the audit below is historical.

Local website: **http://localhost:8080/demo**. AI estimates supported engine life/uncertainty; demo policy creates review urgency/window; scheduling allocates crew/bays/parts; simulation compares that exact schedule; people approve and record work. No aircraft clearance or observed downtime savings are claimed. The new lifecycle candidate was not promoted because its mean interval width was 86.51 cycles.

Remaining acceptance work concerns representative customer data/integrations, approved alert/error/cost/resource rules, intended-user/accessibility and representative workload acceptance, independent security/deployment acceptance, and source/artifact retention/release review. Completed engineering checks do not remove these gates. Legacy active work without resource identities requires explicit reconciliation; customer-trial cases are independent. No completion percentage is justified.

Final executed local checks: frontend lint/type/build and six unit tests; 110 backend/scientific tests with Ruff/full mypy; 49 integration tests including real PostgreSQL concurrency cases (overlapping counts); 37 browser checks on final images; eight actual broker/worker/reconnect recovery checks; five customer journeys on restored final images. Twenty-seven restored table fingerprints and registered artifact hashes matched. The final small isolated workload completed 200 reads with zero failures and both planning/simulation jobs succeeded. Scientific reproduction and limitations are indexed in the current ledger; original external release gates remain open.

## Planning approval error correction

An approval attempt encountered active historical work without crew/bay bookings. The snapshot raised an expected precondition error outside approval's conflict handler, producing HTTP 500. Approval now translates it to HTTP 409 with the existing reconciliation guidance, matching planning and revision endpoints. Empty optimal schedules no longer appear ready for approval or comparison; the server independently rejects empty approval. Historical records and reservations are preserved. Targeted backend checks passed 24 cases, with Ruff/mypy; frontend lint/types/build and six unit cases passed. All 17 workspace browser cases passed on the rebuilt local images. Two approval attempts against the exact affected PostgreSQL plan returned 409 with unchanged plans/work/inventory; the actual page showed disabled empty approval, no internal-error banner and no page exceptions. Evidence: `artifacts/release-v2/planning-fix-{backend-final,web,browser,build}.log`, `planning-fix-live.json`, `planning-fix-page.json` and `planning-fix-live.png`. Initial test formatting failure was corrected before rerunning; original release gates remain separate.

## Earlier source/presentation audit (retained history)


The core maintenance decision demonstrator is implemented. **The original release is not complete or fully accepted.** This audit started from clean source revision `b73bbef`; the presentation and customer-trial changes described here are working-tree changes. No public deployment or operational aircraft qualification is claimed.

The [government product-readiness assessment](government_product_readiness.md) maps the supplied PS to implemented behaviour, distinguishes user/buyer/agency and hackathon needs, and prioritizes commercial productization. The completed local customer trial is not a completed operational product. Eight grouped demonstrator-release workstreams below remain open; customer-specific integration, operational qualification and commercial support add further work. In that assessment, `COREPACK_HOME=/tmp/fleet-corepack make web-check` was rerun successfully (lint, TypeScript, build and six unit tests); large lazy chart/3D chunk warnings remain. Backend, scientific, live-browser and deployed acceptance were not rerun for that assessment.

## What is implemented

| Area | Implemented boundary | Acceptance limitation |
|---|---|---|
| Records and access | Labelled imports, immutable histories, provenance, server sessions and roles | Current checkout needs its local service/data setup to reproduce the live workflow |
| AI engine-life prediction | Registered FD001 predictor, cutoff-bound inference, calibrated intervals, quality withholding and noncausal sensitivities | Only the supported simulated engine dataset; broader robustness/explanation acceptance remains open |
| Alerts | Versioned policy, history, persistence/hysteresis and separate acknowledgement | Independent complete-trajectory alert validation remains blocked |
| Planning | CP-SAT, independent schedule checks, crew capacity, parts/arrivals, commitments, grouping and baseline comparisons | Separate qualified-bay modelling and representative benchmark acceptance remain incomplete |
| Approval and inventory | Current-state checks, transactional reservations, receipt/cancellation, stock corrections and work outcomes | Full release fault-injection coverage remains incomplete |
| Scenarios | Versioned assumptions, deterministic simulation, matched comparisons and separate part/bay wait metrics | Synthetic projections; no measured operational availability benefit |
| Durable calculations | Outbox, workers, attempt history, stale-result rejection, cancellation and bounded recovery | Additional interruption/reconnect acceptance remains open |
| Website | Inspection, register, component evidence, alerts, proposals, inventory, scenarios and explicit AI explanation | Intended-device performance and participant comprehension still require evaluation |

Earlier retained evidence reports passing FD001 prediction/interval gates, 81 backend tests and 22 browser tests. See [release readiness](../operations/production_readiness.md) and [UI verification](../design/ui_verification.md). Those are historical records, not checks rerun during this audit. At the initial audit, ignored learned artifacts/data were absent, so earlier result bytes/hashes and reported metrics were not independently reverified. A new local baseline/sample installation and live verification are recorded below; historical acceptance claims are still separate.

## Completed in this update

- Added an **AI & evidence** navigation destination at `/ai`, with a plain-language explanation of the maintenance problem and the roles of machine learning, alert rules, optimization and simulation.
- Added an entry-screen explanation and a context-preserving link from the selected component to its AI evidence.
- Reused authoritative component/assessment endpoints to display actual saved estimates, intervals, model/input identity, explanation availability and quality findings. No numerical demonstration output is embedded in application code.
- Retained unavailable and mismatch states, URL-based selection and links to sensor history. The explanation remains readable when record retrieval fails.
- Kept the AI page lazy-loaded and independent of chart/3D imports. Its final production route chunk is approximately 5.14 kB minified / 2.16 kB gzip; this is bundle size, not a latency claim. Navigation switches to the existing accessible dialog on narrower desktop/tablet widths to accommodate the additional destination.

## How much is left

There are **eight grouped release workstreams still open**, not eight missing screens or eight equally sized tasks. This is a planning inventory, not a fabricated completion percentage. The acceptance criteria remain the authoritative release gate.

| Workstream | Remaining work / completion evidence | Dependency |
|---|---|---|
| 1. Planner resources and benchmark acceptance | Implement separate qualified-bay constraints throughout snapshots, solver, independent validator and approval; verify races/commitments. Run representative baseline quality/runtime comparisons (F05/F06). | Resource contract and representative instance/workload definition; current snapshot has a fixed 14-slot horizon and one engine crew |
| 2. Independent alert validation | Compare missed/false events, warning time and policy changes on independent complete trajectories (AC-F04-04). | Untouched complete histories and frozen alert/cost budgets; all existing complete FD001 training engines have prior uses |
| 3. Explanation acceptance | Freeze justified stability/fidelity criteria and assess broader supported perturbations (AC-F03-03). | Acceptance decision and retained validation artifacts; existing diagnostics alone do not pass this gate |
| 4. Robustness acceptance | Validate missingness, outages, noise and operating-support limits; report error, coverage and withholding (AC-F08-04). | Defined support/acceptance limits and scientific artifacts; inspected final test cannot become unseen tuning evidence |
| 5. Reliability release coverage | Exercise remaining API/dispatcher/broker interruption, retry/cancellation and reconnect cases (AC-S05–S09). Document event-retention policy and implement pruning if required by the frozen workload. | Running isolated PostgreSQL/RabbitMQ/worker stack; preserve the demonstrator database |
| 6. Performance and comprehension | Freeze representative fleet size, concurrency, hardware/browser and latency budgets. Check API, worker and UI together; evaluate intended devices and participant understanding (AC-X05 and UI acceptance). | Agreed workload/device targets and study participants; existing small diagnostics are insufficient |
| 7. Reproducible final release walkthrough | Restore exact evaluated data/model artifacts, pin the reviewed revision, execute every release case and index pass/fail evidence including recovery/restore. | Working service stack, resolvable artifact hashes and completed prerequisite gates |
| 8. Deployment acceptance | Validate public trusted HTTPS, host startup/reboot, certificate renewal, storage/backup restoration and deployed workload. | Real host/domain/access and explicit publication authorization; configuration preparation already exists |

Several workstreams can progress locally, but external-data and deployment dependencies prevent an honest completion date or 100% claim. Do not relabel used engines as untouched, invent acceptance budgets, or replace missing learned artifacts with fixture predictions.

## Verification in this update

- Installed the existing frozen pnpm dependency lock without updating it.
- `COREPACK_HOME=/tmp/fleet-corepack make web-check`: ESLint, TypeScript, production build and all six Vitest tests passed.
- Built-preview Chrome fixture suite: `COREPACK_HOME=/tmp/fleet-corepack FLEET_E2E_BASE_URL=http://127.0.0.1:4173 corepack pnpm --filter @fleet-maintenance/web test:e2e ai-visibility.spec.ts aircraft-inspection.spec.ts workspace-ui.spec.ts --workers=1`. All 21 tests passed on the final application build in 29.4 seconds. Two additional tests then verified Fleet-to-AI selection and rejection of mismatched assessment versions; the complete six-test AI file passed in 9.8 seconds on that same build. **23 distinct browser checks passed across these runs**, including 17 existing workflow checks. This is not a claim that the live-backend browser suite ran.
- Fixture tests cover saved interval display, withholding without a substitute estimate, selection/reload, identity rejection, API failure/retry and mobile containment, alongside existing inspection/approval/inventory workflows. They are not live model or PostgreSQL acceptance evidence. Desktop/mobile captures are labelled fixtures in the ignored Playwright output.
- Desktop and mobile fixture screenshots were visually reviewed: the calculation roles, saved estimate, interval semantics and model/input identity are readable; mobile controls remain within the viewport.
- `git diff --check` passed after the documentation update.
- Docker inspection failed because the daemon is not running. Backend, real-service workflow, scientific reproduction and deployment checks were not rerun. Large lazy chart/3D bundle warnings remain; this update does not claim they were resolved.

## Local startup and user-flow follow-up

Docker Desktop was subsequently started and the full six-service local stack built and launched. The API readiness endpoint and website/proxy returned successfully; Chrome loaded actual API-backed AI evidence with no page exceptions. At this startup stage, the fresh database had synthetic records and no registered model, so numerical predictions were unavailable. The customer-trial installation below resolves the local numerical-demo setup.

The [defined user flow](../product/user_flow.md) now governs the presentation. `/` opens a lightweight Start page with one main action. Navigation groups Start/Fleet/Planning separately from supporting tools. The fleet register removes repeated metric/workflow grids; component pages show saved model evidence first with a context-preserving maintenance link. Planning uses a plain-language calculation label and returns to the selected component. Existing human approval, scientific support and fleet-wide task scope remain unchanged.

Verification: `make web-check` passed (lint, TypeScript, production build and six unit tests). The built local browser run passed 30/31 tests; the remaining supply-delay check assumed an existing baseline simulation on a fresh database. Its setup now explicitly runs a baseline and asserts that its complete saved record remains unchanged after the revision. The corrected check passed separately. All **31 distinct checks** therefore passed across these runs: five live local-service cases and 26 API-fixture cases. The initial failure is retained here; no single 31/31 run is claimed. Final lint/typecheck passed after the test fix.

Actual local desktop Start/register/component and mobile Start captures are retained in `artifacts/ui-flow/`. They were visually reviewed; capture recorded no page exceptions and no mobile overflow. New tests cover the main journey, grouped navigation/focus and API-failure behaviour; these do not establish participant comprehension. The local web container was rebuilt with the changes. No public deployment or new numerical model evaluation was performed. Remaining release workstreams above stay open.

## Interactive customer trial — 2026-10-05

The requested customer demonstration is implemented and running at **http://localhost:8080/demo**. Start prominently displays the aircraft poster and **Try it with your data**. **Aircraft** links to the original interactive model; the trial reuses it to select the mapped engine. Primary navigation is Start / Aircraft / Try demo / Planning.

The customer enters case/history cutoff or a supported JSON history, usage, work duration, mandatory deadline and spare supply. Existing real services calculate AI evidence, an explicitly labelled usage/window policy, an isolated constrained schedule and matched parts-ready projections. Review supports recorded demo receipt/replanning, actual supervisor approval/reservation, then work start/completion and consumption. Every case retains its inputs/results and reopens by URL/library. Ordinary fleet proposals exclude dedicated trial resources. See [customer trial](../product/customer_trial.md) for exact meaning, reproduction and limitations.

The documented public simulated FD001 dataset was acquired, prepared and the frozen baseline trained/calibrated in Python 3.13 containers. The model/transform/calibration hashes were registered and a held-out **validation** engine sample installed into the shared artifact volume. No final-test labels or browser-side training were used for the trial. This is a real local model calculation with `not_qualified` registration status; no new final scientific acceptance is claimed.

Verification: final `make web-check` passed lint, TypeScript, build and six Vitest tests. All **34 browser checks passed in one full live-stack run**, including three real customer cases and the existing route/fixture regressions. The live customer journey checked actual assessment/import identity, saved plan linkage, 16h versus 40h simulated downtime for the entered 24h delivery wait, retained original plan, receipt/replanning, approval, consumed kit, completed work and reload. Short-history and impossible-window cases also passed. Desktop entry/AI/options/completion and mobile withholding captures were visually reviewed; the full customer test recorded no page exceptions and mobile containment passed.

The 75-test backend unit/verification/integration run passed with the PostgreSQL concurrency case on an isolated temporary PostgreSQL database (removed afterwards); most per-test service fixtures use their own SQLite stores. Final targeted checks then passed **13 tests**, including the seven trial tests and API contracts, after adding history-correction/access-boundary/scenario filtering checks. Ruff and mypy passed. Earlier failures exposed a cutoff-label association bug and a receipt-to-cached-proposal gap; both were fixed and the full browser suite rerun. A race fixture initially conflicted with previously committed live workspace work; it passed in the isolated database. The final test outcomes do not represent every original release gate.

**The customer-trial feature is complete; the original release still has the eight workstreams above.** The trial closes the local entered-data demonstration and work-entry gap. Qualified bays, independent alert validation, broader robustness/explanation acceptance, exhaustive recovery, agreed performance/usability, a pinned full release walkthrough and deployment acceptance remain open. No completion percentage or delivery-date estimate is invented. Existing large lazy 3D/chart bundle warnings remain.

Final upload check: a fourth live customer case supplied an edited FD001 JSON file, downloaded the exact imported prefix and verified that the real assessment retained its import identity/source hash. It passed. The expanded full run passed 34/35; its upload assertion initially compared a pre-serialization object containing negative zero against JSON-transmitted zero. The assertion now compares the actual transmitted JSON, and the upload test passed separately. **All 35 distinct browser checks passed across these final runs; a single 35/35 run is not claimed.** No application change was needed for that serialization assertion. All six Compose services remain running; API/PostgreSQL/broker report healthy.

## Pre-video implementation — 14 October 2026

The current [pre-video delivery report](pre_video_delivery.md) records onboarding/source imports,
reproducible multi-aircraft availability study, grounding objective, connected verified-work flow,
private fast copilot routes, UI checks and fresh backup/restore. It supersedes earlier assumed local
installation/results for this workspace; it retains unsupported legacy evidence and external
scientific/security/operational gates. Video preparation is excluded by the user's instruction.

## Live telemetry / connected visual demonstration — 14 October 2026

The supported FD001 replay is now a working authenticated live transport at `/telemetry`, reachable
from Data & integrations. It preserves accepted frames, rejection quality logs, timestamps and stale
state, submits immutable snapshots through existing model jobs, and connects results/review links
to one explicitly mapped 3D engine assembly and top-down schematic. Remaining parts are unassessed;
actual aircraft protocols and engineering geometry remain external gates. Backend 186 unit/
verification tests, 176-file type checks (optional Torch excluded), web 28 unit tests, six real local
browser journeys and both independent/browser producers passed. A final camera-fit correction was
visually verified at desktop/phone widths. See [contract and evidence](../engineering/live_telemetry_demo.md).

## Operator pilot preparation package — 14 October 2026

[The pilot handover package](../pilot/README.md) now provides source/interface requirements,
connector acceptance cases, model/geometry qualification gates, an operational evaluation design
and blank versioned manifests/mapping/acceptance templates. It documents current implemented demo
interfaces separately from proposed real-system adapter work. No agency was contacted, no real
telemetry acquired, and no model/geometry/pilot acceptance was granted. This is documentation and
handover preparation; the existing application and approval behaviour are unchanged.

## Executable operational-evidence preparation — 14 October 2026

Implemented the shared offline observed-availability evaluator and a pilot handover field audit.
The evaluator accepts a canonical state export, unions overlapping downtime, clips eligible cohort
membership/window exposure, handles open events and duplicate delivery, rejects conflicting states
and reports unknown time and availability bounds. It never derives aircraft state from predictions.
The CLI retains source/input/implementation hashes and does not modify application records.

Executed in the existing Python 3.13 Docker test environment: scoped Ruff passed, strict mypy passed
for both new source modules, and all 17 unit tests passed. The labelled synthetic reference produced
18 eligible / 8 available / 6 unavailable / 4 unknown aircraft-hours, matching the hand calculation.
The blank pilot audit intentionally exited 2 with 56 missing fields and two unresolved states.
Field completeness is not verification of reference authenticity or operational qualification.

Actual aircraft connection still needs an approved interface/sample and installation/unit/clock
contract. Model qualification needs independent operator-specific labels, criteria and review;
geometry verification needs permitted configuration drawings/assets and engineer-approved mappings.
Operational benefit needs authoritative state exports and an agreed prospective study. None of those
outcomes has been achieved by these synthetic checks. See [commands and contract](../pilot/availability-export.md).

## Model and geometry evidence binding — 14 October 2026

Added strict model/visual-geometry evidence manifests, a shared read-only audit and CLI. Checks
cover scope/reference presence, required roles, SHA-256 binding, out-of-root paths/symlinks,
declared evaluation timing, reviewer/decision references and disjoint model asset partitions.
No artifact is executed, model promoted, geometry replaced or application approval changed.
Binding completeness explicitly establishes no operational qualification or reference authenticity.

Executed: scoped Ruff and strict mypy passed for the new audit module; the combined 29 availability,
handover and qualification tests passed. Both blank qualification-template commands intentionally
exited 2 with missing-evidence reports under `artifacts/pilot/`. Actual operator evidence has not
arrived; connector implementation against a real interface, independent model/geometry review
and operational impact evaluation remain pending. See [qualification commands](../pilot/qualification.md).

## Requested prototype UI restoration — 14 October 2026

Restored the `da96d4a` aircraft presentation to match the supplied screenshot: full-viewport green
grid, large model, right camera controls, lower statistics, AeroCare wordmark and More/Research
navigation. Current onboarding, summary, maintenance, history, blueprint, assistant and backend
records remain available; the inspection workspace sits below the aircraft. The initial camera
uses the three-quarter direction and bounds update when aircraft families change. Research links
retain dataset-aware destinations; models remain illustrative.

Frontend typecheck, lint and Docker production build passed. Three targeted browser checks passed:
next-record/blueprint handoff, failed-next-record retention, and all five families at desktop/mobile
widths with camera selection and reduced motion. The first browsing check needed its canvas selector
updated because the restored grid adds a second canvas; the corrected check passed. Actual AC-026
dark rendering had no page exceptions or horizontal overflow; capture:
`artifacts/ui-restored/aircraft-desktop.png`. This restoration does not change pilot qualification.

## SIH evidence/demo freeze — 15 October 2026

Verdict: **READY WITH LIMITATIONS for the local demonstration**. The public Pages entry point
responds HTTP 200 but its configured `fb9f056bfa8bfe.lhr.life` backend tunnel was unreachable in
Chrome at 08:25 UTC; it correctly displayed “Demo backend offline”. Public login, cookie/CSRF,
CORS and SSE operation were consequently not reverified. The new local code has not been published.
No operational qualification is established.

Completed within the requested scope:

- Acquired official FD002–FD004 with pinned outer/nested/file SHA-256 verification, preserving FD001.
- Frozen separate 70/15/15 engine fits with fit-only condition normalisation, retained calibration,
  withheld short histories and capped/uncapped metrics. Reproduction yielded identical predictions,
  metrics and new model hashes. See [protocol and results](../research/multidataset-demo-protocol.md).
- Added authenticated JSON-only research reports and dataset/engine selection, raw sensor trends,
  RUL intervals, noncausal model sensitivities, demo review recommendations, export and provenance
  inside the existing Research area. The restored aircraft presentation is preserved.
- Added five illustrative component/mapping register entries with missing approved drawings,
  revisions and reviewers explicitly pending. Narratives are not treated as failure labels.
- Extended the existing preventive simulator with saved denominator/downtime/stock/capacity inputs
  and visible formulas; older runs without snapshots remain identified. A retained 40-aircraft,
  14-day, 100-run, seed-7 early-P1-replacement scenario produced **−3.84 percentage points**
  and **+21.50 aircraft-days lost**, exposing supply/bay contention, not an asserted benefit.
- Installed verified research JSON locally without changing the FD001 serving-model registry.

Executed verification:

- `make web-check`: lint, TypeScript, production build; 29 tests in 7 files passed (latest code).
- Docker Ruff over backend source/tests/scripts and strict mypy (184 source files): passed;
  unit/verification suite: 222 passed, three dependency deprecation warnings.
- `make backend-integration`: 78 passed in the isolated integration database.
- Existing customer-trial browser suite: 5 passed, including actual input → model assessment →
  schedule → supply comparison → approval → completed work, short history and infeasible window.
- Research + restored-aircraft browser suites: 6 passed, including all four subsets, withholding,
  network errors, mobile containment, five model families and failed-next-record retention.
- Actual research, simulator-formula and AC-026 screens captured; no browser page exceptions in
  this capture. Local API readiness healthy; frontend/API/worker/outbox/PostgreSQL/RabbitMQ running.

Initial research browser checks exposed tab overflow and an overly narrow test interception;
corrected and rerun successfully. Earlier static failures are retained in audit logs; no check
is called passed from its unexecuted baseline. Reports/logs/screenshots are ignored artifacts,
not fake committed datasets. Reproduction/startup commands are in the protocol document.

Open locally: `http://localhost:8080/research?view=benchmarks`, `/research?view=drawings`, `/demo`,
`/simulator` and `/aircraft/AC-026`. Retained evidence: `artifacts/research/`,
`artifacts/research-*-final.log`, `artifacts/customer-trial-final.log`,
`artifacts/research-integration.log`, `artifacts/demo-verification/`.

Checklist: seven criteria have local/evidence delivery and the deployed frontend was smoke-tested,
but public backend functionality failed that smoke test. Do not present this as 8/8 deployment
acceptance. Restore/rotate the HTTPS tunnel and deploy the current code for a public demonstration,
then rerun the existing HTTPS authentication/CORS/CSRF/SSE verification. N-CMAPSS was independently
assessed, not evaluated or mixed into FD00x. Actual operator data, qualified models, approved geometry
and an operator-led availability study remain external, pending evidence.

Additional scientific checks: `python -m pytest backend/tests/science` in the mounted Docker test
image passed 10 tests; the sequence-model module was explicitly skipped because PyTorch is not
installed in that image. No fresh LSTM evaluation is claimed. The newly evaluated models are the
fixed classical research models described above. The final API/worker images were rebuilt with
the JSON report installer; data volumes and serving-model artifacts were retained.

## Optional dashboard overview — 2026-10-15

Added a scoped light/dark welcome modal with Skip and Start overview on every full workspace load
or refresh. Dismissal is memory-only; internal navigation does not reopen it. The six-step overview
highlights existing navigation/Ask AI, with a menu-button fallback on mobile, Back/Next/Finish and
Escape. It does not navigate the product, change backend records or alter the dashboard layout.

Verified: frontend lint/typecheck/production build and all 29 unit tests passed. Nine browser checks
passed for overview refresh/dismissal/navigation, unchanged selected-aircraft data, mobile fit,
research evidence/error states and all five restored aircraft model families. The existing complete
customer-trial journey also passed after dismissing the popup. Earlier browser runs needed a hidden
background-element locator correction and isolated output directories to avoid test-trace collisions;
final isolated run passed. Logs: `artifacts/overview-final-browser.log`,
`artifacts/overview-customer-regression.log`, `artifacts/overview-web-check.log`.
Local web image rebuilt/restarted at `http://localhost:8080`; no publication performed in this step.

### Role-first overview refinement

The welcome popup now requires Choose your role before Start overview: maintenance engineer,
maintenance supervisor, logistics team or fleet manager. It uses the existing product-role labels
and distinct role-specific tours. Change role returns from the first guided step to the dropdown;
Skip remains available without selection. Selection resets on full refresh and never changes
account/demo-role storage, permissions, backend records or the underlying dashboard flow.

Verified: frontend lint/typecheck/production build and 29 unit tests passed. Ten browser tests
passed, covering all four role paths, changing role, completing the engineer tour, reset on refresh,
Skip/Escape, mobile highlighting, unchanged account-role storage/aircraft identity and preserved
research/aircraft flows. Local web rebuilt/restarted. Evidence:
`artifacts/role-overview-web-check.log`, `artifacts/role-overview-browser.log` and
`artifacts/demo-verification/role-overview-*.png`. No publication in this step.

## Visual login/workspace entry — 16 October 2026

Added `/login` and a dedicated green/white entry screen reusing the existing layered interactive
workspace grid. Four visual role cards replace the overview dropdown. Local mode is explicitly
password-free demonstration entry; selecting a role applies the existing demo role, enters its
existing work area and drives the optional overview. Real account sign-in retains existing backend
credentials, CSRF, registration and retry handling with the new presentation. After server sign-in,
only the assigned role can be selected; other cards are disabled. Login clears prior entry completion.
Existing tab entry survives refresh, while the overview still repeats; account menu / first overview
step can reopen Choose workspace. Record deep links are preserved.

The existing Fleet Dashboard retains its KPI/chart/twin/data representation. Its Priority actions
panel now defaults to the current next responsible team from actual case data, with All teams
available; fleet managers retain the full queue. This is team responsibility, not a fabricated
individual assignment. Shared source datasets, serving models and backend business logic are unchanged.

Executed: frontend lint/typecheck/build and 29 unit tests passed. Final Docker web production build
passed; thirteen browser checks passed across all four role paths, reload/Skip, bookmarked aircraft,
mobile/grid containment, server-role UI restrictions, account sign-in presentation, team priority
filtering, and existing aircraft/research screens. The complete existing customer trial also passed
(1 further browser check), including actual inference, scheduling, supply, approval and work. Server
credential UI tests use explicitly mocked session responses; they do not establish live production
login/cookie verification. Actual local API denied an engineer planning command with HTTP 403.

Initial mobile verification caught unwrapped card text inherited from global action-button styles;
scoped wrapping corrected it. Final actual entry capture reported no page errors or document overflow.
Logs: `artifacts/workspace-entry-web-final.log`, `artifacts/workspace-entry-build-final.log`,
`artifacts/workspace-entry-final-browser.log`, `artifacts/workspace-entry-customer.log`.
Captures: `artifacts/demo-verification/workspace-entry-final-*.png`.
Local website rebuilt/restarted at `http://localhost:8080/login`; no public deployment performed.

### Role-card hover correction — 16 October 2026

Scoped hover/focus/pressed card surfaces to override the global blue action-button hover. Cards
retain their white/green surfaces and text colours while lifting 3px with a soft shadow; selected
cards retain the green selection. Dark surfaces remain consistent and reduced motion still disables
translation. Docker web build/restart passed. Browser computed-style checks on the served site
confirmed unchanged background/text and a -3px transform for light/dark, selected/unselected cards.
Evidence: `artifacts/demo-verification/role-card-hover-check.json` and `role-card-hover-fixed.png`.

### Progressive hover-to-workspace entry — 16 October 2026

Mouse dwell now reveals the exact selected-card green gradient left-to-right over two seconds,
then enters that role through the existing permission-aware entry path. Animation completion drives
normal entry with a delayed fallback for disabled animations/reduced motion. Leaving/switching cards,
pointer cancellation, window blur or visibility changes clear the dwell; unmount clears its timer.
Click/tap selection plus Open workspace and keyboard entry remain available. Locked server-role
cards remain inert, the navigation is guarded against double entry, and fleet records are unchanged.
A short interaction hint explains automatic entry without describing it as data loading.

Verified production build, frontend lint and 29 unit tests passed. Sixteen browser checks passed,
including exact intermediate fill colours/progress, automatic role landing, cancellation after the
original dwell time, touch/keyboard fallback, locked roles, and preserved research/aircraft flows.
A separate reduced-motion check passed (17 browser checks total); it removes the sweep while
preserving the entry delay. Local web rebuilt/restarted. Logs: `artifacts/hover-entry-web-check.log`,
`artifacts/hover-entry-build.log`, `artifacts/hover-entry-browser.log`, `artifacts/hover-entry-reduced.log`.

## Liquid selection and loading-path correction — 16 October 2026

Supersedes hover-to-entry: a smooth rising/waving liquid mask reveals the same selected green.
Completion only sets the selected role. No hover/animation/timer calls entry or writes the entry
marker/effective role. **Select workspace** is required for entry; click/tap/keyboard remain supported.
The liquid effect uses CSS on one card rather than a frame-by-frame React loop, and reduced motion
removes the sweep. Locked server roles and existing data/permission boundaries remain unchanged.

Loading investigation found the API healthy during the current check; the earlier screenshot's
transient offline condition was not reproduced as an ongoing backend outage. Optimised the actual
startup path: prefetch/cache the read-only engine readiness while choosing a role, remove the duplicate
engine observer, bound readiness and health requests to five seconds without automatic engine retry,
and open the event stream only after entry. Hidden tabs close their streams and returning tabs
reconnect/refresh authoritative queries. No engine/model is retrained and no synthetic ready data
is substituted. Existing engine generation still polls; failed connection presents Retry.

Executed: frontend lint/typecheck/build plus 29 unit tests passed; Docker web production build and
restart passed. Twenty targeted browser checks passed for liquid progress/exact colours, selection
without navigation, explicit confirmation, cancellation, mobile, reduced motion, cached readiness,
no pre-entry stream, hidden-stream reconnect, a stalled engine's five-second retry state and preserved
research/aircraft screens. The complete existing customer trial also passed (21 browser checks total),
including live job results, scheduling, supply comparison, approval and completed work.

One actual warm-API local Chrome measurement was **1,009 ms from Select workspace to rendered
availability chart**, including automated Skip of the overview. This is a diagnostic, not a general
latency guarantee or a directly comparable percentage speedup: the earlier baseline capture included
a fixed 1.5-second settle interval. Retained request/status timings:
`artifacts/demo-verification/dashboard-performance-before.json` and `dashboard-performance-after.json`.
Further evidence: `artifacts/liquid-selection-{web-check,build,browser,customer}.log`,
`artifacts/demo-verification/liquid-role-fill.png`. Deployment verification script updated for the new
confirmation/overview steps and syntax checked; no fresh public deployment/authentication claim.

## Tour highlights and workflow card polish — 16 October 2026

Tour outlines now sit inside the control and match its rounding, with no protruding green halo.
Navigation child sizes are observed so late badge counts cannot leave the highlight over a neighbour.
All role steps retain their existing targets and mobile menu fallback. Each maintenance-flow item is
now a separate rounded card with consistent gaps and responsive wrapping. Nonzero counts and the
unchanged simulated availability percentage use green badges; zero counts remain neutral. No data,
role permissions, stage calculations or destination links changed.

Executed frontend lint/typecheck/production build and 29 unit tests; all passed. Rebuilt/restarted the
local Docker web service. Nineteen browser checks passed: all steps of all four tours on desktop and
mobile, five-card spacing/forecast preservation on findings/maintenance/spares, and existing entry,
liquid selection, authentication presentation and readiness checks. Initial checks exposed badge-load
layout drift; observing navigation children fixed it, and the complete rerun passed. Evidence:
`artifacts/tour-flow-polish-{web,browser,build,lint}.log` and
`artifacts/demo-verification/{tour-highlight-contained,workflow-metric-cards,workflow-metric-cards-mobile}.png`.

## Reference layout restored — 16 October 2026

User supplied a reference superseding the separate-card layout: restored a continuous rounded white
workflow bar, five equal desktop columns, pale green active step and plain counts/forecast. Smaller
screens wrap. Restored the supplied AeroCare logo, Analysis navigation label and reference tool order.
More/Research moved into expandable account-menu groups and remain in mobile navigation; destination
links and data are unchanged. Contained tour highlights remain intact.

Verified lint/typecheck/build and 29 unit tests passed; Docker web rebuilt and restarted. All 19
entry/tour/reference-flow browser checks passed, covering desktop/mobile, live forecast preservation
and all role tour targets. Separately verified account-menu Research links are visible when expanded.
Logs: `artifacts/reference-flow-{web,build,browser}.log`; visual capture:
`artifacts/demo-verification/reference-workflow-bar.png`. Available locally; no publish performed.

### Availability percentage polish — 16 October 2026

The forecast now has a pale green rounded badge, stronger green percentage and thin proportional
track. The shared bar, other counts and forecast source are unchanged; unavailable values show a
dash without a track. Verified production build/typecheck, lint and five targeted browser checks
(desktop/mobile flow, API forecast preservation, all role tour outlines). Docker web rebuilt and
restarted. Logs: `artifacts/availability-badge-{build,lint,browser,docker}.log`; screenshot:
`artifacts/demo-verification/availability-badge.png`.

## Workspace selection fits the viewport — 17 October 2026

Removed `01 / WORKSPACE` and its extra spacing. Role entry now uses a viewport-sized panel with
dedicated confirmation area and more compact cards. Short screens omit secondary copy rather than
requiring scrolling to confirm; role labels, selection, destinations and demo footer remain visible.
Verified all four cards and Select workspace fit without page or internal scrolling at 1440×900,
1366×768, 1280×720, 1024×600, 820×1180, 390×844, 375×667 and 320×568. Enlarged text retains an internal
overflow fallback instead of clipping controls. Account sign-in layout and role permissions unchanged.

Also completed the requested availability visual state: green percentage and progress track remain,
with transparent background/border until the availability step is selected. Selected state retains
the green badge fill. Forecast data and other workflow counts are unchanged.

Executed frontend lint/typecheck/build and 29 unit tests; passed. Final Docker build/restart passed.
Twenty browser checks passed, including the eight-size no-scroll check, explicit role confirmation,
liquid interaction, assigned-role restrictions and contained tour highlights. An initial spacing check
caught role-content overlap; corrected the spacing before the successful final run. Logs:
`artifacts/entry-viewport-{web,docker,lint,browser}.log`, `artifacts/entry-fit-browser.log`.
Final screenshots: `artifacts/demo-verification/workspace-fit-{1366,390,320}.png`. Local changes only.

## Overview reference layout — 20 October 2026

Adjusted only `fleet-dashboard.css` application styling to match the supplied images 6–9: five KPI
cards in one desktop row, availability/downtime panels at 7:5, health/actions at 5:7, with the existing
two-by-two priority cases and a bounded two-column health matrix. Smaller screens retain stacking.
All selectors are scoped to `.fleet-overview`; data, routes, authentication and other pages unchanged.

Verified frontend Docker production build/typecheck and local web restart. Browser measurements at
1280, 1440 and 1920 pixels confirmed the desktop rows; 390 pixels fitted without horizontal overflow.
Confirmed all 280 health cells, four priority cases, and both risk/tail sort controls. Screenshots:
`artifacts/demo-verification/overview-reference-{desktop,mobile}.png`. No backend or science suites
rerun for this presentation-only change. No push/deployment performed.

### Overview sizing polish — 20 October 2026

Refined only Overview styling: common KPI label/value/support rows align all metric values, with
consistent padding, type scale and radii. Chart panels have equal 390px desktop heights and aligned
heading separators; health/actions panels share their lower edge. Priority cards use tighter spacing
and consistent action placement. Mobile charts expand to 420px for wrapped headings/legends. Existing
five-metric layout, 7:5 and 5:7 panel order, values, controls, links and API behavior are preserved.

Verified Docker frontend build/typecheck and local restart; browser checks at 1280, 1440, 1920, 768
and 390 pixels passed for no horizontal overflow/clipped metrics, aligned desktop values/equal panel
heights, and plot areas over 180px. All 280 health cells, four priority cases and both sort controls
remain available. Inspected desktop/mobile screenshots at
`artifacts/demo-verification/overview-polish-{1440,390}.png`. No backend/science changes or tests;
no push or public deployment.

### Overview header proportions — 20 October 2026

Matched the second supplied header comparison with Overview-only desktop sizing: 80px bar,
216px logo, 44px navigation/actions and 14px labels. Narrow desktop spacing avoids collisions;
mobile retains its existing 62px header. Other pages retain their existing 72px desktop header.
Verified production build/typecheck and local frontend restart, then measured 1280/1440/1600px
and 390px layouts with no navigation overlap or page overflow. Screenshot:
`artifacts/demo-verification/overview-header-reference.png`. No data or navigation behavior changed.

### Compact Overview KPIs — 20 October 2026

Reduced only the KPI geometry to match the smaller supplied first image: desktop cards now measure
152px instead of 176px, with shorter label rows, 34px values and tighter vertical padding/gaps.
Colours, content, five-column arrangement, charts and header are unchanged by this refinement.
Verified production frontend build/typecheck and restart; browser checks at 1280/1440/1920/390px
found no clipped metrics, label/value overlap or horizontal overflow. Mobile retains extra space for
wrapped labels (172px). Capture: `artifacts/demo-verification/overview-compact-kpis.png`.

## First-login-only overview tour — 20 October 2026

Supersedes refresh-triggered guidance. The invitation is remembered when first presented, per
server-account ID in this browser's local storage (separate identities for demo roles). Refresh,
navigation, new tabs and later logins no longer reopen it; another account gets its own invitation.
Skip/Finish and role-specific steps remain. Clearing site data/another browser resets the preference;
storage denial falls back to memory, not cross-device persistence. No account permissions/data change.

Verified lint/typecheck/build and all 30 frontend unit tests. Docker web rebuilt/restarted. Live-browser
checks with two real local accounts passed: refresh during invitation, same-account sign-in, a new tab,
different-account first invitation, and refresh after Skip. Existing tour layout fixtures now explicitly
reset only tour preferences when testing fresh visits at multiple sizes. No backend/science tests run.

### Health-card reference interior — 20 October 2026

Changed only the desktop health-card interior: removed its heading divider, placed sorting and all
four legend items on one row, restored square health swatches/circular maintenance swatch, and
adjusted column/row labels, rectangular cell sizing and gaps to the supplied first reference.
Kept measured outer dimensions: 569.5×512 at 1440px, 502.83×546 at 1280px, 669.5×512 at 1920px;
mobile remains 358×572 at 390px with its existing wrapping behavior. Fixed desktop panel heights
preserve these bounds while the internal matrix scrolls. All 280 cells and aircraft sorting verified.
Frontend production build/typecheck and local restart passed. No records, other cards or navigation
changed. Capture: `artifacts/demo-verification/health-card-interior.png`.

### Priority actions reference sizing — 20 October 2026

Scoped Priority actions styling now follows the second supplied reference: no heading divider,
regular-weight heading, compact two-by-two boxes, consistent case/status/title/owner typography,
smaller review buttons and reduced empty space before the actions. Other cards retain their styles.
Measured desktop boxes are equally sized at approximately 192px high; panel approximately 506px.
Verified frontend production build/typecheck and local restart. Live checks at 1280/1440/1920/390px
confirmed four unclipped cases, no page overflow, divider removal and retained case links. Clicked
the first Review evidence action and verified it opened its original case. All 280 health cells
remain. Capture: `artifacts/demo-verification/priority-actions-reference.png`. No records changed.

### Latest header reference supersedes larger variant — 20 October 2026

Adjusted only Overview header styling to the latest supplied reference: 72px bar, 184px logo,
40px navigation, 42px actions, 13px labels (500 weight, 600 selected). Pale translucent surface
uses rgba(237,243,248,.66), 26px blur and 1.15 saturation, with subtle edge/shadow and retained dark
variant. Previous 80px/216px header is superseded. Dashboard cards and other routes unchanged.
Verified production build/typecheck, local web restart and live computed styles at 1280/1440/1920
and 390px, with no overlap/overflow. Screenshot: `artifacts/demo-verification/header-latest-reference.png`.

## Aircraft register reference presentation — 20 October 2026

Updated only the Aircraft register presentation to the supplied references: compact five-column
cards (156px measured height, 14px padding, 18px tail labels, 46px health rings), matched condition/
availability badges and driver/priority footer. Existing All aircraft/Available/Grounded/Findings/
Active maintenance/Onboarding filters and search remain visible, with Cards/Table and Risk/Health/
Tail controls beside them on desktop; removed the forced separate sort row. Responsive layout wraps
controls and reduces columns on tablets/phones. No aircraft records, filter logic or permissions changed.

Production frontend build/typecheck and local web restart passed. Browser layout checks at 1280,
1440, 1920, 768 and 390px found no horizontal overflow; desktop widths retain five columns. Verified
40 records, Available 26/Grounded 14, search/reset, Table/Cards, Tail sorting and original record
navigation. An initial rapid interaction capture raced URL updates; the sequential settled rerun
passed without changing query logic. Captures:
`artifacts/demo-verification/aircraft-register-{reference,card}.png`. Overview unchanged this step.

## Aircraft component expansion layout — 20 October 2026

Fixed automatic table-column resizing when system rows expand using a scoped fixed-layout colgroup.
Removed the inherited generic blue selected-row styling in favor of the existing green palette;
component rows have consistent readable surfaces, wrapped serial details and retained evidence links.
Small screens scroll within the table container, without widening the page. No health/risk/RUL or
component data changes. Frontend production build/typecheck and local web restart passed. Live test
expanded all seven AC-011 systems: headers stayed at identical horizontal positions and all 20
components remained. Selected background computed green; 390px viewport contained the 960px table
inside its scroll wrapper. Evidence link navigation passed. Capture:
`artifacts/demo-verification/aircraft-components-expanded.png`.

## Findings reference typography and availability reading — 20 October 2026

Scoped changes to Findings: matched compact rounded filters, monospaced option/tail-search values,
Inter labels/table/actions, 32px rows, 30px review/view buttons and 22px pills. Retained the existing
workflow strip and live role ownership; forecast now uses green Inter text and a proportional slim
track without a filled unselected badge. No counts/statuses/forecast values were fabricated to match
screenshots; existing role-dependent Plan/Review/View behavior remains.

Frontend production build/typecheck and local restart passed. Live browser checks at 1280/1440/1920
and 390px confirmed no page overflow, transparent forecast badge and correct filter font. Verified
forecast equals API summary, status filtering, tail search and review drawer. Initial checks ran before
fleet queries completed; repeated after the real rows loaded and passed. Capture:
`artifacts/demo-verification/findings-reference.png`. Other pages retain their prior styling.

## Maintenance reference presentation — 20 October 2026

Added scoped operational Maintenance styling for the supplied Work queue/History references:
Inter headings/body text, 2.4:1 confirmed-findings/mandatory-tasks layout, compact finding evidence,
68px minimum due-task boxes with monospaced due labels, reference pill/card spacing, and consistent
Planned/Recorded work panels and empty states. Availability uses plain green Inter text and a slim
track without an unselected badge fill. Research workspaces and other routes are excluded. No data,
model outputs, scheduling permissions or work-order logic changed.

Verified production frontend build/typecheck and local restart. Browser checks at 1280/1440/1920
and 390px confirmed no overflow and transparent availability. One confirmed finding and four due
tasks remain; fleet-manager account still sees Supervisor schedules. History planned/recorded
panels, empty planned state and Open/Closed/Late selection passed. Captures:
`artifacts/demo-verification/maintenance-reference-{work,history}.png`. No backend/science tests run.

## Findings advisory drawer reference — 20 October 2026

Matched the supplied advisory drawer presentation with a frosted panel and blurred backdrop,
compact Inter typography, monospaced identifiers, action banner, rounded case card and four metric
cells. Added optional Drawer styling hooks; only Findings uses these overrides. Existing evidence,
case navigation, model details, spares/impact content and advisory data remain intact.

Production frontend build/typecheck and local restart passed. Live AC-008 fuel-pump checks confirmed
630px drawer width at 1280/1440px and viewport-constrained width at 390px, without body overflow.
Four metric cells, model-details expansion and Escape close passed. The initial width assertion ran
during the entrance animation; the check passed after waiting for its final position. Capture:
`artifacts/demo-verification/findings-advisory-reference.png`. No backend/science tests run.

## Spares reference presentation — 20 October 2026

Added operational Supply styling matching the supplied Requests reference: workflow-first layout
with an accessible page heading, Inter typography, rounded panels, compact empty requests state,
neutral shortage rows and a transparent green availability reading/track. Research inventory and
existing request, stock and permission logic are unchanged.

Production frontend build/typecheck and local restart passed. Live browser checks at 1280/1440/1920
and 390px confirmed no page overflow, 17px Inter panel headings, four existing shortage rows and a
transparent forecast background. Requests/Inventory/Deliveries navigation and return to the empty
requests state passed. The first browser attempt used a workspace display name instead of its ID;
after correction, a fresh-session tour also needed dismissal before navigation. Final checks passed.
Capture: `artifacts/demo-verification/supply-reference-requests.png`. No backend/science tests run.

## Simulation comparison spacing — 20 October 2026

The impact cards and assumptions panel were adjacent with no separating margin. Added a scoped
comparison stack with 16px gaps and contained expanded assumption snapshots. No simulation data,
formulas or result values changed. Production frontend build/typecheck and local restart passed.
Live browser measurements at 1280/1440/1920 and 390px confirmed a 16px card-to-assumptions gap and
no page overflow; assumption details expand successfully. Capture:
`artifacts/demo-verification/comparison-spacing.png`. No backend/science tests run.

## Account More/Research menu correction — 20 October 2026

Nested More/Research disclosures inherited avatar glass and size rules through descendant-summary
selectors. Scoped those rules to the avatar's direct summary. Added compact 40px disclosure rows,
chevrons, visible keyboard focus and indented icon links within the existing scrolling panel.
Destinations and permissions remain unchanged; the Analysis redesign preview was not implemented.

Production frontend build/typecheck and local restart passed. Live desktop (1440px) and mobile
(390px) checks verified keyboard expansion of all six More/seven Research links, no page overflow,
Escape close and Technical sandbox navigation closing the account menu. Captures:
`artifacts/demo-verification/account-menu-{1440,390}.png`. No backend/science tests run.

## Product-wide audit — 20 October 2026

The ten-round live route/control audit and isolated workflow tests are recorded in
[the product audit](product_audit_2026-10-20.md). Corrections cover navigation context, disabled
features, tour steps, mobile blueprint handoff, narrow telemetry, short-screen entry, consistent
headers and model fallback. State-changing browser tests use a copied database and separate
worker namespace; the existing signed-in demonstration was not reset. Backend checks passed
231 unit/verification and 78 integration tests. Science checks passed 10 tests with the optional
Torch sequence test skipped. Final browser outcomes and production checks are maintained in the
dated report; this entry does not assert production or operational acceptance.

Audit completion: two ten-round matrices retained 828 page inspections; the second passed all
50 interaction groups. Cumulative browser evidence is 149 distinct passing tests, with the proxy
check verified separately on authenticated Nginx. The final four remaining regressions passed
on the compiled build, including all five airframes and both broad phone themes. Final lint,
production typecheck/build, 30 quiet frontend unit tests and diff whitespace checks passed.
Concurrent-run timeouts and their recovery evidence remain documented; production capacity and
external release acceptance are still open.

## Two-pass final product audit — 20 October 2026

Completed exactly two additional audit iterations, separate from the earlier ten-round work.
Pass 1: 149 browser tests passed and one production-proxy test skipped; focused checks retained
three newly reproduced failures. Corrections bind onboarding validation to exact source/content,
clear/fence file-upload state, handle JSON-null ingestion and Reset sample errors, and keep the
aircraft browsing position/count unknown until the register loads. Five new browser regressions
cover these behaviors. Pass 2: **155/155 passed**, with zero skips, retries or failures, including
the actual Nginx proxy assertions.

The two live matrices inspected **336 pages** across four real roles, desktop/phone widths and
light/dark themes; all **40 interaction groups** passed with no recorded layout findings, page
exceptions or API 5xx. Frontend lint/type/build and 30 unit tests passed; backend Ruff/mypy
(184 files, standard optional-sequence exclusion) and 231 unit/verification plus 78 integration
tests passed; 11 scientific reference tests passed including Torch. These are bounded tests,
not a new serving-model accuracy experiment or operational acceptance.

Live copilot record answers matched the API for every role; its real UI/NDJSON stream also
passed. The configured qwen3:8b service is unreachable. The user chose to retain that configuration
and report it as a blocker. Production readiness also retains the documented independent security,
accessibility/intended-user, representative workload/data and deployment/recovery gates.

The corrected frontend is running at http://localhost:8080, with matching compiled entry-point
hash and a ready API. Temporary audit services were stopped; copied data/artifacts are retained.
Details, coverage, failures and reproduction: [two-pass audit](product_audit_two_pass_2026-10-20.md).
Changes remain uncommitted; no public deployment or aircraft qualification is claimed.

## Google Cloud deployment preparation — 20 October 2026

Prepared the existing aerocare-server target (us-central1, e2-standard-2, Ubuntu 24.04 amd64,
50-GB balanced disk), with loopback-first HTTPS, explicit migrations, image pinning, production
resource limits, worker/outbox health checks, bounded logs, read-only application roots and
backup/monitor timers. Backup/restore supports source archives and isolated configurable ports.
CI separates its integration database and fixture browser suite.

Executed checks: 243 unit/verification, 78 integration and 30 frontend unit tests passed; lint,
types and production Docker builds passed. All 34 selected CI browser tests passed without skips.
The isolated production-profile stack passed secure HTTPS/session/CSRF checks, a real durable
job, changed-IP API replacement without proxy restart and backup/fresh-project restore with
matching table fingerprints/model hashes. Local ARM64 verification is explicitly distinguished
from the required native amd64 VM checks. The runtime gate retains `assistant.unavailable`.

No GCE connection or deployment occurred. Follow the [GCE commands](../operations/gce_deployment.md)
and [validation/blocker record](../operations/gce_validation.md). Prior audit evidence and failed
runs remain retained; external security, accessibility, workload/data and operational acceptance
are still required. Changes remain uncommitted.

## Collaborator integration — 20 October 2026

Merged remote copilot commits `78f89e5` and `211a952` with local audit/GCE work through a
normal merge retaining both histories. Documentation conflicts preserve both additions;
the collaborator's non-overlapping source files remain byte-identical. Combined checks
passed 287 backend unit/verification, 78 integration and 30 frontend unit tests, plus lint,
types and production build. Three opt-in real-model integration cases remain skipped.
All 36 distinct selected browser cases have passing evidence: 32 in the combined selection,
then four corrected fixture cases in a focused rerun. Original failed complete runs remain
retained. See [integration evidence](collaborator_integration_2026-10-20.md). Earlier local
source archives predate this merge; use the merged Git revision for the next deployment.

## VM startup permission correction — 20 October 2026

The VM owner reported that the update to `812645a` migrated successfully but the API restarted
with permission denied reading packaged Python source. The update was pulled under `umask 077`;
root-owned mode-0600 source copied into the image was unreadable by runtime UID 10001. Runtime
packaging now normalizes read/traversal permissions only for source, migrations and Alembic
configuration. Secret files and persistent data are unaffected. The restrictive-context image
regression is recorded in [GCE validation](../operations/gce_validation.md). VM application
recovery still requires pulling the fix, rebuilding the backend services and verifying readiness.

## GCE deployment recovery verified — 20 October 2026

Owner-executed VM output confirms deployment of `91684fe`, successful backend rebuild/migration,
all six services healthy and HTTPS readiness 200 after the source-permission fix. Existing
PostgreSQL/RabbitMQ containers and custom Qwen setup were preserved. Independent public checks
passed trusted HTTPS, API readiness, nine frontend assets, HTTP redirect, authentication boundary
and security headers. Chrome sign-in checks passed at desktop/mobile widths without horizontal
overflow or page exceptions; public frontend entry matches the tested local production build.

The existing demo/Qwen overlays remain active. Model installation is confirmed, but actual AI
responses and authenticated live role workflows have not been verified in this follow-up.
Independent/operational release gates remain separate. See [GCE validation](../operations/gce_validation.md).

## Ask AI latency correction — 20 October 2026

Recorded count/availability/downtime answers no longer prepare unused Monte Carlo forecasts;
explicit forecast requests and the dashboard API retain their forecasts. Bounded introductions
omit unrelated tool definitions but still use the model. Local model turns are serialized per
API process with an immediate retry response for contention; direct record/help answers stay
available. Redacted Ollama timing logs and an operator diagnostics command distinguish loading,
prompt processing and generation. Model/provider configuration and grounding checks are retained.

Passed local checks: Ruff, mypy (187 files), 302 unit/verification and 78 integration tests; three
opt-in real-model cases skipped. Six real copied-data queries, including replay, passed with both
model and forecast calls forbidden. Warm local record queries took 18–43 ms after an initial
844-ms bundle load. Introduction request characters decrease by 60%; no VM latency gain is
claimed before deployment/measurement. Details: [copilot operations](../operations/ai_copilot.md).

The owner clarified that hi/hello were slow too. Additional corrections complete validated
answers at their final event instead of waiting for EOF, release authentication DB connections
before generation/streaming and enable HTTP/2 on TLS proxies. All answer modes now log redacted
compute timings. Final frontend checks passed lint/types/build, 31 unit tests and eight focused
assistant browser cases. Both production images built and Nginx configs passed; TLS selected h2.
Four real local HTTPS hi/hello requests completed in 197 ms initially and 8–12 ms thereafter
with no model service; these are isolated local timings, not authenticated VM latency. API/web
redeployment and hard refresh are needed before measuring the user's reported slowdown again.

## Ask AI local runtime activation — 20 October 2026

Rebuilt and replaced the stale local API and web containers with the latency corrections.
Also released authentication read connections before model-status probes; the regression
checks the connection is released even when the model is unavailable. Ruff and 16 latency
tests passed after that change; 108 focused assistant, 31 frontend unit and eight browser
tests passed earlier in this session. Real authenticated Chrome requests through the local
proxy completed hi/hello in 268 ms initially and 32–89 ms subsequently, and fleet count in
96 ms. Temporary test account/session records were removed. No VM update was performed:
this workspace has neither SSH configuration nor gcloud. See the copilot operations record.

## Ask AI VM update confirmed — 20 October 2026

Owner VM output confirms deployment of `4ed2818`: API/web rebuilt and healthy, Nginx validation
passed. Independent public readiness GET returned 200 over HTTP/2. The additional local status
probe fix remains outside that deployed commit. The supplied output omits the final model
benchmark JSON. Independent authenticated timing could not proceed because the documented
shared demo credentials returned 401; no repeated sign-in attempts were made. Actual live
greeting/model latency remains unverified pending the owner's signed-in check or diagnostics.
