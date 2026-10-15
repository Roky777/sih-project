"""Read-only evidence audit; no model promotion or aircraft qualification."""

import argparse
import json
from pathlib import Path

from fleet_maintenance.artifacts.qualification import (
    QualificationBundle,
    audit_qualification,
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--evidence-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    bundle = QualificationBundle.model_validate_json(args.manifest.read_bytes())
    output = args.output.resolve()
    protected = [args.manifest.resolve(), *(
        (args.evidence_root / artifact.relative_path).resolve() for artifact in bundle.artifacts
    )]
    if output in protected:
        parser.error("Output must not overwrite source evidence")
    report = audit_qualification(bundle, args.evidence_root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(report.model_dump_json(indent=2) + "\n")
    print(json.dumps({"kind": report.kind, "issues": report.issues,
                      "evidence_bindings_complete": report.evidence_bindings_complete}))
    raise SystemExit(0 if report.evidence_bindings_complete else 2)


if __name__ == "__main__":
    main()
