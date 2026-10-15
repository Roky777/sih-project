import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, cast

import yaml
from fleet_maintenance.science.data.loaders import load_cmapss_table
from fleet_maintenance.science.data.robustness import InterventionKind, InterventionSpec
from fleet_maintenance.science.data.splitting import EngineSplit
from fleet_maintenance.science.prediction.inference import BaselinePredictor
from fleet_maintenance.science.prediction.robustness import evaluate_intervention


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate validation-only input robustness.")
    parser.add_argument("--raw", type=Path, default=Path("data/raw/cmapss"))
    parser.add_argument(
        "--processed-manifest",
        type=Path,
        default=Path("data/processed/cmapss_fd001/manifest.json"),
    )
    parser.add_argument("--artifact-dir", type=Path, default=Path("artifacts/models/baseline-v1"))
    parser.add_argument("--config", type=Path, default=Path("configs/robustness.yaml"))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    config: dict[str, Any] = yaml.safe_load(args.config.read_text())
    manifest = json.loads(args.processed_manifest.read_text())
    model_manifest = json.loads((args.artifact_dir / "manifest.json").read_text())
    calibration = json.loads((args.artifact_dir / "calibration.json").read_text())
    split = EngineSplit(
        tuple(manifest["splits"]["fit"]),
        tuple(manifest["splits"]["validation"]),
        tuple(manifest["splits"]["calibration"]),
    )
    table = load_cmapss_table(args.raw / "train_FD001.txt", "FD001", "train")
    predictor = BaselinePredictor.load(args.artifact_dir)
    eligibility = config["eligibility"]
    specs = tuple(
        InterventionSpec(
            name=str(item["name"]),
            kind=cast(InterventionKind, item["kind"]),
            rate=float(item.get("rate", 0.0)),
            length_cycles=int(item.get("length_cycles", 0)),
            feature=item.get("feature"),
            scale=float(item.get("scale", 0.0)),
        )
        for item in config["interventions"]
    )
    results = tuple(
        evaluate_intervention(
            table,
            split,
            predictor,
            spec,
            calibration_quantile=float(calibration["diagnostic"]["residual_quantile_cycles"]),
            target_cap=int(model_manifest["target"]["cap"]),
            minimum_history=int(model_manifest["minimum_history_cycles"]),
            window=int(model_manifest["feature_window_cycles"]),
            seed=int(config["seed"]),
            maximum_missing_fraction=float(eligibility["maximum_missing_fraction_per_window"]),
            maximum_contiguous_missing_cycles=int(
                eligibility["maximum_contiguous_missing_cycles_per_feature"]
            ),
        )
        for spec in specs
    )
    clean = results[0]
    payload = {
        "version": config["version"],
        "status": config["status"],
        "dataset": config["dataset"],
        "seed": config["seed"],
        "imputation": config["imputation"],
        "eligibility": eligibility,
        "acceptance_budgets": config["acceptance_budgets"],
        "configuration_sha256": sha256(args.config),
        "model_artifacts": model_manifest["artifacts"],
        "final_test_evaluated": False,
        "results": [
            {
                **result.as_dict(),
                "mae_degradation_cycles": (
                    None
                    if result.mae_cycles is None or clean.mae_cycles is None
                    else result.mae_cycles - clean.mae_cycles
                ),
            }
            for result in results
        ],
        "acceptance_status": "not_evaluated_budgets_unfrozen",
    }
    encoded = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded)
    print(encoded, end="")


if __name__ == "__main__":
    main()
