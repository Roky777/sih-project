# ADR 0006: Synthetic fleet-health workspace from the PS 26249 plan

Accepted implementation decision, 2026-10-06. Source plan: `hritvikrajmishra/PS26249` `docs/plan.md`.

## Context

The plan asks for nine essential modules on a whole-fleet, multi-system synthetic world: data integration, a fleet dashboard, health monitoring with anomaly detection, a predictive engine (risk, RUL, advisories), a software digital twin, spares intelligence, planning and work orders, an availability scenario simulator, and alerts. `scope.md` had excluded whole-aircraft twins and learned spare demand, and the existing release centred on C-MAPSS engine RUL. The product owner asked for the plan to be integrated in full, with a more interactive interface.

## Decision

Add the plan as a **separate, clearly labelled synthetic workspace** beside the C-MAPSS engine lab. Do not replace the lab.

| Plan module | Implementation |
|---|---|
| 1 Data integration | `science/fleet/integration.py`: four source extracts with injected identifier, date-format, duplicate and quality defects, normalised into the aircraft → system → component → part model; validated ingestion endpoint with per-row errors |
| 2 Fleet dashboard | `/dashboard` |
| 3 Health monitoring | condition-normalised residuals, Isolation Forest, sustained-alert rule; `/health/:id` |
| 4 Predictive engine | calibrated 14/30-day risk, quantile RUL with conformal widening, rule-based priority (`priority.yaml`), template explanations |
| 5 Digital twin | roll-up and 120-day replay (`decisions.twin_aircraft`); SVG schematic; global replay control |
| 6 Spares | demand = scheduled + Σ calibrated failure probability vs moving-average baseline; shortfall and lead-time-vs-RUL checks |
| 7 Planning & work orders | advisory status workflow and planned work orders in PostgreSQL; bay Gantt |
| 8 Availability engine | day-step Monte Carlo with common random numbers; four scenario types |
| 9 Alerts | four rules, persisted acknowledgements |
| 10 Analytics | Ai/Ao, MTBF/MTTR, model evaluation against baselines |

Storage follows ADR 0002: the generated world, scores and evaluation are written by a durable `fleet_engine` worker job into a SHA-256-verified artifact bundle. PostgreSQL holds only mutable human decisions (`fleet_*` tables, migration `4171f79fe2a6`). The API never trains or simulates histories.

Substitutions, so that the locked dependency set is unchanged:
- LightGBM is replaced by scikit-learn `HistGradientBoosting*`.
- SHAP is replaced by occlusion attribution on the risk model's log-odds.

Plan roles map to the existing roles: Commander → supervisor, Planner → planner, Technician → engineer/viewer. Existing cookie sessions are kept instead of JWT.

## Consequences and limitations

- Everything is synthetic. Four hero aircraft (AC-017, AC-023, AC-008, AC-031) and the HYD-114 stock follow disclosed scripts (`World.scripted`).
- The model results were measured on a held-out time period and held-out aircraft (engine run of 2026-10-05). They describe this simulator only:
  - 14-day risk: PR-AUC 0.785, against 0.759 for the logistic baseline.
  - RUL near failure: MAE 13.0 days, against 19.9 for the linear baseline.
  - The 10–90 % RUL interval covers 97 % of all rows, but only 64 % within 60 days of failure. This is below the nominal 80 %.
  - The rolling-z anomaly baseline has higher recall but far more false alarms. The detector choice is a trade-off.
- Ingested readings are validated and stored but do not rescore the current bundle.
- Advisory decisions apply only at the latest engine date; replayed dates are read-only. Replay uses the receipts recorded after the replay day, which is a small look-ahead in the spares view.
- Scenario comparisons are bounded synchronous calculations (≤ 500 runs, ≤ 60 days; about 1 s).
- None of this establishes accuracy on real aircraft, operational readiness or airworthiness.

## Validation

- `tests/unit/test_fleet_health.py` covers seed reproducibility, non-negative stock, the missing-data rate, past-only features (leakage), simulator seed reproducibility, monotonic sanity checks for spares and capacity, health and action rules, ID normalisation, and KPI arithmetic against a hand-computed fixture.
- `make backend-check` and `make web-check` pass.
- Every screen was checked in the browser, in both themes, with no console errors.

## Addendum 2026-10-06: role-based flow

The interface is organised around four users and one flow:

1. A maintenance engineer reviews findings (`/review`).
2. A maintenance supervisor schedules the work (`/plan`).
3. Logistics secures the part (`/parts`).
4. The fleet manager sees the resulting availability (`/status`).

`/welcome` explains the flow and lets the user choose a role. Other screens are grouped under "Explore", and the C-MAPSS tools sit under "Research lab".

