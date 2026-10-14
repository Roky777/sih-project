"""Reproduce the frozen synthetic study using shared scientific application code."""

import argparse
import json
from pathlib import Path

from fleet_maintenance.verification.availability_study import run_study


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = run_study()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(
        json.dumps(
            {
                "version": result["version"],
                "input_sha256": result["input_sha256"],
                "cases": [
                    {"name": row["name"], "status": row["solver"]["status"]}
                    for row in result["cases"]
                ],
            }
        )
    )


if __name__ == "__main__":
    main()
