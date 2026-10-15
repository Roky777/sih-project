import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from fleet_maintenance.science.data.loaders import load_cmapss_table, load_rul_labels
from fleet_maintenance.science.data.splitting import assert_disjoint, split_engines


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and prepare NASA C-MAPSS FD001.")
    parser.add_argument("--raw", type=Path, default=Path("data/raw/cmapss"))
    parser.add_argument("--output", type=Path, default=Path("data/processed/cmapss_fd001"))
    args = parser.parse_args()
    train_path = args.raw / "train_FD001.txt"
    test_path = args.raw / "test_FD001.txt"
    label_path = args.raw / "RUL_FD001.txt"
    train = load_cmapss_table(train_path, "FD001", "train")
    test = load_cmapss_table(test_path, "FD001", "test")
    test_engine_count = len(np.unique(test.engine_numbers))
    labels = load_rul_labels(label_path, test_engine_count)

    engine_ids = sorted(set(train.identities))
    split = split_engines(engine_ids, seed=26249)
    assert_disjoint(split)
    args.output.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.output / "validated_tables.npz",
        train_engines=train.engine_numbers,
        train_cycles=train.cycles,
        train_features=train.features,
        test_engines=test.engine_numbers,
        test_cycles=test.cycles,
        test_features=test.features,
        test_rul=labels,
    )
    manifest = {
        "dataset": "NASA_CMAPSS_FD001",
        "simulated": True,
        "split_seed": 26249,
        "target_unit": "cycles",
        "target_cap": None,
        "feature_names": list(train.feature_names),
        "rows": {"train": len(train.cycles), "test": len(test.cycles)},
        "engines": {"train": len(engine_ids), "test": test_engine_count},
        "splits": {
            "fit": list(split.fit),
            "validation": list(split.validation),
            "calibration": list(split.calibration),
            "final_test_partition": "NASA_CMAPSS:FD001:test:*",
        },
        "source_sha256": {
            train_path.name: sha256(train_path),
            test_path.name: sha256(test_path),
            label_path.name: sha256(label_path),
        },
    }
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    )
    print(json.dumps(manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
