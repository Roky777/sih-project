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