Scheduling a work order now creates a `fleet_part_requests` row (migration `61a3e0ef5591`). It is created as `reserved` when an unreserved unit is on hand, and as `open` otherwise. Ordered parts (with an ETA) and received parts feed the spare positions and the availability simulation.

There is a new `fleet_manager` role. The parts-request records are tracked decisions; they do not change the synthetic engine bundle.

## Addendum 2026-10-06: supervisor decisions change fleet state

- **Closing an agency repair:** a supervisor can close an open agency work order with "Return to service" (`fleet_recorded_closures`, migration `e11b31b6122f`).
- **Starting planned work:** this grounds the aircraft as scheduled maintenance.
- **Completing work:** this fits a new part (health index 100, no risk) and consumes the reserved spare.

`decisions.effective_aircraft_state` applies these decisions at the latest date to Fleet status, the twin, the heat-grid, backlog, spares and the re-run 30-day forecast. Replayed dates still show the engine's recorded history.

## Addendum 2026-10-07: enterprise UI specification

**Shell and design system**
- The interface follows the seven-screen operations-centre specification.
- Dark is the default theme, using the spec palette: `#0B101E` canvas and `#161D2C` panels. A light theme remains available.
- Visual rules: Roboto Mono for numbers, 4px radius, hard 1px borders and 32px table rows.
- The 48px header carries the official-marks slot, the `[ SYNTHETIC DATA ENVIRONMENT ]` strip and an inline replay slider.
- The 220px sidebar lists the seven screens. The team workflow, alerts, reports, data sources and research lab are kept under collapsible groups, so no earlier feature was removed.

**Decisions**
- **Official marks.** The application does not draw or download the MoD emblem or the DSSC crest. `public/branding/` takes authorised artwork, rendered in monochrome, with a neutral placeholder until it is provided.
- **Displayed values.** Every value is computed by the engine or simulator. The example figures in the UI specification (82%, HI 41, 62% and so on) are not hard-coded, consistent with the rule against invented outputs.
- **Attribution label.** Risk drivers are labelled "occlusion attribution (SHAP substitute)".
- **Bundling saving.** Bundling savings on the Gantt are the overlap between the planned job and the same aircraft's due inspection.
- **New endpoint.** `PATCH /fleet-health/work-orders/{id}/schedule` moves planned work and re-simulates its impact.

## Addendum 2026-10-07: Phase 12 (Project Forge and the cannibalization planner)

**Project Forge (additive print route)**
- Four of the 20 catalogue parts are printable: HYD-020 reservoir and filter, AVN-310 display unit, FUE-031 fuel quantity sensor and ECS-410 cooling pack. They are marked with `additive_printable` in `catalog.py` and in the bundle catalogue. Bundles made before the flag fall back to the catalogue codes. The main hydraulic pump (HYD-114) is not printable.
- When no unit is available for a printable part, `decisions.spare_check` returns the status `additive_print` with a lead time of `PRINT_DAYS` (1 day). The supplier lead time is kept as `supplier_lead_time_days`. Lead time is not flagged as exceeding the RUL.
- The same 1-day route applies to the advisory spare wait, inventory status (`print`), parts-request ETAs and the Monte Carlo simulator. Print time has no supplier noise and still applies when a scenario makes the supplier unavailable.
- The UI wording is "Supply bypassed: additive print route (1 day)" and "[ ADDITIVE PRINT ROUTE · 1 DAY ]". The specification's "G-Code Sent / DISPATCHED" is not used, because nothing is sent to a printer.

**Cannibalization planner**
- `science/fleet/cannibalize.py` serves `GET /fleet-health/engine/cannibalize-strategy?as_of=`. It is read-only and records nothing.
- **Recipients** are grounded aircraft blocked only by a missing part. That means agency work in the awaiting-spares phase, or started workspace work whose part request is still open or ordered.
- **Donors** are other grounded aircraft. Only healthy units with health index 80 or more, not under work, are used. Mission-capable aircraft are never robbed.
- **Printable parts** are printed rather than robbed, and parts arriving through supply within 3 days are not robbed.
- **Greedy order:** aircraft needing the fewest parts first, removals concentrated on donors already robbed, then the cheapest swap.
- **Exact check:** every recipient subset with a Hungarian least-labour assignment (scipy), up to 14 recipients. If the exact plan unblocks more aircraft or uses less labour, it is returned instead, and `plan_source` says which was used.
- On random adversarial cases, greedy matched the optimum in 78% of 500 instances. It matched on every replay day checked in the synthetic fleet.
- **Labour is an assumption:** removal and fitting each take 25% of the type's repair effort, at 16 man-hours per repair day. A cross-base move adds 6 h.
- Unblocked aircraft still need their bay time. Each donor then waits for that part through normal supply, and the response reports that wait.

