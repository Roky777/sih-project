"""Separate, frozen C-MAPSS research fits; does not change the registered FD001 predictor."""

import hashlib
import json
from dataclasses import asdict, dataclass, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import joblib  # type: ignore[import-untyped]
import numpy as np
from numpy.typing import NDArray
from sklearn.cluster import KMeans  # type: ignore[import-untyped]
from sklearn.ensemble import HistGradientBoostingRegressor  # type: ignore[import-untyped]

from fleet_maintenance.domain.contracts.research import (
    ErrorMetrics,
    InputInfluence,
    ResearchEngine,
    ResearchReport,
    SensorPoint,
    Subset,
)
from fleet_maintenance.science.data.acquisition import ARCHIVE_SHA256, NESTED_SHA256
from fleet_maintenance.science.data.features import (
    build_snapshot_dataset,
    snapshot_feature_names,
    snapshot_features,
)
from fleet_maintenance.science.data.loaders import CmapssTable, load_cmapss_table, load_rul_labels
from fleet_maintenance.science.data.splitting import assert_disjoint, split_engines
from fleet_maintenance.science.prediction.calibration import conformal_quantile
from fleet_maintenance.science.prediction.evaluation import regression_metrics


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@dataclass
class RegimeNormalizer:
    settings_mean: NDArray[np.float64]
    settings_scale: NDArray[np.float64]
    centers: NDArray[np.float64]
    sensor_mean: NDArray[np.float64]
    sensor_scale: NDArray[np.float64]

    @classmethod
    def fit(cls, features: NDArray[np.float64], clusters: int, seed: int) -> "RegimeNormalizer":
        if features.ndim != 2 or features.shape[1] != 24 or not np.isfinite(features).all():
            raise ValueError("Expected finite settings and 21 generic sensors")
        mean, scale = features[:, :3].mean(axis=0), features[:, :3].std(axis=0)
        scale[scale < 1e-8] = 1
        settings = (features[:, :3] - mean) / scale
        if clusters == 1:
            centers = np.zeros((1, 3))
            groups = np.zeros(len(features), dtype=np.int64)
        else:
            kmeans = KMeans(n_clusters=clusters, n_init=10, random_state=seed).fit(settings)
            centers, groups = kmeans.cluster_centers_, kmeans.labels_
        means = np.vstack([features[groups == i, 3:].mean(axis=0) for i in range(clusters)])
        scales = np.vstack([features[groups == i, 3:].std(axis=0) for i in range(clusters)])
        scales[scales < 1e-8] = 1
        return cls(mean, scale, centers, means, scales)

    def transform(self, features: NDArray[np.float64]) -> NDArray[np.float64]:
        if features.ndim != 2 or features.shape[1] != 24 or not np.isfinite(features).all():
            raise ValueError("Expected finite settings and 21 generic sensors")
        settings = (features[:, :3] - self.settings_mean) / self.settings_scale
        groups = np.square(settings[:, None, :] - self.centers[None, :, :]).sum(axis=2).argmin(1)
        return np.column_stack((settings, (features[:, 3:] - self.sensor_mean[groups]) /
                                self.sensor_scale[groups]))


