# Frozen multi-subset demonstration protocol — 15 October 2026

NASA's [C-MAPSS source](https://data.nasa.gov/dataset/cmapss-jet-engine-simulated-data)
contains simulated engines, not confirmed operator maintenance outcomes. Acquisition verifies
the retained outer and nested archive SHA-256, checks existing bytes before extraction and
retains a per-file ledger. `data/sources.yaml` records source hashes. FD001 source/model/report
bytes remain unchanged; its displayed 8.72/11.71 cycles are historical inspected evidence.

## Protocol and actual results

`configs/multidataset_benchmark.json` was frozen before the first official test evaluation.
FD002–FD004 each have independent fit/validation/calibration engine partitions, seed 26251.
Operating-setting clustering and per-regime sensor scaling use fit engines only (6/1/6 regimes).
A fixed histogram gradient boosting regressor uses 30-cycle snapshot features, all eligible fit
cutoffs, no early stopping and no test-based parameter selection. Validation and calibration
use one seeded random cutoff per engine; official test endpoints are evaluated only after
weights/calibration are saved. Short histories below 30 cycles are withheld, not assigned zeros.

| Subset | Fit / validation / calibration | Train / official test engines | Evaluated / withheld | Capped MAE (cycles) | Capped RMSE (cycles) |
|---|---|---|---|---|---|
| FD001 historical, different model | 70 / 15 / 15 | 100 / 100 | 100 / 0 | 8.72198 | 11.70987 |
| FD002 research v1 | 182 / 39 / 39 | 260 / 259 | 253 / 6 | 9.75974 | 13.41705 |
| FD003 research v1 | 70 / 15 / 15 | 100 / 100 | 100 / 0 | 8.53873 | 11.97550 |
| FD004 research v1 | 174 / 37 / 38 | 249 / 248 | 237 / 11 | 9.68687 | 14.08264 |

Primary targets are capped at 125 cycles; full uncapped metrics, constant fit-target baseline,
per-engine predictions, labels, sensor traces and noncausal feature replacement sensitivities
are retained in each JSON report. Different data/protocol/model rows are not a controlled ranking.
FD004's pinned files actually contain 249 training and 248 test engines, opposite to the
readme/portal count listing; observed file counts determine denominators.

Nominal interval coverage is 90%; observed coverage and mean width: FD001 98.0%/58.23 cycles,
FD002 89.33%/42.35, FD003 100%/67.13, FD004 97.47%/66.91. Calibration cutoffs and test endpoints
differ in distribution: no individual failure probability, conditional guarantee or physical
life limit is implied. Review thresholds ≤20/≤45 cycles are unqualified demo review rules.

## Reproduction and retained artifacts

First run: `artifacts/research/multidataset-v1`. Reproduction with final formatted scientific
code: `artifacts/research/multidataset-v1-reproduced`. Both are retained. All engine predictions,
metrics and new model hashes match exactly (`artifacts/research/reproduction-comparison.json`).
The first run's formatting/provenance preceded final source formatting; use the reproduced
bundle's environment/code/protocol hashes as the reviewable final provenance. No parameter
was retuned after inspecting test results. These subsets are now inspected evidence for future work.
The base revision is c80e780 plus uncommitted changes identified by file hashes, not a clean
revision claim. Environment records Python/scikit-learn versions and configuration/source hashes.

```sh
docker run --rm -v "$PWD:/workspace" -w /workspace -e PYTHONPATH=/workspace/backend/src fleet-maintenance-test python scripts/fetch_research_subsets.py
docker run --rm -v "$PWD:/workspace" -w /workspace -e PYTHONPATH=/workspace/backend/src -e OMP_NUM_THREADS=1 -e OPENBLAS_NUM_THREADS=1 fleet-maintenance-test python scripts/evaluate_research_subsets.py --source-revision c80e780 --output artifacts/research/NEW-UNUSED-DIRECTORY
docker compose up -d --build
docker compose run --rm --no-deps -v "$PWD:/workspace:ro" api python /workspace/scripts/install_research_evidence.py --source /workspace/artifacts/research/multidataset-v1-reproduced
```

