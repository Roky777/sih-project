import argparse
import hashlib
import json
from pathlib import Path

import yaml
from fleet_maintenance.science.data.loaders import load_cmapss_table
from fleet_maintenance.science.data.splitting import EngineSplit
from fleet_maintenance.science.prediction.calibration import calibrate_baseline


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Calibrate the selected validation-v1 model.")
    parser.add_argument("--raw", type=Path, default=Path("data/raw/cmapss"))
    parser.add_argument(
        "--processed-manifest",
        type=Path,
        default=Path("data/processed/cmapss_fd001/manifest.json"),
    )
    parser.add_argument("--artifact-dir", type=Path, default=Path("artifacts/models/baseline-v1"))
    parser.add_argument("--config", type=Path, default=Path("configs/calibration.yaml"))
    args = parser.parse_args()
    manifest = json.loads(args.processed_manifest.read_text())
    split = EngineSplit(
        tuple(manifest["splits"]["fit"]),
        tuple(manifest["splits"]["validation"]),
        tuple(manifest["splits"]["calibration"]),
    )
    table = load_cmapss_table(args.raw / "train_FD001.txt", "FD001", "train")
    config = yaml.safe_load(args.config.read_text())
    result = calibrate_baseline(
        table,
        split,
        args.artifact_dir,
        nominal_coverage=float(config["nominal_coverage"]),
        target_cap=int(config["target_cap_cycles"]),
        minimum_history=int(config["minimum_history_cycles"]),
        window=int(config["feature_window_cycles"]),
        seed=int(config["cutoff_seed"]),
        provenance={
            "configuration_sha256": sha256(args.config),
            "processed_manifest_sha256": sha256(args.processed_manifest),
            "training_source_sha256": manifest["source_sha256"]["train_FD001.txt"],
        },
    )
    print(json.dumps(result.as_dict(), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