def research_engine(
    table: CmapssTable, number: int, reference: float, estimate: float | None,
    lower: float | None, upper: float | None, policy: dict[str, int],
) -> ResearchEngine:
    mask = table.engine_numbers == number
    cycles, rows = table.cycles[mask], table.features[mask]
    urgency = "unavailable" if estimate is None else (
        "critical_review" if estimate <= policy["critical_at_or_below"] else
        "review" if estimate <= policy["review_at_or_below"] else "routine"
    )
    recommendation = {
        "unavailable": "Withheld: insufficient observed history; collect more data before review.",
        "critical_review": "Prioritise engineering review of the recorded sensor evidence. "
        "Check mandatory maintenance, parts and qualified capacity before proposing work.",
        "review": "Review the sensor trend and life range; consider a maintenance window with "
        "the authorised engineer. Mandatory requirements remain authoritative.",
        "routine": "Continue monitoring this simulated engine; retain mandatory maintenance. "
        "This estimate does not clear an aircraft.",
    }[urgency]
    return ResearchEngine(
        engine_id=table.identities[int(np.flatnonzero(mask)[0])], engine_number=number,
        cutoff_cycle=int(cycles[-1]), status="withheld" if estimate is None else "evaluated",
        predicted_rul_cycles=estimate, lower_cycles=lower, upper_cycles=upper,
        reference_rul_cycles=reference, review_urgency=cast(Any, urgency),
        recommendation=recommendation,
        sensor_trend=[SensorPoint(cycle=int(c), sensor_2=float(r[4]), sensor_3=float(r[5]),
                                  sensor_4=float(r[6]))
                      for c, r in zip(cycles[-30:], rows[-30:], strict=True)],
    )


