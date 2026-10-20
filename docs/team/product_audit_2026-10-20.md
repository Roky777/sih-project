# Product audit — 20 October 2026

Status: local audit and corrective verification complete; production release acceptance remains open. This report records local engineering evidence, not production or operational acceptance.

## Scope and method

The requested audit covers operational and research pages, account entry, record handoffs,
forms, tables, charts, dialogs, menus, role restrictions, replay, loading/failure states and
responsive layouts. Existing user edits were retained. The Analysis redesign image remains a
preview; it was not implemented.

Ten live rounds used the existing signed-in local accounts. Each round visited the same 39
explicit routes/subviews plus authoritative case/research-aircraft detail records where available.
The initial matrix retained **409 completed page inspections**, one timed-out Notifications visit,
**50 interaction groups**, and **9,561 visible control inventory entries** (including repeats).
Inventorying a control does not prove every possible input or chart data point was exercised.

| Round | Account role | Width | Theme |
|---|---|---:|---|
| 1 | Engineer | 1440 | Light |
| 2 | Supervisor | 390 | Dark |
| 3 | Logistics | 1280 | Light |
| 4 | Fleet manager | 1920 | Dark |
| 5 | Engineer | 900 | Light |
| 6 | Supervisor | 320 | Dark |
| 7 | Logistics | 1440 | Light |
| 8 | Fleet manager | 390 | Dark |
| 9 | Engineer | 1366 | Light |
| 10 | Supervisor | 1440 | Dark |

A second ten-round pass against the compiled local website retained **419 page inspections**,
**50/50 passing interaction groups**, and **7,109 control inventory entries**. Its added work-order
detail route corrects a response-shape omission in the initial runner. Together the two matrices
record **828 page inspections across 20 rounds**. One 320px deliveries visit timed out; eight visits
displayed the backend-offline recovery state during concurrent builds/browser runs. These remain
recorded failures. The affected routes are checked again in the loaded production smoke below.
The route inventory samples initial layouts and can include loading placeholders; it is not proof
that every chart finished rendering. Dedicated loaded-data/browser tests supply that evidence.

Every round repeated register filtering/search/sort/view, all seven component accordions and
column alignment, Findings filtering/selection/drawer, inventory drawer horizons, menu disclosures,
theme and record search. Forty-nine groups passed initially; one mobile record-search wait timed
out and required retesting. The matrix deliberately checked no-WebGL fallback. Separate browser
specifications exercise actual 3D models, camera views, failed assets, lost contexts and selection.

State-changing browser journeys run against a copied database `fleet_browser_audit_20261020`,
separate artifact volume and RabbitMQ namespace, with API port 8012 and frontend port 5174.
The original localhost:8080 demonstration records and credentials were not reset. No publication,
external contact or public deployment was performed.

## Corrections

- Research engine selection now preserves dataset/view parameters instead of opening operational Analysis.
- Workflow-strip handoffs preserve selected aircraft/component/case and replay context.
- Aircraft browsing preserves the current tab, inspection choice and return URL while clearing previous record selections.
- The mobile component drawer's blueprint handoff waits for drawer closure and tab DOM availability before scrolling below the floating header.
- Tours omit Ask AI when the installation disables the assistant.
- Telemetry's saved-stream selector fits a 320px viewport.
- Tablet camera-control columns can shrink and wrap their labels instead of clipping beyond the 768px stage.
- Short-screen workspace selection keeps role cards clear of the confirmation action.
- Header geometry/glass styling is shared across routes rather than loaded only with Overview.
- Failed aircraft models show the existing matching-family preview; changing families resets the error boundary.
- Disabled customer trials show installation guidance and usable return links rather than an unhelpful retry error.
- The retired `/status` bookmark opens the grounded-aircraft register rather than a removed dashboard anchor.
- The portalled component-condition drawer now uses the active dark palette for its background, text, cards, borders and focus indicators.
- Long imported component/aircraft identifiers wrap within research evidence, the visual evidence sidebar and case context; research mapped component buttons wrap on narrow screens.
- Removed an undefined Three.js material-side option that produced repeated console warnings.
- Made the synthetic research label-isolation unit fixture independent of a repository-root configuration file absent from its Docker image.

Browser tests now explicitly distinguish workspace fixtures from account/tour entry tests. Obsolete
labels, destinations and layout assumptions were updated to the implemented workflow; new
regressions cover disabled trials, narrow telemetry and Research selection context. Screenshots
are retained under ignored artifacts rather than an untracked output directory.

## Executed checks