## Addendum 2026-10-07: glass navigation and light palette

This supersedes the enterprise shell geometry and the dark default described above. All screens, features and data are unchanged.

- **Navigation.** The 220px sidebar is gone. The header holds:
  - a frosted pill bar with the seven screens, shortened to Overview, Aircraft, Components, Predictive, Bays, Spares and Simulator;
  - "Workflow" and "More" pill menus for the team steps and supporting views;
  - round search, theme, alerts and profile buttons.
- **Context bar.** A slim bar under the header carries the synthetic-data label, the API state and the replay slider. The synthetic-data label stays visible on phones.
- **Phones.** Below 1240px the pills collapse into a glass menu sheet.
- **Palette.**
  - Light is the default: off-white canvas, white 18px-radius cards, green accent `#34b36a`, blue `#3e86f5` for planned work, red and amber for risk.
  - Dark is a graphite variant with the same hues.
  - Colour values that were hard-coded in charts and CSS now read the theme tokens.
- **Charts.** Smoothed green lines with gradient fills, grey comparison bars, faint solid gridlines and frosted tooltips.
- **Glass popups.** Menus, alerts, profile, command palette, modals, drawers, toasts and chart tooltips use `backdrop-filter`.
  - Write `backdrop-filter` unprefixed. The build adds the `-webkit-` form; with both written by hand, the minifier kept only the prefixed one, which Chrome ignores.
  - Header blur sits on pseudo-elements, so popups inside the header can blur the page.
- **Bay flow.** The Bays screen adds a diagram above the timeline, built from the same schedule data:
  - each bay is a panel whose lit cells show elapsed share of its planned bay time;
  - coloured lines run to the aircraft in each bay;
  - aircraft waiting for a bay or a part hang off each agency line on animated amber lines;
  - a bay list with progress bars and a glass detail card complete the view.

## Presentation consolidation — 11 October 2026

The historical role-route and navbar descriptions above are superseded by the [canonical user flow](../product/user_flow.md). `/review`, `/plan`, `/parts` and `/status` redirect to the findings queue, maintenance work board, supply requests and dashboard grounding detail, retaining selection. One navigation inventory contains Operations, More and Research. Fleet operations and engine research retain their independent record semantics; no engine data/API/scientific decision is changed by this consolidation. See [site audit](../design/site_flow_audit.md).

## Addendum 2026-10-11: mixed synthetic fleet and generated blueprints

- **Fleet mix.** The synthetic fleet is no longer one generic type. `engine.py` labels every five tails as three light combat aircraft, one advanced jet trainer and one medium transport (`FLEET_TYPES`), using class labels only. The labels do not change the simulation, the models or the decisions; they choose each tail's visual model, cutaway and blueprint. The web client mirrors the order (`airframeForIndex`) so that bundles made before this change still show a consistent mix.
- **Per-airframe architecture.** Component installation zones are defined per airframe in metres (`AIRFRAMES[*].layouts`); the cutaway internals are derived from each airframe's geometry.
- **Blueprint.** The hand-drawn fighter sheet is replaced by a sheet generated from the airframe definition (three views to stated scales, dimensions, stations, title block, callouts). It is a public-data approximation and is labelled "not for manufacture".

**2026-10-12 update.** Two more classes were added (heavy multirole fighter, utility helicopter). The fleet now repeats a ten-tail cycle: 4 light combat aircraft, 2 trainers, 2 transports, 1 heavy fighter and 1 helicopter (`FLEET_TYPES` / `FLEET_CYCLE`). The cycle keeps every tail that was already a trainer or transport in that class. Aircraft browsing on the aircraft page is now sideways (horizontal swipe, shift + wheel, ← → keys, left/right buttons); vertical scrolling only scrolls the page. The transport model was rebuilt: a radome/fuselage gap was fixed, and it gained framed glazing, winglets, refined nacelles and composite propellers.


## Addendum 2026-10-12: AI Maintenance Copilot

An optional, isolated assistant (`services/assistant/`, `api/routes/assistant.py`, `apps/web/src/features/assistant/`) explains fleet data through allowlisted tools that wrap the existing services. Qwen3-8B via Ollama is the configurable default model. Calculations remain with the existing engine, decisions overlay and Simulator; the model interprets questions and explains results. It has no write access to records. What-if runs are separate Simulator scenarios. Approval of any proposal stays in the existing workflow and is not flight clearance. `FLEET_ASSISTANT_ENABLED=false` restores the previous experience. Details, configuration and limits: `docs/operations/ai_copilot.md`.
