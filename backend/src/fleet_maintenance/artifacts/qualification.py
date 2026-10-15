"""Verify local evidence bindings without granting scientific/engineering approval."""

import hashlib
from pathlib import Path
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class EvidenceArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    role: str = Field(min_length=1, pattern=r"\S")
    relative_path: str = Field(min_length=1, pattern=r"\S")
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class QualificationBundle(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    schema_version: Literal["qualification-evidence-v1"]
    kind: Literal["prediction_model", "visual_geometry"]
    evidence_kind: Literal["synthetic_fixture", "operator_evidence"]
    support_scope: dict[str, str | None]
    criteria_frozen_at: AwareDatetime | None = None
    evaluation_started_at: AwareDatetime | None = None
    reviewer_reference: str | None = None
    decision_reference: str | None = None
    declared_decision: Literal["pending", "accept", "restrict", "reject"] = "pending"
    partitions: dict[str, tuple[str, ...]] = Field(default_factory=dict)
    artifacts: tuple[EvidenceArtifact, ...] = ()


REQUIRED_ARTIFACTS = {
    "prediction_model": {
        "weights", "transform", "calibration", "data_permission", "label_audit",
        "frozen_criteria", "evaluation_results", "robustness_results", "alert_results",
        "independent_review",
    },
    "visual_geometry": {
        "geometry", "geometry_permission", "source_drawings", "installation_mapping",
        "frozen_criteria", "dimensional_checks", "selection_identity_checks",
        "independent_review",
    },
}
REQUIRED_SCOPE = {
    "prediction_model": {
        "aircraft_configuration", "component_family", "signals_units_reference",
        "operating_regimes_reference", "prediction_target_and_unit", "label_definition_reference",
        "historical_inspection_disclosure", "support_exclusions", "monitoring_rollback_reference",
    },
    "visual_geometry": {
        "aircraft_configuration", "configuration_revision", "units_axes_reference",
        "installation_effectivity_reference", "dimensions_tolerance_reference",
        "mesh_component_mapping_reference", "support_exclusions",
    },
}


class QualificationAudit(BaseModel):
    kind: str
    evidence_kind: str
    manifest_sha256: str
    issues: tuple[str, ...]
    evidence_bindings_complete: bool
    operational_qualification_established: bool = False
    limits: str = (
        "Hashes bind local bytes; they do not authenticate permissions, reviewers or scientific "
        "validity. This audit never promotes a model, verifies an actual installation, validates "
        "a physical twin or grants operational qualification. Review evidence independently."
    )


def audit_qualification(bundle: QualificationBundle, evidence_root: Path) -> QualificationAudit:
    root = evidence_root.resolve(strict=True)
    issues = []
    if bundle.evidence_kind != "operator_evidence":
        issues.append("synthetic_evidence_is_not_operator_qualification")
    for key in sorted(REQUIRED_SCOPE[bundle.kind]):
        if not (bundle.support_scope.get(key) or "").strip():
            issues.append(f"missing_scope:{key}")
    if bundle.criteria_frozen_at is None or bundle.evaluation_started_at is None:
        issues.append("missing_freeze_or_evaluation_timestamp")
    elif bundle.criteria_frozen_at >= bundle.evaluation_started_at:
        issues.append("criteria_not_frozen_before_evaluation")
    for name in ("reviewer_reference", "decision_reference"):
        if not (getattr(bundle, name) or "").strip():
            issues.append(f"missing:{name}")
    if bundle.declared_decision not in {"accept", "restrict"}:
        issues.append(f"declared_decision:{bundle.declared_decision}")

    roles: set[str] = set()
    for artifact in bundle.artifacts:
        if artifact.role in roles:
            issues.append(f"duplicate_artifact_role:{artifact.role}")
        roles.add(artifact.role)
        candidate = Path(artifact.relative_path)
        path = (root / candidate).resolve()
        if candidate.is_absolute() or not path.is_relative_to(root):
            issues.append(f"artifact_outside_evidence_root:{artifact.role}")
            continue
        if not path.is_file():
            issues.append(f"artifact_unreadable:{artifact.role}")
            continue
        try:
            with path.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
        except OSError:
            issues.append(f"artifact_unreadable:{artifact.role}")
            continue
        if digest != artifact.sha256:
            issues.append(f"artifact_hash_mismatch:{artifact.role}")
    for role in sorted(REQUIRED_ARTIFACTS[bundle.kind] - roles):
        issues.append(f"missing_artifact_role:{role}")

    if bundle.kind == "prediction_model":
        seen: set[str] = set()
        for name in ("fit", "validation", "calibration", "independent_evaluation"):
            assets = bundle.partitions.get(name, ())
            if not assets or any(not asset.strip() for asset in assets):
                issues.append(f"missing_or_invalid_asset_partition:{name}")
            if len(set(assets)) != len(assets):
                issues.append(f"duplicate_asset_in_partition:{name}")
            if seen.intersection(assets):
                issues.append(f"asset_leakage_across_partitions:{name}")
            seen.update(assets)
        if set(bundle.partitions) - {"fit", "validation", "calibration", "independent_evaluation"}:
            issues.append("unrecognised_partition")
    return QualificationAudit(
        kind=bundle.kind,
        evidence_kind=bundle.evidence_kind,
        manifest_sha256=hashlib.sha256(bundle.model_dump_json().encode()).hexdigest(),
        issues=tuple(issues),
        evidence_bindings_complete=not issues,
    )
