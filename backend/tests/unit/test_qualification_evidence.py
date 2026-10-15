import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from pydantic import ValidationError

from fleet_maintenance.artifacts.qualification import (
    REQUIRED_ARTIFACTS,
    REQUIRED_SCOPE,
    EvidenceArtifact,
    QualificationBundle,
    audit_qualification,
)


def package(root: Path, kind: str = "prediction_model") -> QualificationBundle:
    artifacts = []
    for role in sorted(REQUIRED_ARTIFACTS[kind]):
        path = root / f"{role}.txt"
        path.write_text(f"Test-only {role}: not genuine operational evidence")
        artifacts.append(EvidenceArtifact(
            role=role, relative_path=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest()
        ))
    return QualificationBundle.model_validate({
        "schema_version": "qualification-evidence-v1", "kind": kind,
        "evidence_kind": "operator_evidence",
        "support_scope": dict.fromkeys(REQUIRED_SCOPE[kind], "test-reference"),
        "criteria_frozen_at": datetime(2026, 1, 1, tzinfo=UTC),
        "evaluation_started_at": datetime(2026, 1, 2, tzinfo=UTC),
        "reviewer_reference": "test-reviewer", "decision_reference": "test-decision",
        "declared_decision": "restrict", "artifacts": artifacts,
        "partitions": {"fit": ["source:A"], "validation": ["source:B"],
                       "calibration": ["source:C"], "independent_evaluation": ["source:D"]},
    })


@pytest.mark.parametrize("kind", ["prediction_model", "visual_geometry"])
def test_complete_bindings_never_grant_operational_qualification(tmp_path: Path, kind: str) -> None:
    report = audit_qualification(package(tmp_path, kind), tmp_path)
    assert report.evidence_bindings_complete
    assert not report.operational_qualification_established


def test_synthetic_evidence_and_pending_review_cannot_pass(tmp_path: Path) -> None:
    bundle = package(tmp_path).model_copy(update={
        "evidence_kind": "synthetic_fixture", "declared_decision": "pending"
    })
    report = audit_qualification(bundle, tmp_path)
    assert "synthetic_evidence_is_not_operator_qualification" in report.issues
    assert "declared_decision:pending" in report.issues


def test_changed_evidence_bytes_fail_hash_binding(tmp_path: Path) -> None:
    bundle = package(tmp_path)
    (tmp_path / "weights.txt").write_text("replacement bytes")
    assert "artifact_hash_mismatch:weights" in audit_qualification(bundle, tmp_path).issues


def test_missing_evidence_and_scope_do_not_pass(tmp_path: Path) -> None:
    bundle = package(tmp_path, "visual_geometry").model_copy(update={
        "support_scope": {}, "artifacts": (), "reviewer_reference": None,
    })
    report = audit_qualification(bundle, tmp_path)
    assert "missing_artifact_role:installation_mapping" in report.issues
    assert "missing_scope:dimensions_tolerance_reference" in report.issues
    assert "missing:reviewer_reference" in report.issues


@pytest.mark.parametrize("escape", ["../outside", "/private/tmp/outside"])
def test_artifact_paths_cannot_escape_explicit_evidence_root(tmp_path: Path, escape: str) -> None:
    bundle = package(tmp_path)
    changed = bundle.artifacts[0].model_copy(update={"relative_path": escape})
    bundle = bundle.model_copy(update={"artifacts": (changed, *bundle.artifacts[1:])})
    assert any("outside_evidence_root" in x for x in audit_qualification(bundle, tmp_path).issues)


def test_symlink_escape_is_rejected(tmp_path: Path) -> None:
    root = tmp_path / "evidence"
    root.mkdir()
    bundle = package(root)
    outside = tmp_path / "private.txt"
    outside.write_text("test outside root")
    (root / "weights.txt").unlink()
    (root / "weights.txt").symlink_to(outside)
    assert "artifact_outside_evidence_root:weights" in audit_qualification(bundle, root).issues


def test_asset_leakage_and_duplicate_identity_are_flagged(tmp_path: Path) -> None:
    bundle = package(tmp_path).model_copy(update={"partitions": {
        "fit": ("source:A", "source:A"), "validation": ("source:A",),
        "calibration": ("source:C",), "independent_evaluation": ("source:D",),
    }})
    report = audit_qualification(bundle, tmp_path)
    assert "duplicate_asset_in_partition:fit" in report.issues
    assert "asset_leakage_across_partitions:validation" in report.issues


@pytest.mark.parametrize("delay", [0, 1])
def test_criteria_must_precede_evaluation(tmp_path: Path, delay: int) -> None:
    bundle = package(tmp_path)
    assert bundle.evaluation_started_at is not None
    bundle = bundle.model_copy(update={
        "criteria_frozen_at": bundle.evaluation_started_at + timedelta(days=delay)
    })
    assert "criteria_not_frozen_before_evaluation" in audit_qualification(bundle, tmp_path).issues


def test_bad_hash_and_timezone_naive_freeze_are_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        EvidenceArtifact(role="weights", relative_path="x", sha256="not-a-hash")
    data = package(tmp_path).model_dump()
    data["criteria_frozen_at"] = datetime(2026, 1, 1)
    with pytest.raises(ValidationError):
        QualificationBundle.model_validate(data)
