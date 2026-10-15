"""Research isolation, leakage and evidence-failure checks on explicit synthetic fixtures."""
import hashlib
import json
from pathlib import Path

import numpy as np
import pytest
from pydantic import ValidationError

from fleet_maintenance.domain.contracts.research import ResearchEngine
from fleet_maintenance.science.data.acquisition import ARCHIVE_SHA256, NESTED_SHA256
from fleet_maintenance.science.data.loaders import load_rul_labels
from fleet_maintenance.science.prediction.multidataset import RegimeNormalizer, evaluate_subset
from fleet_maintenance.services.research_evidence import (
    ResearchEvidenceUnavailable,
    drawing_register,
    load_report,
)


def test_normalization_is_frozen_and_future_rows_do_not_change_past() -> None:
    fit = np.arange(24 * 60, dtype=float).reshape(60, 24)
    normalizer = RegimeNormalizer.fit(fit, 1, 7)
    frozen = normalizer.sensor_mean.copy()
    observation = fit[:4] + 13
    before = normalizer.transform(observation)
    after = normalizer.transform(np.vstack([observation, np.full((3, 24), 1e9)]))[:4]
    np.testing.assert_array_equal(before, after)
    np.testing.assert_array_equal(frozen, normalizer.sensor_mean)
    with pytest.raises(ValueError, match="finite"):
        normalizer.transform(np.full((1, 24), np.nan))


def test_infinite_reference_labels_are_rejected(tmp_path: Path) -> None:
    path = tmp_path / "labels.txt"
    path.write_text("inf\n")
    with pytest.raises(ValueError):
        load_rul_labels(path, 1)


def test_missing_and_hash_corrupt_reports_fail_closed(tmp_path: Path) -> None:
    with pytest.raises(ResearchEvidenceUnavailable):
        load_report(tmp_path, "FD002")
    root = tmp_path / "research/multidataset-v1"
    (root / "FD002").mkdir(parents=True)
    (root / "catalog.json").write_text(json.dumps({"version": "test", "reports": {
        "FD002": "0" * 64}}))
    (root / "FD002/report.json").write_text("{}")
    with pytest.raises(ResearchEvidenceUnavailable):
        load_report(tmp_path, "FD002")
    assert all(row.drawing_reference is None and row.reviewer is None
               and row.verification_status == "pending" for row in drawing_register())


def test_withheld_records_cannot_smuggle_a_prediction_or_future_sensor() -> None:
    row = dict(engine_id="NASA_CMAPSS:FD002:test:1", engine_number=1, cutoff_cycle=5,
               status="withheld", predicted_rul_cycles=None, lower_cycles=None,
               upper_cycles=None, reference_rul_cycles=20, review_urgency="unavailable",
               recommendation="fixture", sensor_trend=[])
    ResearchEngine.model_validate(row)
    with pytest.raises(ValidationError):
        ResearchEngine.model_validate({**row, "predicted_rul_cycles": 12})
    with pytest.raises(ValidationError):
        ResearchEngine.model_validate({**row, "sensor_trend": [dict(
            cycle=6, sensor_2=1, sensor_3=2, sensor_4=3)]})


def test_changing_test_labels_cannot_change_trained_model_or_predictions(tmp_path: Path) -> None:
    raw = tmp_path / "raw"
    raw.mkdir()
    def table(count: int, length: int) -> str:
        return "\n".join(" ".join(map(str, [engine, cycle, 0, 0, 0] +
                     [engine * .1 + cycle * (j + 1) * .01 for j in range(21)]))
                     for engine in range(1, count + 1) for cycle in range(1, length + 1))
    (raw / "train_FD003.txt").write_text(table(20, 40))
    (raw / "test_FD003.txt").write_text(table(3, 32))
    config = json.loads(Path("configs/multidataset_benchmark.json").read_text())
    config["hist_gradient_boosting"]["max_iter"] = 3
    config["nominal_interval_coverage"] = .5
    reports = []
    for i, labels in enumerate(("3\n7\n11\n", "30\n70\n110\n")):
        (raw / "RUL_FD003.txt").write_text(labels)
        (raw / "acquisition-FD002-FD003-FD004.json").write_text(json.dumps({
            "archive_sha256": ARCHIVE_SHA256, "nested_archive_sha256": NESTED_SHA256,
            "files": {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                      for p in raw.glob("*.txt")},
        }))
        reports.append(evaluate_subset(raw, tmp_path / f"run{i}", "FD003", config))
    assert reports[0].provenance["model_sha256"] == reports[1].provenance["model_sha256"]
    assert [r.predicted_rul_cycles for r in reports[0].engines] == [
        r.predicted_rul_cycles for r in reports[1].engines]
    assert reports[0].capped_primary != reports[1].capped_primary
    split = json.loads((tmp_path / "run0/split.json").read_text())
    assert not (set(split["fit"]) & set(split["validation"]))
    assert not (set(split["fit"]) & set(split["calibration"]))
    assert json.loads((tmp_path / "run0/pretest.json").read_text())["test_targets_loaded"] is False


def test_research_routes_require_auth_and_validate_subset_and_missing_bundle(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    from types import SimpleNamespace

    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient

    from fleet_maintenance.api.dependencies import Actor, current_actor
    from fleet_maintenance.api.router import router
    from fleet_maintenance.api.routes import research

    app = FastAPI()
    app.include_router(router, prefix="/api")
    def denied() -> Actor:
        raise HTTPException(401, "Authentication required")
    app.dependency_overrides[current_actor] = denied
    with TestClient(app) as client:
        assert client.get("/api/evidence/research").status_code == 401
        assert client.get("/api/evidence/drawings").status_code == 401
        app.dependency_overrides[current_actor] = lambda: Actor("viewer", "viewer")
        monkeypatch.setattr(
            research, "get_settings", lambda: SimpleNamespace(artifact_root=tmp_path)
        )
        assert client.get("/api/evidence/research/FD005").status_code == 422
        response = client.get("/api/evidence/research/FD002")
        assert response.status_code == 503
        assert "No metrics or predictions have been substituted" in response.json()["detail"]
        assert len(client.get("/api/evidence/drawings").json()) == 5


def test_installer_does_not_publish_a_corrupt_partial_bundle(tmp_path: Path) -> None:
    from fleet_maintenance.services.research_evidence import install_reports

    source = tmp_path / "source"
    source.mkdir()
    (source / "catalog.json").write_text('{}')
    for subset in ("FD001", "FD002", "FD003", "FD004"):
        (source / subset).mkdir()
        (source / subset / "report.json").write_text('{}')
    with pytest.raises(ResearchEvidenceUnavailable):
        install_reports(source, tmp_path / "destination")
    assert not (tmp_path / "destination/research/multidataset-v1").exists()
