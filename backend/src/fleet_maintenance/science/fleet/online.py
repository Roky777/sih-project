"""Cutoff-bound inference using the original fleet feature transformation and fitted models.

Only synthetic fleet catalogue mappings are supported. FD001 research models are never used.
"""

from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import joblib  # type: ignore[import-untyped]
import numpy as np

from fleet_maintenance.science.fleet.features import Normaliser, build_features
from fleet_maintenance.science.fleet.models import anomaly_percentile, predict_risk, predict_rul
from fleet_maintenance.science.fleet.simulator import World


def save_context(
    directory: Path, world: World, values: np.ndarray, flags: np.ndarray, normaliser: Normaliser
) -> None:
    np.savez_compressed(
        directory / "ingestion_context.npz",
        values=values,
        flags=flags,
        ambient=world.ambient,
        load_factor=world.load_factor,
        instance_index=world.instance_index,
        hours_since_install=world.hours_since_install,
        flight_hours=world.flight_hours,
        slot_type=world.slot_type,
        slot_aircraft=world.slot_aircraft,
        coefficients=normaliser.coefficients,
        residual_sd=normaliser.residual_sd,
        life_scale=np.array(world.config.life_scale),
        faults=np.array(
            [(f.slot, f.day, f.severity) for f in world.faults], dtype=np.int64
        ).reshape(-1, 3),
    )


def infer(
    directory: Path,
    slot: int,
    cutoff: int,
    observations: list[dict[str, Any]],
    parameter_names: list[str],
    start_day: Any,
) -> dict[str, Any]:
    with np.load(directory / "ingestion_context.npz", allow_pickle=False) as stored:
        context = {key: stored[key] for key in stored.files}
    values, flags = (
        context["values"][:, : cutoff + 1].copy(),
        context["flags"][:, : cutoff + 1].copy(),
    )
    for reading in observations:
        day = (reading["date"] - start_day).days
        if 0 <= day <= cutoff:
            parameter = parameter_names.index(reading["parameter"])
            values[slot, day, parameter] = (
                reading["mean"] if reading["quality_flag"] == 0 else np.nan
            )
            flags[slot, day, parameter] = reading["quality_flag"]
    world = SimpleNamespace(
        config=SimpleNamespace(life_scale=float(context["life_scale"])),
        faults=[
            SimpleNamespace(slot=int(s), day=int(d), severity=int(v))
            for s, d, v in context["faults"]
            if d <= cutoff
        ],
        slot_type=context["slot_type"],
        slot_aircraft=context["slot_aircraft"],
        **{
            key: context[key][:, : cutoff + 1]
            for key in [
                "ambient",
                "load_factor",
                "instance_index",
                "hours_since_install",
                "flight_hours",
            ]
        },
    )
    normaliser = Normaliser(context["coefficients"], context["residual_sd"])
    features = build_features(cast(World, world), values, flags, normaliser)
    if not features.has_reading[slot, -1] or np.count_nonzero(features.has_reading[slot]) < 20:
        return {
            "state": "withheld",
            "reason": "20 usable observation days and a usable cutoff observation are required",
        }
    models = joblib.load(directory / "models.joblib")
    x = features.values[slot, -1:].astype(np.float64)
    rul = predict_rul(models, x)[0]
    return {
        "state": "available",
        "health_index": float(features.health_index[slot, -1]),
        "risk14": float(predict_risk(models, x, 14)[0]),
        "risk30": float(predict_risk(models, x, 30)[0]),
        "rul": {"p10": float(rul[0]), "p50": float(rul[1]), "p90": float(rul[2])},
        "anomaly": float(anomaly_percentile(models, x)[0]),
        "units": "days",
        "normalised": [float(z) if np.isfinite(z) else None for z in features.z[slot, -1]],
        "data_label": "Synthetic fleet model; not FD001 or operational qualification",
    }
