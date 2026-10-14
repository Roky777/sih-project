# Measuring operational availability impact

Status: prospective evaluation design to agree with an operator. No real-fleet effect, pilot
permission, minimum sample size or guaranteed improvement is established by this document.

## Phase A — shadow evaluation

Use a bounded approved population. Ingest representative records without controlling aircraft or
changing mandatory maintenance. The existing authorised process remains authoritative. Capture
recommendations, uncertainty, proposed schedules, blockers, reviewer interpretation and what actually
happened. Agree whether users see shadow recommendations; seeing them can itself affect behavior.

Check data reconciliation, assessment eligibility, alert burden, planning feasibility, permitted
access, real workload and recovery. Stop or restrict the evaluation if identity/time/unit errors,
unsupported predictions, lost audit, access failures or misleading clearance behavior occur.
Assign who may stop, investigate and resume; a software status cannot approve continued operation.

## Phase B — separately authorised prospective decision support

After shadow acceptance, use a design agreed by operational and evaluation owners. Where permissible,
choose a controlled comparison or staggered rollout; otherwise use a documented observational design
and limit causal claims. Every actual action remains a human-approved maintenance decision under the
operator's procedures. Never delay mandatory work or introduce faults to make a comparison.

Freeze the population, eligible intervals, primary metric, baseline, candidate policy, observation
horizon, criteria, sample-size justification, analysis and stopping rules before final evaluation.
Preserve worse outcomes, withdrawals and incomplete follow-up. Do not select only successful tails.

## Metrics and denominators

| Metric | Definition and source |
|---|---|
| Observed availability | Authoritatively recorded available aircraft-hours / eligible aircraft-hours with known state. Membership/exclusion rules frozen first; report unknown hours and missing-state fraction beside the result. Also show bounds treating unknown eligible time as unavailable vs available to expose missing-data sensitivity. |
| Downtime | Union of recorded unavailable intervals per aircraft, clipped to membership and observation window; overlapping tasks count once. Open events are censored at the cutoff, not treated as completed. |
| Parts waiting | Recorded task waiting intervals supported by a part-unavailable blocker; distinguish expected delivery, actual receipt and reservation. |
| Resource waiting | Recorded qualified-crew/bay/tool unavailable intervals. Overlapping blockers may be simultaneous; do not add them as independent downtime savings. |
| Deadline compliance | Due tasks completed/verified by their applicable mandatory deadline / eligible due tasks. Report open overdue and unknown completion separately. |
| Alert usefulness | Confirmed-event misses, actionable false episodes, lead time and review burden under the frozen episode definition. |
| System/user performance | Agreed p95/p99 interactions/API/queue times, error/loss rates, eligibility/withholding and role-specific task completion on declared hardware/workload. |

No available-state event may be manufactured from a high health index, a cleared alert, a simulation,
or the app's recorded work completion. Use the operator's authoritative state source and authority.

## Fair baseline and attribution

For saved-plan replay, use identical work releases/durations/deadlines, fleet membership, horizon,
resource calendars/qualifications, stock/arrival assumptions and fixed commitments. Change one named
factor at a time where possible. These remain projected comparisons, even when inputs are real.

For actual outcomes, record and account for utilisation, workload/severity, fleet configuration,
season/regime, backlog, stock/expedited supply, staffing/bay capacity, maintenance-policy changes,
other interventions and data completeness. Comparable before/after periods alone do not establish
causality. Evaluation owners select the design and uncertainty analysis suitable to clustering,
rare events, repeated observations and available sample support.

Keep contribution claims separate:

- **Integration:** reconciled records, data latency, less missing/duplicate information, review effort.
- **Prediction:** independently measured warning usefulness beyond the agreed baseline.
- **Scheduling:** policy difference on matched constrained inputs, plus observed results if authorised.
- **Supply:** difference attributable to availability/receipt changes, separate from scheduling.
- **Overall operation:** observed outcome under the accepted evaluation design, including confounders
  and uncertainty; never sum overlapping waiting/scheduling/prediction benefits.

## Minimum retained evidence

Manifest and approved versions; eligible cohort/membership; source state/events with acquisition and
receipt times; immutable observation and model cutoffs; recommendation/review/approval timestamps;
input/plan hashes; task/resource/stock constraints and revisions; actual start/receipt/verification/
authoritative availability events; unknown/censored intervals; audit and failure records; workload,
comparison design, analysis code/environment and outputs; operator/evaluation decisions.

## Acceptance review

The review must answer: were data and scope valid; did all hard constraints remain authoritative;
were thresholds and metrics frozen; are benefits projected, associated or supported causally; what
uncertainty and poor outcomes remain; did intended users understand the evidence; are security,
recovery and monitoring acceptable in the actual environment? Record accept/restrict/reject with
signed references. Leave the gate pending where evidence is missing.

The current four-aircraft synthetic study and single-aircraft parts example are demonstration
references only. Their 32-hour scheduling and 24-hour supply differences are not pilot targets or
real-world savings. See [study assumptions](../research/availability_study.md).
