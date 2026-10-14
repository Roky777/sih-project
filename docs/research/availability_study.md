# Reproducible availability study

The optional Analysis → Availability study tab runs frozen synthetic cases through the existing
CP-SAT planner and actual-plan SimPy simulator. Work executes as an `availability_study` job through
the transactional outbox/worker lifecycle. Saved job IDs reopen inputs/results; JSON exports retain
input hash, assignments, stress assumptions and event traces. No live work or stock is committed.

## Scheduling objective

`grounding-cpsat-v3` minimises aircraft grounding, using the simulator's exact definition: each task
makes its represented aircraft unavailable from task release through completion. Union overlapping
intervals once per aircraft. Time-indexed Boolean variables represent this union in integer slots.
A lexicographic objective then minimises makespan: `grounding_slots * (horizon + 1) + makespan`.
The reported objective/bound is this composite score, not hours or a cost. Convert grounding slots
to hours using the saved slot duration. All deadlines, parts, skills, calendars and commitments
remain hard constraints; usable output is independently validated. Saved older plans keep their
original snapshots and objective meaning. New configuration fingerprints prevent stale approval.

The previous makespan objective could finish all jobs early while leaving several aircraft waiting.
The new objective is aligned with the declared availability metric, not with an inferred failure law.

## Comparison design

Four-aircraft work competes for one qualified crew and compatible bay, with a crew closure, a
required kit and mandatory deadlines. Compare against earliest-release FIFO using identical inputs
within each case. A second case changes only kit readiness. Retain a single-task tie and an impossible
shared-deadline case. Duration multipliers 1/1.25/1.5 are deterministic stress assumptions, not
probabilistic confidence intervals. Infeasible/invalid/unknown and FIFO placement failure remain
distinct; no benefit is calculated without usable comparable schedules.

Availability is `1 - grounded_aircraft_hours / (represented_aircraft * horizon_hours)`. Task-level
part-readiness and other planned waiting are separate from union aircraft downtime. The latter
includes solver placement and constraints; it is not falsely attributed solely to resource queueing.
Overrun resource queue wait and deadline/calendar violations are reported separately.

The study measures scheduling and supply effects. It does not measure the predictive model's
contribution, real maintenance effectiveness, actual fleet improvement or aircraft clearance.

## Reproduction

Use the installed shared application and science dependencies:

`python scripts/evaluate_availability_study.py --output artifacts/availability-study/report.json`

`python scripts/verify_saved_comparisons.py --output artifacts/availability-study/saved-check.json`

The second command is read-only and refuses to call legacy runs without retained assumption snapshots
reproducible. Preserve unsupported/mismatched results. The live application's database can differ
from the historical release ledger; absent evidence is not counted as a passed reproduction.