The evaluator refuses an existing output directory. The JSON-only installer verifies all report
hashes/contracts in staging, atomically publishes, and refuses different installed evidence.
It does not load research pickles or promote a serving model. Reports remain outside Git.
A fresh clone must acquire/evaluate/install; missing/corrupt bundles return 503 with explicit UI
errors rather than invented results. Research UI: `/research?view=benchmarks`; engineering
register: `/research?view=drawings`. The existing FD001 `/demo` remains the actual inference,
planner, supply comparison, approval and completed-work path.

## Independent second-dataset assessment

[NASA entry 17](https://www.nasa.gov/intelligent-systems-division/discovery-and-systems-health/pcoe/pcoe-data-set-repository/)
describes synthetic run-to-failure engines under realistic flight profiles, provided with ETH
Zurich/PARC. Its [author documentation](https://ntrs.nasa.gov/citations/20205001125) is a separate
schema/protocol source. It was assessed as a separate workstream, not downloaded or evaluated
in this release. Do not feed it into the fixed 26-column FD001–FD004 loader or pool its metrics.
Before implementation: inspect its file/schema/time-resolution and labels, define measured-input
allowlist (exclude health/target/privileged simulator outputs), engine/flight splits and cutoff
semantics, fit preprocessing on training engines, and preregister evaluation units. No N-CMAPSS
accuracy is claimed. Extra simulated data cannot qualify actual aircraft predictions.

## Engineering evidence and availability

`/research?view=drawings` lists the five illustrative model families, catalogue component and
mapping source, with drawing reference/revision/reviewer missing and verification pending.
ASRS narratives may support cases; they are not component run-to-failure truth. NIST configuration
guidance is not an approved drawing. Operator data, approved geometry and engineering reviews
remain external gates documented in `docs/pilot/`.

The existing `/simulator` compares current-plan baseline with preventive replacement, supply
or capacity interventions using shared random numbers. New runs retain denominator, repair,
stock, lead-time, bay, inspection, intervention, seed and horizon assumptions. Availability =
1 − mean unavailable aircraft-days / (aircraft × horizon days); difference is percentage points.
The planned 0.7 repair multiplier and lognormal noise are assumptions, not measured savings.
Older runs lacking a snapshot show that limitation. No observed availability improvement is claimed.

The NASA author example documents 1 Hz within-flight readings and distinct scenario descriptors,
measured variables, virtual sensors and unobservable health parameters. Consequently, a raw
row in that dataset is not equivalent to an FD00x cycle snapshot. A separate aggregation/window
policy and engine/flight weighting are required before any meaningful error comparison.

## Verified local freeze

15 October checks: frontend lint/typecheck/production build and 29 unit tests passed; backend
Ruff/mypy and 222 unit/verification tests passed; 78 isolated database integration tests passed;
10 scientific tests passed (optional sequence module skipped without PyTorch). Five full customer
journeys and six research/aircraft browser checks passed. Actual screen capture has no page errors.
The synthetic preventive example `sc-49bafce130` retains 560 aircraft-days of exposure; its negative
availability change (−3.84 points) and +21.50 lost aircraft-days are preserved for honest comparison.

The public [Pages entry](https://pallavpushkar3-gif.github.io/sih-project/) was checked in Chrome:
HTTP 200 with “Demo backend offline”, reaching for the unavailable configured HTTPS tunnel.
This verifies the offline state only. It does not verify public login, CSRF, cookies, CORS or SSE,
and the newly implemented research functionality is currently local. Follow
`docs/operations/pages_and_tunnel.md` to restore public hosting and rerun its HTTPS verifier.
Verdict: **READY WITH LIMITATIONS** for the local SIH demonstration, not operational deployment.
