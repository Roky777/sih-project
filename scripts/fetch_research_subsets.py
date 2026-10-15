"""Acquire additional official simulated subsets without changing historical FD001 files."""

import argparse
import json
from pathlib import Path

from fleet_maintenance.science.data.acquisition import acquire_cmapss


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, default=Path("data/raw/cmapss"))
    parser.add_argument("--subsets", nargs="+", choices=("FD002", "FD003", "FD004"),
                        default=["FD002", "FD003", "FD004"])
    args = parser.parse_args()
    print(json.dumps(acquire_cmapss(args.destination, tuple(args.subsets)), indent=2))


if __name__ == "__main__":
    main()
