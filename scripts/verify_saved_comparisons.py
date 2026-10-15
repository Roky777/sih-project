"""Read-only reproduction of saved supported scenario/plan comparisons."""

import argparse
import json
from pathlib import Path

from fleet_maintenance.persistence.database import SessionLocal
from fleet_maintenance.persistence.models import Plan, SimulationRun
from fleet_maintenance.science.simulation.replications import run_scenario
from fleet_maintenance.services.plan_simulation import calculate, plan_payload
from fleet_maintenance.services.scenarios import scenario_source
from sqlalchemy import select


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    rows = []
    with SessionLocal() as session:
        for record in session.scalars(select(SimulationRun).order_by(SimulationRun.id)):
            if not record.metrics.get("plan_id"):
                # Legacy runs without retained assumption/version metadata cannot establish
                # snapshot identity; do not reproduce them from mutable current scenarios.
                assumptions = record.metrics.get("assumptions")
                if not isinstance(assumptions, dict):
                    rows.append(
                        {
                            "run_id": record.id,
                            "state": "unsupported",
                            "reason": "Legacy run has no retained assumption snapshot",
                        }
                    )
                    continue
                try:
                    result = run_scenario(scenario_source(assumptions))
                    actual = {
                        "downtime_aircraft_hours": result.downtime_aircraft_hours,
                        "queue_wait_hours": result.queue_wait_hours,
                        "part_wait_hours": result.part_wait_hours,
                        "completed_events": result.completed_events,
                    }
                    keys = set(actual) & set(record.metrics)
                    matched = record.availability == result.availability and all(
                        record.metrics[k] == actual[k] for k in keys
                    )
                    rows.append(
                        {
                            "run_id": record.id,
                            "state": "matched" if matched else "mismatch",
                            "family": "scenario",
                            "outcomes": actual,
                        }
                    )
                except (ValueError, KeyError, TypeError) as exc:
                    rows.append({"run_id": record.id, "state": "unsupported", "reason": str(exc)})
                continue
            row = {"run_id": record.id, "state": "unsupported"}
            try:
                plan = session.get(Plan, str(record.metrics["plan_id"]))
                if plan is None:
                    raise ValueError("Saved plan not available")
                payload = plan_payload(plan)
                reproduced = calculate(payload)
                expected = record.metrics.get("cases")

                # Timing, labels and newly added explanatory fields are not numerical outcomes.
                def outcomes(cases):
                    return [
                        {
                            "name": c["name"],
                            **{
                                policy: None
                                if c.get(policy) is None
                                else {
                                    key: c[policy][key]
                                    for key in (
                                        "availability",
                                        "downtime_aircraft_hours",
                                        "resource_wait_hours",
                                        "late_tasks",
                                    )
                                }
                                for policy in ("actual", "baseline")
                            },
                        }
                        for c in cases
                    ]

                same = outcomes(expected) == outcomes(reproduced["cases"])
                row.update(
                    state="matched" if same else "mismatch",
                    plan_id=plan.id,
                    plan_sha256=payload["plan_sha256"],
                    outcomes=outcomes(reproduced["cases"]),
                )
            except (ValueError, KeyError, TypeError) as exc:
                row["reason"] = str(exc)
            rows.append(row)
        session.rollback()
    report = {
        "scope": (
            "Saved exact-plan and assumption-snapshot scenarios; "
            "legacy runs without snapshots are unsupported."
        ),
        "total": len(rows),
        "matched": sum(r["state"] == "matched" for r in rows),
        "mismatched": sum(r["state"] == "mismatch" for r in rows),
        "runs": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "runs"}))


if __name__ == "__main__":
    main()