- Initial frontend lint/typecheck/build and 30 unit tests passed.
- Backend Ruff and mypy (184 source files), plus **231 unit/verification tests**, passed after correcting the test fixture.
- **78 PostgreSQL integration tests** passed on the separate integration test database.
- Science Ruff/mypy and **10 science tests** passed; one optional sequence test was skipped because Torch is absent in that image.
- A later parallel frontend run hit two five-second geometry-test timeouts under audit load; a serial rerun passed **30/30**. The failed run remains in the logs.
- Initial browser runs found entry-fixture drift, obsolete routes/labels, actual UI defects and overloaded software-rendering waits. These are retained as failures, not counted as passing evidence.
- A full 147-test browser run recorded **129 passed, 17 failed, one skipped**. Failures included obsolete assertions, the narrow research layouts corrected above, and timeouts during concurrent build/3D work. Sequential compiled-frontend retests are tracked below.
- Final production frontend typecheck/build passed and the local web container was restarted. Authenticated production checks passed gzip, `nosniff`, and CSP `frame-ancestors` on a model asset and an API response. These header checks are skipped on Vite and verified separately on Nginx.
- A quiet serial frontend unit rerun passed **30/30** in 4.95 seconds; earlier overloaded timeout failures remain retained.
- The loaded production smoke passed 15 pages/subviews, including data/chart completion, original dashboard 65%/78% readings, Notifications recovery, deliveries/telemetry at 320px and disabled-trial guidance. Desktop/mobile screenshots retain loaded dashboard charts. The separately retried Analysis models/reports subviews each loaded two charts.
- Before rebuilding the last layout correction, injected final styles passed **42 checks**: all five airframe families at eight widths (1440, 1280, 1050, 900, 768, 760, 390, 320), plus the research visual layout at 390/320px. This is explicitly pre-build CSS evidence; compiled-browser retests follow.
- Sequential compiled-browser retests recorded **12/17 passed**, then **4/8 passed** (five earlier regressions plus three new record tests), and finally **4/4 passed** after the remaining tablet/identifier corrections. The intermediate failures are retained.
- Across the full run and focused retests, **149 distinct browser tests passed**; the production-proxy test was skipped on Vite and its header/compression assertions passed separately against authenticated Nginx. This is cumulative evidence, not a claim of one uninterrupted all-green 150-test run.
- The final four-test run passed all five airframes at 1440/1280/768/390px, both broad 390px light/dark route audits, and long imported identifiers at 390/320px. No failed test remains in that run.
- Final lint and `git diff --check` passed. The final local production build includes the corrected tablet controls, research labels and dark drawer. The work remains uncommitted; no immutable release revision or public deployment is claimed.

Evidence is retained locally in `artifacts/product-audit-2026-10-20/`, including the ten-round JSON
inventory, screenshots, runner snapshot and original/corrected logs. Failure traces/screenshots from the full browser run and subsequent compiled retests are archived
inside that directory, alongside final passing captures. `apps/web/test-results/` contains the final
four-test run. Initial layout inventories can include loading placeholders; use the loaded smoke
JSON/captures and dedicated browser checks for data/rendering evidence.

## Resumed regression evidence reconciliation

On resuming the audit, current `npx playwright test --list` discovery found **150 tests in
35 files**. Matching each current test by file and exact title against archived passing
log lines accounted for **149 tests**. The remaining production-proxy test is covered by
the separate authenticated Nginx assertions in `production-security.json`. No current test
was left without corresponding evidence. Earlier renamed tests were checked against their
current titles; original failed logs remain retained.

The per-test mapping is retained at
`artifacts/product-audit-2026-10-20/regression-evidence-reconciliation.json`.
This reconciliation reran test discovery, not browser execution, backend checks or scientific
experiments. It confirms the documented cumulative evidence and does not establish a fresh
uninterrupted all-green suite run. Docker service inspection also confirmed that the original
web, API, worker, dispatcher, PostgreSQL and RabbitMQ services remain running. No application
code or demonstration records were changed during reconciliation.

## Production-readiness boundary

Repeated browser checks cannot establish that no bug exists or that every possible feature/input
combination is correct. This is a synthetic maintenance decision demonstrator. External release
gates in `release_acceptance.md` and `../operations/production_readiness.md` remain authoritative:
intended-user/accessibility acceptance, independent security review, trusted deployment and
recovery/load validation, approved operational data/rights, and scientific/operational qualification.
No aircraft clearance, measured operational improvement or completed production certification is claimed.

The temporary audit API, worker, dispatcher and static preview were stopped after verification.
The labelled copied database and artifact volume are retained for reproduction. The original
localhost:8080 application remains running on the final frontend build.
