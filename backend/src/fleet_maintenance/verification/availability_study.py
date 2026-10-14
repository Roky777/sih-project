"""Frozen synthetic availability study; reuses the real solver and plan simulator."""

import hashlib
import json
from dataclasses import asdict, replace
from pathlib import Path
from typing import Any

from fleet_maintenance.domain.contracts.planning import (
    PartArrivalInput,
    PlanningInput,
    ResourceInput,
    TaskInput,
)
from fleet_maintenance.science.scheduling.solver import solve
from fleet_maintenance.science.simulation.plan_comparison import compare_plan

VERSION = "availability-study-v1"


def definition_hash() -> str:
    root = Path(__file__).resolve().parents[1]
    paths = [
        Path(__file__),
        *sorted((root / "science/scheduling").glob("*.py")),
        *sorted((root / "science/simulation").glob("*.py")),
    ]
    entries = {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths
    }
    return hashlib.sha256(json.dumps(entries, sort_keys=True).encode()).hexdigest()


def study_inputs() -> dict[str, PlanningInput]:
    source = PlanningInput(
        horizon=14,
        tasks=(
            TaskInput("T01-engine-overhaul", 4, 0, 14, "engine", aircraft_id="STUDY-A"),
            TaskInput("T02-inspection", 1, 0, 14, "engine", aircraft_id="STUDY-B"),
            TaskInput(
                "T03-kit-replacement",
                2,
                0,
                14,
                "engine",
                part_id="KIT",
                part_quantity=1,
                aircraft_id="STUDY-C",
            ),
            TaskInput("T04-mandatory-check", 1, 0, 14, "engine", aircraft_id="STUDY-D"),
        ),
        skill_capacity={"engine": 1},
        part_stock={"KIT": 0},
        part_arrivals=(PartArrivalInput("KIT", 4, 1),),
        resources=(
            ResourceInput("qualified-engine-crew", "crew", ("engine",), ((0, 5), (6, 14))),
            ResourceInput("compatible-bay", "bay", ("engine",), ((0, 14),)),
        ),
    )
    return {
        "shared_resources_delayed_supply": source,
        "same_resources_part_ready": replace(source, part_stock={"KIT": 1}, part_arrivals=()),
        "single_task_tie": replace(
            source, tasks=(source.tasks[1],), part_stock={}, part_arrivals=()
        ),
        "impossible_mandatory_deadline": replace(
            source,
            tasks=(
                replace(source.tasks[0], deadline=5),
                replace(
                    source.tasks[0],
                    id="T05-conflicting-deadline",
                    aircraft_id="STUDY-B",
                    deadline=5,
                ),
            ),
            part_stock={},
            part_arrivals=(),
        ),
    }


def _waiting(source: PlanningInput, assignments: list[dict[str, Any]]) -> dict[str, Any]:
    """Task-hours, not aircraft downtime; isolate earliest feasible part readiness."""
    required: dict[str, int] = {}
    parts = 0.0
    other = 0.0
    tasks = {task.id: task for task in source.tasks}
    rows = []
    for assignment in sorted(assignments, key=lambda a: (a["start"], a["task_id"])):
        task = tasks[assignment["task_id"]]
        ready = task.earliest
        if task.part_id:
            required[task.part_id] = required.get(task.part_id, 0) + task.part_quantity
            cumulative = source.part_stock.get(task.part_id, 0)
            for arrival in sorted(source.part_arrivals, key=lambda a: a.slot):
                if cumulative >= required[task.part_id]:
                    break
                if arrival.part_id == task.part_id:
                    cumulative += arrival.quantity
                    ready = max(ready, arrival.slot)
        part_wait = max(0, ready - task.earliest) * source.slot_duration_hours
        remaining = (
            max(0, assignment["start"] - max(task.earliest, ready)) * source.slot_duration_hours
        )
        parts += part_wait
        other += remaining
        rows.append(
            {
                "task_id": task.id,
                "part_readiness_wait_hours": part_wait,
                "other_planned_wait_hours": remaining,
            }
        )
    return {
        "part_readiness_wait_task_hours": parts,
        "other_planned_wait_task_hours": other,
        "by_task": rows,
        "note": "Task-hours are additive per task, not deduplicated aircraft downtime. "
        "Other planned wait includes resource constraints and optimizer placement; it is not "
        "a proven causal resource-only attribution. Overrun resource queueing is separate.",
    }


def run_study() -> dict[str, Any]:
    sources = study_inputs()
    input_json = json.dumps({key: asdict(value) for key, value in sources.items()}, sort_keys=True)
    cases = []
    for name, source in sources.items():
        result = solve(source, time_limit_seconds=3)
        entry: dict[str, Any] = {"name": name, "input": asdict(source), "solver": asdict(result)}
        if result.status in {"optimal", "feasible"}:
            comparison: Any = compare_plan(source, result.assignments)
            entry["comparison"] = comparison
            entry["waiting"] = {
                "proposed": _waiting(source, [asdict(a) for a in result.assignments]),
                "FIFO": _waiting(source, comparison["baseline_assignments"]),
            }
        cases.append(entry)
    return {
        "version": VERSION,
        "definition_sha256": definition_hash(),
        "solver_objective": "union-aircraft-grounding-v3; makespan tie-breaker",
        "label": "synthetic simulated projection",
        "input_sha256": hashlib.sha256(input_json.encode()).hexdigest(),
        "method": "CP-SAT versus earliest-release FIFO, identical inputs within each case; "
        "same plan simulator, 112-hour horizon, 8-hour slots, "
        "declared/25%/50% duration assumptions.",
        "attribution": "Within-case differences compare scheduling. Across the two multi-aircraft "
        "cases only supply readiness changes. No predictive-model improvement is measured.",
        "limits": "Grounding begins at task release; no fitted failure law or maintenance "
        "effectiveness is inferred. No real-fleet benefit, confidence interval or clearance. "
        "A FIFO placement failure is not proof of mathematical infeasibility. "
        "All outcomes, including ties and infeasible scenarios, are retained.",
        "cases": cases,
    }
