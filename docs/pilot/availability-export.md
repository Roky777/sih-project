# Recorded availability export and evaluation

Implemented 14 October 2026. This is an **offline canonical export evaluator**, not an aircraft
connector or an operational qualification. It does not write application records. No real
operator export has been supplied or evaluated.

The agreed operator adapter must produce `observed-availability-v1` JSON after reconciling
identities, cohort effectivity, revisions, clocks and authoritative state definitions. The
contract is `AvailabilityExport` in
`backend/src/fleet_maintenance/science/fleet/observed_availability.py`. It is separate from demo
`/telemetry`; never infer an available state from health scores, alerts or work completion.

## Export contract

- `evidence_kind`: `synthetic_fixture` or `operator_export`. This supplied label does not
  authenticate data or establish permission to use it.
- `source_reference`: approved authoritative state-export reference; no credentials.
- `frozen_protocol_reference`: versioned population, exclusions, state/metric definitions and
  observation-window protocol agreed before evaluation.
- `window_start`, `window_end`: timezone-aware timestamps compared as actual instants.
- `memberships`: eligible intervals with `aircraft_id`, `start`, nullable `end`.
- `states`: intervals with `source_event_id`, `aircraft_id`, `start`, nullable `end`, and
  `state` (`available`, `unavailable`, `unknown`). Intervals are half-open; open ends are censored
  at the cutoff. Membership gaps are excluded, not counted as aircraft downtime.

Event IDs must be unique across the export; namespace upstream IDs when combining systems.
Identical redelivery has one effect. Conflicting content with the same ID is rejected; retain
correction ancestry upstream and supply a reconciled export. Undeclared aircraft, overlapping
membership, invalid clocks/states and conflicting eligible states reject the calculation.
Same-state overlaps are unioned, so overlapping maintenance does not double aircraft downtime.
Records outside the eligible window/membership contribute no exposure.

Missing and explicit-unknown time stays unknown. Known-state availability is available hours /
known eligible hours, or null when no state is known. Bounds divide available hours and
available-plus-unknown hours by *all* eligible hours. Overall metrics weight aircraft by hours,
not mean aircraft percentages. Every row reports unknown hours/fraction.

No causal effect, p-value, safety conclusion, prediction qualification or geometry verification
is inferred. Actual impact still needs the prospective design, sample-size justification,
confounders, outcome records and independent review in [operational evaluation](operational-evaluation.md).

## Commands

Use the existing backend test environment (Python 3.13 and locked dependencies):

```sh
docker build --target test -t fleet-maintenance-test backend
docker run --rm -v "$PWD:/workspace" -w /workspace \
  -e PYTHONPATH=/workspace/backend/src fleet-maintenance-test \
  python scripts/evaluate_observed_availability.py \
  --input docs/pilot/templates/availability-export.synthetic.json \
  --output artifacts/pilot/availability-synthetic-reference.json
docker run --rm -v "$PWD:/workspace" -w /workspace \
  -e PYTHONPATH=/workspace/backend/src fleet-maintenance-test \
  python scripts/check_pilot_handover.py \
  --manifest docs/pilot/templates/pilot-manifest.example.json \
  --output artifacts/pilot/handover-gaps.json
```

The blank handover intentionally **exits 2**, listing missing/unresolved fields. Exit 0 means
field completeness only. The checker verifies the authored required-field inventory, not the
engineering validity, authenticity or permission behind supplied values. Every output explicitly
says it establishes no qualification; a complete manifest is not an operational release.

The authored synthetic reference has 18 eligible aircraft-hours: 8 available, 6 unavailable,
4 unknown. Known-state availability is 8/14; bounds are 8/18 and 12/18. These hand-calculated
references are not operational measurements or savings. Outputs retain source-file,
canonical-input and implementation hashes. Keep restricted inputs/outputs outside Git in approved
storage; ignored `artifacts/` is not a security boundary.

## Outstanding evidence

| Outcome | Required evidence | Current status |
|---|---|---|
| Real aircraft connection | Approved protocol/sample, identities/units/clocks, service and environment access | Not supplied; no field connector implemented |
| Qualified prediction | Component-specific labels/regimes, frozen criteria, independent model/calibration/alert results, engineering review | Not established; FD001 remains simulated |
| Verified geometry | Permitted drawings/assets, configuration/dimensions, installation mapping, tolerances, engineer review | Not supplied; five models remain illustrative |
| Operational benefit | Authoritative state exports, prospective baseline/design, follow-up, confounders, independent review | No operational study; evaluator checked on synthetic references only |
