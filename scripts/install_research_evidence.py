"""Install validated JSON research reports without loading or promoting model weights."""
import argparse
from pathlib import Path

from fleet_maintenance.services.research_evidence import install_reports
from fleet_maintenance.settings import get_settings


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    args = parser.parse_args()
    install_reports(args.source, get_settings().artifact_root)
    print("Verified JSON research evidence installed. Serving model unchanged.")


if __name__ == "__main__":
    main()
