"""Read hash-bound research reports; never import weights or create fleet records."""

import hashlib
from pathlib import Path

from fleet_maintenance.domain.contracts.research import (
    DrawingEvidence,
    ResearchCatalog,
    ResearchIndex,
    ResearchReport,
    ResearchSummary,
    Subset,
)


class ResearchEvidenceUnavailable(ValueError):
    pass


def load_report(root: Path, subset: Subset) -> ResearchReport:
    directory = root / "research/multidataset-v1"
    try:
        catalog = ResearchCatalog.model_validate_json((directory / "catalog.json").read_bytes())
        path = directory / subset / "report.json"
        if subset not in catalog.reports or path.stat().st_size > 8 * 1024 * 1024:
            raise ValueError("Missing or oversized research report")
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != catalog.reports[subset]:
            raise ValueError("Research report hash mismatch")
        report = ResearchReport.model_validate_json(raw)
        if report.subset != subset:
            raise ValueError("Research report identity/count mismatch")
        return report
    except (OSError, ValueError) as exc:
        raise ResearchEvidenceUnavailable(
            "Verified research evidence is unavailable; install the evaluated report bundle. "
            "No metrics or predictions have been substituted."
        ) from exc


def load_index(root: Path) -> ResearchIndex:
    subsets: tuple[Subset, ...] = ("FD001", "FD002", "FD003", "FD004")
    reports = [load_report(root, subset) for subset in subsets]
    return ResearchIndex(
        version="cmapss-multisubset-research-v1",
        summaries=[ResearchSummary.model_validate(report.model_dump(exclude={"engines"}))
                   for report in reports],
    )


def drawing_register() -> list[DrawingEvidence]:
    return [DrawingEvidence(
        model_family=family, component_reference="ENG-CMP (catalogue assembly, not installation)",
        mapping_reference=f"apps/web/src/features/ops/airframes.ts:{family} illustrative layout",
    ) for family in ("lca", "ajt", "mta", "mki", "alh")]


def install_reports(source: Path, root: Path) -> None:
    """Validate a JSON-only bundle in staging, then publish without replacing old evidence."""
    import shutil
    import tempfile

    parent = root / "research"
    parent.mkdir(parents=True, exist_ok=True)
    destination = parent / "multidataset-v1"
    with tempfile.TemporaryDirectory(dir=parent, prefix=".research-stage-") as temporary:
        stage_root = Path(temporary)
        stage = stage_root / "research/multidataset-v1"
        stage.mkdir(parents=True)
        shutil.copyfile(source / "catalog.json", stage / "catalog.json")
        for subset in ("FD001", "FD002", "FD003", "FD004"):
            (stage / subset).mkdir()
            shutil.copyfile(source / subset / "report.json", stage / subset / "report.json")
        load_index(stage_root)
        if destination.exists():
            if (destination / "catalog.json").read_bytes() != (stage / "catalog.json").read_bytes():
                raise ValueError("Refusing to overwrite a different installed research version")
            load_index(root)
            return
        stage.rename(destination)