def evaluate_subset(raw: Path, output: Path, subset: str, config: dict[str, Any]) -> ResearchReport:
    if subset not in {"FD002", "FD003", "FD004"}:
        raise ValueError("New benchmark only supports FD002–FD004; preserve historical FD001")
    ledger = json.loads((raw / "acquisition-FD002-FD003-FD004.json").read_text())
    if ledger.get("archive_sha256") != ARCHIVE_SHA256 or ledger.get(
        "nested_archive_sha256"
    ) != NESTED_SHA256:
        raise ValueError("Unverified NASA acquisition ledger")
    for part in ("train", "test", "RUL"):
        name = f"{part}_{subset}.txt"
        if ledger["files"].get(name) != digest(raw / name):
            raise ValueError(f"Source bytes changed after acquisition: {name}")
    output.mkdir(parents=True, exist_ok=False)
    train = load_cmapss_table(raw / f"train_{subset}.txt", subset, "train")
    ids = sorted(set(train.identities))
    split = split_engines(ids, config["split_seed"])
    assert_disjoint(split)
    (output / "split.json").write_text(json.dumps(asdict(split), indent=2) + "\n")
    (output / "protocol.json").write_text(json.dumps({
        "frozen_before_fit_at": datetime.now(UTC).isoformat(), "config": config,
        "training_sha256": digest(raw / f"train_{subset}.txt"),
    }, indent=2, sort_keys=True) + "\n")
    fit_numbers = [int(identity.rsplit(":", 1)[1]) for identity in split.fit]
    normalizer = RegimeNormalizer.fit(train.features[np.isin(train.engine_numbers, fit_numbers)],
                                     config["regime_clusters"][subset], config["model_seed"])
    normalized = replace(train, features=normalizer.transform(train.features))
    options = {"minimum_history": config["minimum_history_cycles"],
               "window": config["feature_window_cycles"], "target_cap": config["target_cap_cycles"],
               "seed": config["split_seed"]}
    fit = build_snapshot_dataset(normalized, split.fit, sampling="all", **options)
    validation = build_snapshot_dataset(normalized, split.validation,
                                        sampling="one_seeded_cutoff_per_engine", **options)
    calibration = build_snapshot_dataset(normalized, split.calibration,
                                         sampling="one_seeded_cutoff_per_engine", **options)
    model = HistGradientBoostingRegressor(random_state=config["model_seed"],
                                         **config["hist_gradient_boosting"])
    model.fit(fit.values, fit.targets)
    def predict(values: NDArray[np.float64]) -> NDArray[np.float64]:
        result: NDArray[np.float64] = np.clip(
            np.asarray(model.predict(values), dtype=np.float64), 0, config["target_cap_cycles"]
        )
        return result
    validation_metrics = regression_metrics(validation.targets, predict(validation.values))
    quantile = conformal_quantile(np.abs(calibration.targets - predict(calibration.values)),
                                 config["nominal_interval_coverage"])
    feature_mean = fit.values.mean(axis=0)
    joblib.dump({"normalizer": normalizer, "model": model, "quantile": quantile,
                 "config": config}, output / "research-model.joblib")
    # Freeze selected weights/calibration before loading any official test target values.
    model_hash = digest(output / "research-model.joblib")
    (output / "pretest.json").write_text(json.dumps({
        "model_sha256": model_hash, "validation": validation_metrics.as_dict(),
        "calibration_engines": list(split.calibration),
        "residual_quantile_cycles": quantile, "calibration_cutoffs": calibration.cutoffs.tolist(),
        "test_targets_loaded": False,
    }, indent=2) + "\n")
    test = load_cmapss_table(raw / f"test_{subset}.txt", subset, "test")
    numbers = np.unique(test.engine_numbers)
    if not np.array_equal(numbers, np.arange(1, len(numbers) + 1)):
        raise ValueError("Official RUL row alignment requires consecutive test engine IDs")
    labels = load_rul_labels(raw / f"RUL_{subset}.txt", len(numbers))
    normalized_test = normalizer.transform(test.features)
    engines = []
    predictions, targets, widths, covered = [], [], [], []
    names = snapshot_feature_names(train.feature_names)
    for number, reference in zip(numbers, labels, strict=True):
        mask = test.engine_numbers == number
        history = normalized_test[mask]
        cutoff = int(test.cycles[mask][-1])
        if len(history) < options["minimum_history"]:
            engines.append(research_engine(test, int(number), float(reference), None, None, None,
                                            config["review_policy_cycles"]))
            continue
        values = snapshot_features(history, cutoff, options["window"])
        estimate = float(predict(values[None, :])[0])
        lower, upper = max(0, estimate - quantile), estimate + quantile
        row = research_engine(test, int(number), float(reference), estimate, lower, upper,
                              config["review_policy_cycles"])
        interventions = np.tile(values, (len(values), 1))
        np.fill_diagonal(interventions, feature_mean)
        influences = predict(interventions) - estimate
        row.influences = [InputInfluence(feature=names[i],
                                        change_when_replaced_cycles=float(influences[i]))
                          for i in np.argsort(-np.abs(influences))[:5]]
        engines.append(row)
        predictions.append(estimate)
        targets.append(float(reference))
        widths.append(upper - lower)
        covered.append(lower <= min(options["target_cap"], reference) <= upper)
    target = np.asarray(targets, dtype=np.float64)
    capped = np.minimum(target, options["target_cap"])
    predicted = np.asarray(predictions, dtype=np.float64)
    source_hashes = {f"{part}_{subset}.txt": digest(raw / f"{part}_{subset}.txt")
                     for part in ("train", "test", "RUL")}
    report = ResearchReport(
        subset=cast(Subset, subset), evidence_status="research_only",
        model_version=f"{config['version']}-{subset}",
        operating_conditions=config["regime_clusters"][subset], fault_modes=2 if subset in {
            "FD003", "FD004"} else 1, target_cap_cycles=options["target_cap"],
        minimum_history_cycles=options["minimum_history"], train_engine_count=len(ids),
        test_engine_count=len(numbers), withheld_count=len(numbers) - len(predictions),
        split_counts={"fit": len(split.fit), "validation": len(split.validation),
                      "calibration": len(split.calibration)},
        capped_primary=ErrorMetrics.model_validate(regression_metrics(capped, predicted).as_dict()),
        uncapped_secondary=ErrorMetrics.model_validate(
            regression_metrics(target, predicted).as_dict()),
        validation=ErrorMetrics.model_validate(validation_metrics.as_dict()),
        constant_baseline=ErrorMetrics.model_validate(
            regression_metrics(capped, np.full(len(target), fit.targets.mean())).as_dict()),
        interval_coverage=float(np.mean(covered)),
        mean_interval_width_cycles=float(np.mean(widths)),
        nominal_interval_coverage=config["nominal_interval_coverage"],
        protocol=config["protocol"], limitations=config["limits"], engines=engines,
        provenance={"source_hashes": source_hashes, "model_sha256": model_hash,
                    "description_count_discrepancy": (
                        "Pinned FD004 files contain 249 training and 248 test engines; "
                        "NASA readme/portal list these counts in reverse." if subset == "FD004"
                        else None),
                    "split_sha256": digest(output / "split.json"),
                    "protocol_sha256": digest(output / "protocol.json"),
                    "split_seed": config["split_seed"], "model_seed": config["model_seed"],
                    "implementation_sha256": digest(Path(__file__)),
                    "normalizer": {k: v.tolist() for k, v in asdict(normalizer).items()},
                    "calibration_count": len(calibration.targets),
                    "source_url": "https://data.nasa.gov/dataset/cmapss-jet-engine-simulated-data",
                    "sensor_units": "native generic dataset values; physical mapping unverified",
                    "influence_method": "replace one engineered feature with its fit-only mean; "
                    "noncausal model sensitivity, not additive contributions or a physical fault",
                    "review_policy_cycles": config["review_policy_cycles"]},
    )
    (output / "report.json").write_text(report.model_dump_json(indent=2) + "\n")
    return report


