import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

import yaml
from fleet_maintenance.science.alerts.evaluation import (
    AlertHistory,
    AlertObservation,
    evaluate_policy,
)
from fleet_maintenance.services.alert_policy import AlertPolicy


def reference_histories() -> tuple[AlertHistory, ...]:
    return (
        AlertHistory(
            "jitter-before-event",
            (
                AlertObservation("j-1", 40, 60),
                AlertObservation("j-2", 55, 44),
                AlertObservation("j-3", 60, 47),
                AlertObservation("j-4", 65, 44),
                AlertObservation("j-5", 70, 48),
                AlertObservation("j-6", 80, 19),
            ),
            100,
        ),
        AlertHistory(
            "steady-before-event",
            (
                AlertObservation("s-1", 20, 70),
                AlertObservation("s-2", 35, 44),
                AlertObservation("s-3", 50, 30),
                AlertObservation("s-4", 65, 19),
            ),
            80,
        ),
        AlertHistory(
            "transient-without-event",
            (
                AlertObservation("t-1", 10, 60),
                AlertObservation("t-2", 20, 44),
                AlertObservation("t-3", 25, 50),
                AlertObservation("t-4", 30, 54),
            ),
            None,
        ),
        AlertHistory(
            "withheld-and-repeated",
            (
                AlertObservation("w-1", 40, 60),
                AlertObservation("w-2", 55, 44),
                AlertObservation("w-2", 55, 44),
                AlertObservation("w-3", 60, None, "withheld"),
                AlertObservation("w-4", 65, 50),
                AlertObservation("w-5", 70, 44),
            ),
            100,
        ),
        AlertHistory(
            "missed-event",
            (
                AlertObservation("m-1", 25, 70),
                AlertObservation("m-2", 45, 60),
                AlertObservation("m-3", 65, 55),
            ),
            70,
        ),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare threshold and hysteresis alert policies.")
    parser.add_argument("--config", type=Path, default=Path("configs/alert_policy.yaml"))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    config: dict[str, Any] = yaml.safe_load(args.config.read_text())
    policy = AlertPolicy(
        warning_cycles=float(config["warning_cycles"]),
        critical_cycles=float(config["critical_cycles"]),
        clear_margin_cycles=float(config["clear_margin_cycles"]),
        version=str(config["version"]),
    )
    warning_horizon = int(config["evaluation"]["warning_horizon_cycles"])
    histories = reference_histories()
    baseline = evaluate_policy(
        histories, policy, warning_horizon_cycles=warning_horizon, hysteresis=False
    )
    candidate = evaluate_policy(
        histories, policy, warning_horizon_cycles=warning_horizon, hysteresis=True
    )
    payload = {
        "version": config["version"],
        "status": config["status"],
        "configuration": str(args.config),
        "definitions": config["evaluation"],
        "history_count": len(histories),
        "threshold_baseline": asdict(baseline),
        "hysteresis_candidate": asdict(candidate),
        "comparison": {
            "missed_event_delta": candidate.missed_events - baseline.missed_events,
            "false_alert_episode_delta": (
                candidate.false_alert_episodes - baseline.false_alert_episodes
            ),
            "recommendation_change_delta": (
                candidate.recommendation_changes - baseline.recommendation_changes
            ),
        },
        "acceptance_status": "not_evaluated_budgets_unfrozen",
        "label": "synthetic validation histories",
    }
    encoded = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded)
    print(encoded, end="")


if __name__ == "__main__":
    main()
