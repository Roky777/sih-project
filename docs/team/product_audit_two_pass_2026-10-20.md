# Two-pass product audit — 20 October 2026

Status: exactly two audit iterations complete; corrective verification passed; production release acceptance remains blocked. This report covers the user's new
request for exactly two audit iterations. Counts from the earlier ten-round audit are separate.

## Scope and isolation

Each iteration combines the complete browser regression suite with live page/control inspection
under engineer, supervisor, logistics and fleet-manager server sessions. Role contexts within
an iteration are not additional audit iterations. The live matrix visits 39 explicit routes/views
plus authoritative case, work-order and research-aircraft details. The suite adds registered
records, component detail, bookmarks/aliases, keyboard/permission/failure states and real workflows.

Live account inspections use localhost:8080 without changing operational records. State-changing
browser journeys use port 5174, the copied `fleet_browser_audit_20261020` database,
`fleet-browser-audit-artifacts` volume and `fleet-browser-audit` broker namespace. The test frontend
uses Nginx with the isolated API as upstream. PostgreSQL integration tests use the separate
`fleet_release_integration_test` database. No publication or external operational data access occurs.

The interface's purposes remain evidence review → constraint-checked planning → supply → work
and verification, with scenario comparisons kept as synthetic projections. Research datasets,
cutoffs, logistics and approvals remain separate from the operational 40-aircraft demonstration.

## Defects found and corrections

- A delayed onboarding preview could enable Save after its source reference changed. Validation
  now binds to the exact source/content; obsolete responses cannot change current validation.
- Clearing a file retained its previous content, and asynchronous reads could replace a newer
  selection. File changes clear content/validation, old reads are fenced, and aircraft changes
  reset the import form.
- JSON null in the ingestion tester caused an uncaught browser exception. Invalid top-level
  input now shows an accessible validation message; Reset sample also clears that message.
- Aircraft browsing displayed `01 / 00` while its register was loading. The position/count now
  remain unknown until the register supplies them, with browsing disabled during loading.

Supplemental copilot probe failures are retained separately: an initial selector used the visual
label instead of its accessible name, and Chrome did not expose the consumed streaming body
to response inspection. The corrected probe checks the rendered UI and request-client NDJSON;
these probe failures are not counted as application defects or passing checks.

Original failing reproductions and traces are retained. Focused reproductions belong to pass 1;
checking the corrections belongs to pass 2. Exactly two broad audit iterations were run; there was no third.

## Executed evidence

All evidence is local under `artifacts/product-audit-two-pass-2026-10-20/`.

| Check | Outcome |
|---|---|
| Pass 1 complete browser suite | 149 passed, one proxy test skipped, zero unexpected failures; 11.35 minutes. |
| Pass 1 new focused reproductions | Three failed as expected: stale validation, JSON null, and loading position. These are retained failures, not passes. |
| Pass 1 live role matrix | 168 page inspections, 20/20 interaction groups; zero recorded page exceptions, layout findings or API 5xx. |
| Frontend lint/typecheck/build/unit checks | Passed; 30 unit tests. Final source build/lint also passed after counter correction. |
| Backend lint/typecheck/unit/verification | Passed; 231 tests and mypy across 184 files with the standard optional-sequence-module exclusion. Initial cache-write failure with a read-only mount retained; corrected run disables Ruff caching. |
| Backend integration | 78 passed on the separate test database, including real PostgreSQL stock/resource concurrency. |
| Pass 2 corrected compiled browser suite | 155/155 passed, zero skips, retries, unexpected failures or flaky tests; 11.29 minutes. Includes all five new regressions and the actual Nginx proxy check. |
| Pass 2 live role matrix | 168 page inspections, 20/20 interaction groups; zero recorded page exceptions, layout findings or API 5xx. |
| Scientific references | 11 passed, including the optional Torch sequence test; synthetic fixture fits only, with no serving-model retraining, tuning or final-test evaluation. |
| Live copilot record answers | Passed for all four roles; each fleet answer matched the authoritative API. The real signed-in UI and NDJSON stream also passed with a completed, cited record answer. Generative model service unavailable. |

The full suite includes genuine model/worker planning, receipt, approval/work, onboarding,
availability-study and telemetry journeys, alongside API-fixture frontend tests. Fixture tests
establish UI behavior rather than live deployment integration. The live matrix explicitly disables
WebGL to exercise fallback; dedicated suite tests exercise actual 3D rendering, all five airframes,
camera controls, model failure and lost WebGL contexts. Screenshots were also inspected for page
composition, wrapping, spacing and readability. Route snapshots may still include a scene's loading
placeholder; dedicated rendered-model tests provide the corresponding completion checks.