def historical_fd001(raw: Path, evidence: Path, policy: dict[str, int]) -> ResearchReport:
    """Repackage retained predictions, never refit/re-evaluate an inspected FD001 test."""
    old = json.loads(evidence.read_text())
    for name, expected in old["source_hashes"].items():
        if digest(raw / name) != expected:
            raise ValueError("Historical FD001 source hash mismatch")
    test = load_cmapss_table(raw / "test_FD001.txt", "FD001", "test")
    engines = [research_engine(test, int(row["engine_id"].rsplit(":", 1)[1]),
                               row["true_uncapped_cycles"], row["estimate_cycles"],
                               row["lower_cycles"], row["upper_cycles"], policy)
               for row in old["predictions"]]
    manifest_path = evidence.parents[1] / "models/customer-trial-v1/manifest.json"
    if digest(manifest_path) != old["model_manifest_sha256"]:
        raise ValueError("Historical serving-model manifest hash mismatch")
    manifest = json.loads(manifest_path.read_text())
    split_counts = {name: len(manifest[f"{name}_engines"])
                    for name in ("fit", "validation", "calibration")}
    return ResearchReport(
        subset="FD001", evidence_status="historical_inspected", model_version="customer-trial-v1",
        operating_conditions=1, fault_modes=1, target_cap_cycles=old["target_cap_cycles"],
        minimum_history_cycles=30, train_engine_count=100, test_engine_count=100,
        withheld_count=len(old["withheld_engines"]), split_counts=split_counts,
        capped_primary=ErrorMetrics.model_validate(old["capped_primary"]),
        uncapped_secondary=ErrorMetrics.model_validate(old["uncapped_secondary"]),
        validation=None, constant_baseline=None, interval_coverage=old["intervals"]["coverage"],
        mean_interval_width_cycles=old["intervals"]["mean_width_cycles"],
        nominal_interval_coverage=old["intervals"]["nominal_coverage"], engines=engines,
        protocol="Historical official FD001 endpoint evaluation; model and protocol differ from "
        "the new multi-subset benchmark. Previously inspected test; no refit or new test claim.",
        limitations="Simulated engine benchmark, not real aircraft validation. Historical "
        "predictions/intervals preserved byte-for-byte in the source report. No new influences "
        "are invented. Do not rank different subsets/models as a controlled model comparison.",
        provenance={"historical_report_sha256": digest(evidence),
                    "source_hashes": old["source_hashes"], "model_hashes": old["model_artifacts"],
                    "historical_version": old["version"],
                    "source_url": "https://data.nasa.gov/dataset/cmapss-jet-engine-simulated-data",
                    "sensor_units": "native generic dataset values; physical mapping unverified",
                    "influence_method": "Unavailable in historical endpoint report; not fabricated",
                    "review_policy_cycles": policy},
    )
