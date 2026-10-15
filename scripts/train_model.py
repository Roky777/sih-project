import argparse
import hashlib
import json
from pathlib import Path

import yaml
from fleet_maintenance.science.data.loaders import load_cmapss_table
from fleet_maintenance.science.data.splitting import EngineSplit
from fleet_maintenance.science.prediction.training import train_baseline


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Train validation-only FD001 candidates.")
    parser.add_argument("--raw", type=Path, default=Path("data/raw/cmapss"))
    parser.add_argument(
        "--processed-manifest",
        type=Path,
        default=Path("data/processed/cmapss_fd001/manifest.json"),
    )
    parser.add_argument("--artifact-dir", type=Path)
    parser.add_argument("--candidate", choices=("baseline", "sequence"), default="baseline")
    parser.add_argument("--config", type=Path)
    args = parser.parse_args()
    config_path = args.config or Path(f"configs/prediction_{args.candidate}.yaml")
    config = yaml.safe_load(config_path.read_text())
    manifest = json.loads(args.processed_manifest.read_text())
    split = EngineSplit(
        tuple(manifest["splits"]["fit"]),
        tuple(manifest["splits"]["validation"]),
        tuple(manifest["splits"]["calibration"]),
    )
    table = load_cmapss_table(args.raw / "train_FD001.txt", "FD001", "train")
    artifact_dir = args.artifact_dir or Path(f"artifacts/models/{args.candidate}-v1")
    provenance = {
        "configuration_sha256": sha256(config_path),
        "processed_manifest_sha256": sha256(args.processed_manifest),
        "training_source_sha256": manifest["source_sha256"]["train_FD001.txt"],
    }
    if args.candidate == "baseline":
        result = train_baseline(
            table,
            split,
            artifact_dir,
            target_cap=int(config["target_cap_cycles"]),
            minimum_history=int(config["minimum_history_cycles"]),
            window=int(config["feature_window_cycles"]),
            seed=int(config["model_seed"]),
            provenance=provenance,
        )
    else:
        from fleet_maintenance.science.prediction.sequence_training import (
            train_sequence,
        )

        result = train_sequence(
            table,
            split,
            artifact_dir,
            target_cap=int(config["target_cap_cycles"]),
            window=int(config["window_cycles"]),
            seed=int(config["model_seed"]),
            hidden_size=int(config["hidden_size"]),
            epochs=int(config["epochs"]),
            batch_size=int(config["batch_size"]),
            learning_rate=float(config["learning_rate"]),
            provenance=provenance,
        )
    print(json.dumps(result.artifact_manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
