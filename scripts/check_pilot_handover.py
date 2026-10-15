"""Report missing handover fields; completeness is not operator qualification."""

import argparse
import hashlib
import json
from pathlib import Path

from fleet_maintenance.verification.pilot_handover import check_handover


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.manifest.resolve() == args.output.resolve():
        parser.error("Output must not overwrite the manifest")
    raw = args.manifest.read_bytes()
    manifest = json.loads(raw)
    # Compare with the authored contract; a sparse {} cannot pass a completeness check.
    template_path = Path(__file__).resolve().parents[1] / (
        "docs/pilot/templates/pilot-manifest.example.json"
    )
    template = json.loads(template_path.read_bytes())
    if not isinstance(manifest, dict) or manifest.get("schema_version") != template["schema_version"]:
        parser.error("Unsupported pilot manifest schema")

    report = {
        "manifest_sha256": hashlib.sha256(raw).hexdigest(),
        **check_handover(manifest, template),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))
    raise SystemExit(0 if report["handover_complete"] else 2)


if __name__ == "__main__":
    main()
