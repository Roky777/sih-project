"""Run the frozen multi-subset research protocol; preserve the serving-model registry."""

import argparse
import json
import platform
from pathlib import Path

import sklearn  # type: ignore[import-untyped]
from fleet_maintenance.domain.contracts.research import ResearchCatalog
from fleet_maintenance.science.prediction.multidataset import (
    digest,
    evaluate_subset,
    historical_fd001,
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=Path("data/raw/cmapss"))
    parser.add_argument("--config", type=Path, default=Path("configs/multidataset_benchmark.json"))
    parser.add_argument("--output", type=Path, default=Path("artifacts/research/multidataset-v1"))
    parser.add_argument("--source-revision", default="unrecorded")
    parser.add_argument("--historical-fd001", type=Path,
                        default=Path("artifacts/release-v2/official-endpoints.json"))
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    if config["subsets"] != ["FD002", "FD003", "FD004"]:
        parser.error("This frozen protocol evaluates FD002, FD003 and FD004 separately")
    args.output.mkdir(parents=True, exist_ok=False)
    environment = {"python": platform.python_version(), "sklearn": sklearn.__version__,
                   "config_sha256": digest(args.config),
                   "source_revision": args.source_revision,
                   "code_hashes": {str(p): digest(p) for directory in (
                       Path("backend/src/fleet_maintenance/science/data"),
                       Path("backend/src/fleet_maintenance/science/prediction"),
                       Path("backend/src/fleet_maintenance/domain/contracts"),
                   ) for p in sorted(directory.glob("*.py"))}}
    (args.output / "environment.json").write_text(json.dumps(environment, indent=2) + "\n")
    hashes = {}
    for subset in config["subsets"]:
        report = evaluate_subset(args.raw, args.output / subset, subset, config)
        hashes[subset] = digest(args.output / subset / "report.json")
        print(json.dumps({"subset": subset, "metrics": report.capped_primary.model_dump(),
                          "withheld": report.withheld_count}), flush=True)
    historical = historical_fd001(args.raw, args.historical_fd001, config["review_policy_cycles"])
    (args.output / "FD001").mkdir()
    (args.output / "FD001/report.json").write_text(historical.model_dump_json(indent=2) + "\n")
    hashes["FD001"] = digest(args.output / "FD001/report.json")
    catalog = ResearchCatalog(version=config["version"], reports=hashes)
    (args.output / "catalog.json").write_text(catalog.model_dump_json(indent=2) + "\n")
    print("All subset results retained; no serving model was promoted.", flush=True)


if __name__ == "__main__":
    main()
