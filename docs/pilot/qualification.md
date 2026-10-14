# Model and visual/physical-twin qualification plan

Status: proposed operator-specific evaluation. Existing simulated-data benchmarks remain useful
research evidence; they do not transfer automatically to a new aircraft or component.

## Model support statement

Before evaluation, record aircraft/configuration, component type/serial family, input signals and
units, regimes, minimum history, prediction target/unit/horizon, censoring/failure definition,
excluded conditions, model/transform/calibration hashes and reviewer. A new sensor feed is not
eligible solely because it has the correct array length.

1. **Audit the dataset.** Reconcile installs/removals, clocks, maintenance outcomes, censoring and
   missingness. Identify label quality and maintenance-induced observation bias. Keep confirmed
   findings separate from model alerts; an alert cannot serve as its own ground-truth label.
2. **Freeze the evaluation.** Partition by aircraft/component and time as appropriate; group repeated
   histories from the same asset. Prevent future events, test outcomes or replacement history from
   entering predictors/transforms/calibration. Disclose prior dataset inspection. Freeze population,
   sampling, baselines, budgets, subgroup analysis and exclusions before final inspection.
3. **Compare useful baselines.** Include the current decision process and a suitable simple predictor/
   alert policy. Fit preprocessing on permitted training data only. Use common inputs and record
   unsupported cases rather than selectively excluding them.
4. **Evaluate prediction and uncertainty.** Report error/late error in target units, interval coverage
   and width, sample support and relevant regime/life-stage groups. Distinguish asset-level and
   repeated-trajectory metrics. Report withheld/stale/unsupported fractions alongside performance.
5. **Evaluate alert episodes.** Define the confirmed event, review window and actionable episode.
   Report missed events, false episodes, useful lead time and review workload. Use independently
   held-out complete histories; do not count every repeated warning as a separate fault.
6. **Challenge robustness.** Test observed outages, missing values, quality flags, clock faults,
   sensor drift/noise and unsupported regimes. Retain intervention definitions, seeds and results.
   Confirm that unavailable predictions do not erase concerns or mandatory tasks.
7. **Validate human interpretation.** Engineers must understand evidence, uncertainty and limits.
   Explanations describe model influences, not a confirmed fault or approved repair procedure.
8. **Register the decision.** Review hashes/results against frozen criteria. Accept only the declared
   support envelope or restrict/reject. Define drift monitoring, withdrawal/rollback triggers and
   who may change the qualified model. Record all later changes as new versions.

Operational metric budgets, minimum event counts, tolerances and sample-size justification are
**unagreed**. Leave them null in the manifest until the operator/domain and evaluation owners decide.
Do not reuse `configs/acceptance_proposal.yaml` FD001 demonstrator targets as aircraft requirements.

## Geometry and component installation

There are three separate evidence levels:

| Level | Evidence required | What can be claimed |
|---|---|---|
| Current illustrative view | Authored asset, explicit conceptual engine mapping, source/component/assessment linkage. | Data-connected visual demonstration; no verified installation or physical twin. |
| Verified visual configuration | Permitted geometry/drawings and revision, type/variant/configuration, dimensions/units/axes, installation effectivity and engineer-approved mesh-to-component mapping. | Visual representation verified for that configuration and declared tolerance. No physical response prediction implied. |
| Validated physical twin | Explicit physical model and use case, parameters/boundary conditions, calibration and independent measured response tests with approved tolerances/regimes. | Only the evaluated physical behavior within its declared support. |

For a verified visual configuration, retain a mapping row per assembly: asset hash/revision,
mesh/group ID, aircraft configuration, component/installation identity, effective dates, transform/
units, source drawing reference, reviewer and discrepancy status. Verify handedness/orientation,
scale, assembly coverage, pick-to-record identity, unsupported parts and historical configuration.
A new installation must not inherit the previous component's evidence because it occupies the same
screen location. Confirm accessibility/text fallback and selection behavior without WebGL.

A red assembly shows a recorded concern associated with that component. It must not imply the
specific internal surface is damaged unless independently confirmed evidence supports that claim.
Unknown/stale/unmapped parts remain visibly distinct. Never colour an entire aircraft healthy from
one engine's supported assessment.

## Qualification evidence index

Retain approved data references/permissions; split and label audit; frozen evaluation configuration;
model/transform/calibration and geometry hashes; reproducible commands/environment; per-case outputs,
failures and subgroup counts; engineering discrepancy resolution; independent review decision;
support limitations; monitoring/rollback plan. Store restricted data outside the repository.