## Reproduction and retained identity

The existing isolated services must be running with their copied database/artifacts and the
Nginx test proxy before using these commands. Run the suite from `apps/web/`:

```sh
FLEET_E2E_BASE_URL=http://127.0.0.1:5174 FLEET_E2E_PRODUCTION_PROXY=true npx playwright test --workers=1 --retries=0
```

The explicit production-proxy flag allows the header/compression check on port 5174 when it
actually serves Nginx; it remains skipped for an ordinary Vite server. This flag does not change
application behavior. The live matrix runner is retained as `live-pass.mjs` in the evidence
directory, accepts pass `1` or `2`, and loads local account credentials without printing them.
Do not substitute the original demonstration URL for state-changing suite runs.

`pass-2-source-manifest.json` retains 195 source/test/config hashes and 103 compiled asset hashes.
The corrected image was rebuilt, the original local web service alone restarted, and its static
assets copied into the isolated proxy. No application source/test/config drift was observed after
the final pass began. These working-tree hashes do not replace a reviewed immutable release.

## Page and feature coverage

| Sections | Function and checks |
|---|---|
| Login, signup, workspace entry, account, help | Role-bound sign-in, registration errors/disabled state, account switching, tour persistence, recovery links and role responsibilities. |
| Overview | API-backed availability/counts, charts, health cells, role priorities, record navigation and responsive cards. |
| Aircraft register and detail | Search/filter/sort/cards/table, return context, all five visual families, camera views, component drawers, seven system accordions, blueprint, maintenance/history, replay and missing records. |
| Findings, component health, cases | Evidence identity/cutoff, status/search/selection, drawer focus/Escape, mandatory-vs-predictive review, confirmation and linked planning. |
| Maintenance and work detail | Work queue, bay timeline, case register, history, selected-record scope, hard constraints, exact proposal/approval, reservations and recorded work. |
| Spares and request detail | Requests/inventory/deliveries, part drawer/horizons, quantity and destination links, receipt, stale-version handling and linked supply readiness. |
| Analysis | Comparison, availability study, reports and model evaluation; assumptions, saved runs, negative outcomes and worker results. |
| Data and telemetry | Sources, processing/recovery, malformed imports, onboarding/components/source records, duplicate/invalid frames, transport freshness and mapped assessments. |
| Research and guided trial | Separate datasets/register/spatial inspection, cutoffs, withheld/error evidence, benchmarks/drawings, planner/inventory/comparisons and genuine input-to-approved-work trial. |
| Shared controls and failure states | Menus/search/theme/settings, keyboard focus/navigation, phone/tablet widths, long identifiers, reduced motion, no-WebGL/model failure, loading/empty/denied/error and aliases. |
| Copilot | Stream completion/truncation/cancellation/malformed response, context/citations, truthful unavailable state and actual record-answer/API agreement. Generative service remains unavailable. |

The matrix lists exercised feature groups; it does not assert exhaustive testing of every
possible record, input, chart point, browser or operating condition.

Build output retains the existing large chart/3D chunk and shared-import warnings. Backend
logs retain three dependency deprecation warnings. Passing local checks does not establish a
representative device/workload latency budget or resolve the documented deployment gates.

## Release decision

The local corrective audit is complete. Across the two live passes, **336 page inspections**
and **40/40 interaction groups** passed with no recorded layout findings, page exceptions or
API 5xx. The original app serves the audited compiled entry point (hash matched) and its API
reports ready. Application source/test/config hashes remained unchanged throughout pass 2.

**The product is not accepted as production-ready.** The user explicitly chose to keep the existing
`qwen3:8b` configuration and record the unreachable model service as a blocker; no model
download or provider change was performed. Local browser and service checks cannot establish every possible feature/input
combination or production acceptance. Existing gates remain: representative operational data and
approved scientific/resource/workload limits, intended-user and complete accessibility acceptance,
independent security review, trusted deployment/recovery/retention acceptance and reviewed release
ownership. See [release acceptance](release_acceptance.md) and
[production readiness](../operations/production_readiness.md). No aircraft clearance or observed
operational benefit is claimed.

The temporary audit services were stopped after verification; the copied database, artifacts,
logs, traces and screenshots are retained. The original app remains running on the corrected
frontend at http://localhost:8080. No commit or public deployment was performed.
