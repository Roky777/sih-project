"""Offline, read-only evaluation of an approved canonical state export."""

import argparse
import hashlib
import json
from pathlib import Path

from fleet_maintenance.science.fleet import observed_availability


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        parser.error("Output must not overwrite source evidence")
    raw = args.input.read_bytes()
    source = observed_availability.AvailabilityExport.model_validate_json(raw)
    report = observed_availability.measure_availability(source).model_dump(mode="json")
    report["source_file_sha256"] = hashlib.sha256(raw).hexdigest()
    module = Path(observed_availability.__file__)
    report["implementation_sha256"] = hashlib.sha256(module.read_bytes()).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"evidence_kind": report["evidence_kind"], "overall": report["overall"]}))


if __name__ == "__main__":
    main()
