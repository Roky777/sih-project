import argparse
import json
import time
from collections.abc import Callable
from pathlib import Path

import yaml
from fleet_maintenance.science.scheduling.baselines import earliest_deadline_first
from fleet_maintenance.science.scheduling.diagnostics import result_summary
from fleet_maintenance.science.scheduling.formulation import (
    PlanningInput,
    PlanningResult,
    TaskInput,
)
from fleet_maintenance.science.scheduling.solver import solve


def reference_instances(horizon: int) -> dict[str, PlanningInput]:
    return {
        "serial_engine_work": PlanningInput(
            horizon,
            (
                TaskInput("inspect-a", 3, 0, 8, "engine", "kit", 1),
                TaskInput("replace-b", 2, 1, 10, "engine", "filter", 1),
                TaskInput("verify-a", 1, 0, 12, "engine", predecessors=("inspect-a",)),
            ),
            {"engine": 1},
            {"kit": 1, "filter": 1},
        ),
        "parallel_capacity": PlanningInput(
            horizon,
            (
                TaskInput("inspect-a", 3, 0, 8, "engine"),
                TaskInput("inspect-b", 3, 0, 8, "engine"),
                TaskInput("fixed", 2, 0, 10, "engine", fixed_start=4),
            ),
            {"engine": 2},
            {},
        ),
    }


def timed(
    function: Callable[[PlanningInput], PlanningResult],
    source: PlanningInput,
    repetitions: int,
) -> tuple[PlanningResult, list[float]]:
    durations: list[float] = []
    result = None
    for _ in range(repetitions):
        started = time.perf_counter()
        result = function(source)
        durations.append((time.perf_counter() - started) * 1000.0)
    assert result is not None
    return result, durations


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark planner and EDF baseline.")
    parser.add_argument("--config", type=Path, default=Path("configs/scheduling.yaml"))
    parser.add_argument("--repetitions", type=int, default=5)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.repetitions <= 0:
        raise ValueError("Repetitions must be positive.")
    config = yaml.safe_load(args.config.read_text())
    payload: dict[str, object] = {
        "configuration": str(args.config),
        "repetitions": args.repetitions,
        "instances": {},
    }
    instances: dict[str, object] = {}
    for name, source in reference_instances(int(config["horizon_slots"])).items():
        optimized, optimized_ms = timed(
            lambda value: solve(value, float(config["solver_time_limit_seconds"])),
            source,
            args.repetitions,
        )
        baseline, baseline_ms = timed(earliest_deadline_first, source, args.repetitions)
        instances[name] = {
            "optimizer": {
                **result_summary(source, optimized),
                "objective_definition": "union grounding slots * (horizon + 1) + makespan",
                "runtime_ms": optimized_ms,
            },
            "earliest_deadline_first": {
                **result_summary(source, baseline),
                "objective_definition": "legacy makespan score; raw objectives are not comparable",
                "runtime_ms": baseline_ms,
            },
        }
    payload["instances"] = instances
    encoded = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded)
    print(encoded, end="")


if __name__ == "__main__":
    main()
