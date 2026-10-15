import argparse
import json
from dataclasses import asdict
from pathlib import Path

import yaml
from fleet_maintenance.science.simulation.environment import ScenarioInput
from fleet_maintenance.science.simulation.metrics import summarize
from fleet_maintenance.science.simulation.policies import compare
from fleet_maintenance.science.simulation.replications import run_scenario


def main() -> None:
    parser = argparse.ArgumentParser(description="Run matched deterministic reference scenarios.")
    parser.add_argument("--config", type=Path, default=Path("configs/simulation.yaml"))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    config = yaml.safe_load(args.config.read_text())
    horizon = float(config["default_horizon_hours"])
    seed = int(config["default_seed"])
    replications = int(config["replications"])
    if replications <= 0:
        raise ValueError("Replications must be positive.")
    events = ((2.0, 3.0), (4.0, 2.0))
    baseline_input = ScenarioInput(horizon, 2, 1, events)
    candidate_input = ScenarioInput(horizon, 2, 2, events)
    baseline_runs = tuple(
        run_scenario(baseline_input, seed + index) for index in range(replications)
    )
    candidate_runs = tuple(
        run_scenario(candidate_input, seed + index) for index in range(replications)
    )
    baseline = summarize(baseline_runs)
    candidate = summarize(candidate_runs)
    comparison = compare(baseline_input, baseline, candidate_input, candidate)
    payload = {
        "version": config["version"],
        "status": config["status"],
        "availability_definition": config["availability_definition"],
        "time_unit": config["time_unit"],
        "baseline_input": asdict(baseline_input),
        "candidate_input": asdict(candidate_input),
        "baseline_runs": [asdict(result) for result in baseline_runs],
        "candidate_runs": [asdict(result) for result in candidate_runs],
        "comparison": asdict(comparison),
        "label": "synthetic deterministic projection",
    }
    encoded = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded)
    print(encoded, end="")


if __name__ == "__main__":
    main()
