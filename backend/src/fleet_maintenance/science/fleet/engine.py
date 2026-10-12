"""Batch fleet-health engine run: simulate, train, evaluate, score and persist a bundle.

The bundle is written to artifact storage with a SHA-256 manifest. The API only reads verified
bundles; it never trains or simulates histories itself.
"""

from __future__ import annotations

import hashlib
import json
import platform
import time
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

import joblib  # type: ignore[import-untyped]
import numpy as np
import sklearn  # type: ignore[import-untyped]

from fleet_maintenance.science.fleet.availability import OpenWork, Snapshot, simulate_fleet
from fleet_maintenance.science.fleet.catalog import (
    AGENCIES,
    AGENCY_INDEX,
    BASES,
    COMPONENT_TYPES,
    PRINT_DAYS,
    SYSTEMS,
    WorldConfig,
)
from fleet_maintenance.science.fleet.features import (
    FEATURE_INDEX,
    FEATURE_NAMES,
    build_features,
    clean_readings,
    fit_normaliser,
)
from fleet_maintenance.science.fleet.integration import integrate
from fleet_maintenance.science.fleet.models import (
    anomaly_percentile,
    attribution_batch,
    build_labels,
    default_split,
    evaluate,
    predict_risk,
    predict_rul,
    sustained,
    train,
)
from fleet_maintenance.science.fleet.simulator import STATE_NAMES, World, simulate

BUNDLE_FILES = (
    "arrays.npz",
    "records.json",
    "attributions.json",
    "evaluation.json",
    "forecast.json",
    "integration.json",
    "truth.json",
    "models.joblib",
)
RECENT_DAYS = 365
FORECAST_HORIZON = 30
FORECAST_RUNS = 300
FORECAST_SEED = 26249
BACKGROUND_SHARE = 0.25


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, separators=(",", ":"), default=str))


def snapshot_from_world(world: World, rul: np.ndarray, risk30: np.ndarray) -> Snapshot:
    """Capture the as-of state used by the availability simulator."""
    day = world.as_of_day
    config = world.config
    repair_days = np.array(
        [t.repair_days * config.repair_scale for t in COMPONENT_TYPES]
    )[world.slot_type]
    fh_per_day = max(float(world.flight_hours[:, -30:].mean()), 0.5)
    life_days = np.array(
        [t.mean_life_fh * config.life_scale for t in COMPONENT_TYPES]
    )[world.slot_type] / fh_per_day
    open_work = []
    for wo in world.work_orders:
        if not wo.is_open:
            continue
        if wo.part is not None and wo.allocated_day is None:
            arrivals = [r.arrival for r in world.pending_receipts if r.part == wo.part]
            t = COMPONENT_TYPES[wo.part]
            lead = PRINT_DAYS if t.additive_printable else t.lead_time_days
            wait = min([a - day for a in arrivals] + [lead])
            remaining, cause = wait + wo.repair_days, "awaiting_spares"
        elif wo.bay_start is None:
            remaining, cause = wo.repair_days + 2, "awaiting_agency"
        else:
            remaining = wo.remaining
            cause = "unscheduled" if wo.kind == "unscheduled" else "scheduled"
        open_work.append(OpenWork(wo.aircraft, max(1, int(remaining)), cause, wo.agency,
                                  wo.bay_start is not None))
    receipts = tuple(
        (r.part, r.quantity, r.arrival - day) for r in world.pending_receipts if r.arrival > day
    )
    utilisation = np.maximum(world.flight_hours[:, -30:].mean(axis=1), 0.3)
    remaining_fh = config.inspection_interval_fh - world.inspection_hours_since
    inspection_due = np.maximum(np.ceil(remaining_fh / utilisation), 0).astype(int)
    return Snapshot(
        aircraft_ids=tuple(world.aircraft_ids),
        slot_aircraft=world.slot_aircraft.copy(),
        slot_part=world.slot_type.copy(),
        slot_agency=np.array([AGENCY_INDEX[t.agency] for t in COMPONENT_TYPES])[world.slot_type],
        repair_days=repair_days,
        rul=rul,
        risk30=risk30,
        # Most failures show a degradation signal first and are sampled from their RUL; slots
        # without a signal keep only the share that arrives without one (sudden or fast onset).
        background_hazard=BACKGROUND_SHARE / np.maximum(life_days, 1.0),
        stock=world.stock[:, day].astype(int).copy(),
        reorder_level=np.array([t.reorder_level for t in COMPONENT_TYPES]),
        lead_time=np.array([t.lead_time_days for t in COMPONENT_TYPES]),
        receipts=receipts,
        bays=np.array([a.bays for a in AGENCIES]),
        open_work=tuple(open_work),
        inspection_due_day=inspection_due,
        inspection_days=config.inspection_days,
        inspection_agency=AGENCY_INDEX["AG-LINE"],
        printable=np.array([t.additive_printable for t in COMPONENT_TYPES]),
    )


# Synthetic fleet mix: a repeating cycle of ten tails (4 light combat aircraft, 2 advanced jet
# trainers, 2 medium transports, 1 heavy multirole fighter, 1 utility helicopter). Class labels
# only (no real type names); the web client's `FLEET_CYCLE` mirrors this order to choose each
# tail's visual model.
_LCA = "Light combat aircraft (synthetic)"
_AJT = "Advanced jet trainer (synthetic)"
_MTA = "Medium transport aircraft (synthetic)"
_MKI = "Heavy multirole fighter (synthetic)"
_ALH = "Utility helicopter (synthetic)"
FLEET_TYPES = (_LCA, _LCA, _LCA, _AJT, _MTA, _MKI, _LCA, _ALH, _AJT, _MTA)


def _records(world: World, unwarned_share: dict[str, float]) -> dict[str, object]:
    first_recent = world.days - RECENT_DAYS
    config = world.config
    aircraft = []
    for index, tail in enumerate(world.aircraft_ids):
        aircraft.append({
            "id": tail,
            "type": FLEET_TYPES[index % len(FLEET_TYPES)],
            "base": BASES[int(world.aircraft_base[index])].id,
            "commissioned": world.aircraft_commissioned[index].isoformat(),
            "utilisation_flights_per_day": round(float(world.utilisation[index]), 2),
            "total_flight_hours": round(float(world.flight_hours[index].sum()) + 6000.0, 1),
            "total_cycles": int(world.cycles[index].sum()) + 4000,
            "inspection_hours_since": round(float(world.inspection_hours_since[index]), 1),
        })
    slots = []
    current: dict[int, dict[str, object]] = {}
    for instance in world.instances:
        if instance.removed is None:
            current[instance.slot] = {"serial": instance.serial,
                                      "installed": world.day_date(instance.installed).isoformat()}
    for slot in range(world.slots):
        component_type = COMPONENT_TYPES[int(world.slot_type[slot])]
        tail = world.aircraft_ids[int(world.slot_aircraft[slot])]
        slots.append({
            "id": f"{tail}-{component_type.code}",
            "aircraft": tail,
            "type": component_type.code,
            "serial": current[slot]["serial"],
            "installed": current[slot]["installed"],
            "hours_since_install": round(float(world.hours_since_install[slot, -1]), 1),
        })
    instances = [
        {
            "slot": instance.slot,
            "serial": instance.serial,
            "installed": world.day_date(instance.installed).isoformat(),
            "removed": world.day_date(instance.removed).isoformat()
            if instance.removed is not None else None,
            "reason": instance.removal_reason,
        }
        for instance in world.instances
        if instance.removed is None or instance.removed >= first_recent - 365
    ]
    work_orders = [
        {
            "id": wo.id,
            "aircraft": world.aircraft_ids[wo.aircraft],
            "slot": wo.slot,
            "kind": wo.kind,
            "agency": AGENCIES[wo.agency].id,
            "opened": world.day_date(wo.opened).isoformat(),
            "opened_day": wo.opened,
            "allocated_day": wo.allocated_day,
            "bay_start_day": wo.bay_start,
            "done_day": wo.done,
            "repair_days": wo.repair_days,
            "promised_day": wo.opened + wo.repair_days + 2,
            "spare_wait_days": wo.spare_wait_days,
            "queue_wait_days": wo.queue_wait_days,
            "priority": wo.priority,
            "finding": wo.finding,
            "delay_reason": wo.delay_reason(),
            "part": COMPONENT_TYPES[wo.part].part_number if wo.part is not None else None,
            "serial_out": wo.serial_out,
            "serial_in": wo.serial_in,
        }
        for wo in world.work_orders
    ]
    faults = [
        {"day": event.day, "aircraft": world.aircraft_ids[event.aircraft], "slot": event.slot,
         "code": event.code, "severity": event.severity, "description": event.description}
        for event in world.faults
        if event.day >= first_recent or event.severity >= 4
    ]
    transactions = [
        {"day": t.day, "part": COMPONENT_TYPES[t.part].part_number, "quantity": t.quantity,
         "kind": t.kind, "work_order": t.work_order}
        for t in world.transactions if t.day >= first_recent
    ]
    receipts = [
        {"part": COMPONENT_TYPES[r.part].part_number, "quantity": r.quantity,
         "arrival_day": r.arrival, "kind": r.kind}
        for r in world.pending_receipts
    ]
    return {
        "meta": {
            "start": world.start.isoformat(),
            "as_of": config.as_of.isoformat(),
            "days": world.days,
            "recent_start_day": first_recent,
            "replay_start_day": world.days - config.replay_days,
            "replay_days": config.replay_days,
            "seed": config.seed,
            "config": {k: v for k, v in asdict(config).items() if k != "hero_ids"},
            "state_names": list(STATE_NAMES),
            "data": "synthetic",
        },
        "catalog": {
            "systems": [{"code": code, "name": name} for code, name in SYSTEMS],
            "component_types": [
                {
                    "code": t.code, "system": t.system, "name": t.name,
                    "criticality": t.criticality, "part_number": t.part_number,
                    "lead_time_days": t.lead_time_days, "unit_cost": t.unit_cost,
                    "repairable": t.repairable,
                    "repair_days": round(t.repair_days * config.repair_scale, 1),
                    "agency": t.agency, "reorder_level": t.reorder_level,
                    "hard_time_fh": t.hard_time_fh,
                    "additive_printable": t.additive_printable,
                    "mean_life_fh": round(t.mean_life_fh * config.life_scale),
                    "unwarned_failure_share": unwarned_share.get(t.code),
                    "parameters": [
                        {"name": p.name, "unit": p.unit, "direction": p.direction,
                         "baseline": p.baseline, "noise": p.noise, "signature": p.signature,
                         "minimum": p.minimum}
                        for p in t.parameters
                    ],
                }
                for t in COMPONENT_TYPES
            ],
            "agencies": [asdict(agency) for agency in AGENCIES],
            "bases": [asdict(base) for base in BASES],
        },
        "aircraft": aircraft,
        "slots": slots,
        "instances": instances,
        "work_orders": work_orders,
        "faults": faults,
        "transactions": transactions,
        "pending_receipts": receipts,
        "scripted": world.scripted,
    }


def run_engine(directory: Path, run_id: str, seed: int = 42) -> dict[str, object]:
    """Execute one complete engine run and write a verified bundle into ``directory``."""
    timings: dict[str, float] = {}
    started = time.perf_counter()

    def mark(name: str) -> None:
        timings[name] = round(time.perf_counter() - started - sum(timings.values()), 2)

    world = simulate(WorldConfig(seed=seed))
    mark("simulate")
    values, flags = clean_readings(world)
    split = default_split(world)
    _, train_end = split.periods(world)["train"]
    train_mask = np.zeros((world.slots, world.days), dtype=bool)
    train_mask[:, :train_end] = True
    normaliser = fit_normaliser(world, values, train_mask)
    features = build_features(world, values, flags, normaliser)
    labels = build_labels(world)
    mark("features")
    models = train(world, features, labels, split)
    mark("train")
    evaluation = evaluate(world, features, labels, split, models)
    mark("evaluate")

    # Score every slot for each replay day.
    replay = world.config.replay_days
    first = world.days - replay
    x = features.values[:, first:, :].reshape(-1, len(FEATURE_NAMES)).astype(np.float64)
    shape = (world.slots, replay)
    risk14 = predict_risk(models, x, 14).reshape(shape)
    risk30 = predict_risk(models, x, 30).reshape(shape)
    rul = predict_rul(models, x).reshape(*shape, 3)
    anomaly = anomaly_percentile(models, x).reshape(shape)
    has_reading = features.has_reading[:, first:]
    flagged = (anomaly >= models.anomaly_threshold) & (
        features.values[:, first:, FEATURE_INDEX["zpos_max"]] >= 2.0
    )
    alert = np.zeros(shape, dtype=bool)
    for slot in range(world.slots):
        observed = np.flatnonzero(has_reading[slot])
        if observed.size:
            alert_on_readings = sustained(flagged[slot, observed][None, :])[0]
            position = np.searchsorted(observed, np.arange(replay), side="right") - 1
            alert[slot] = np.where(position >= 0, alert_on_readings[np.maximum(position, 0)], False)
    hi = features.health_index[:, first:]
    mark("score")

    worth_slots, worth_offsets = np.nonzero((hi < 80) | (risk30 >= 0.15) | alert)
    batch = attribution_batch(
        models,
        features.values[worth_slots, first + worth_offsets].astype(np.float64),
        world.slot_type[worth_slots],
    )
    attributions = {
        f"{slot}:{offset}": [
            {"factor": item["factor"], "contribution": round(float(item["contribution"]), 4)}
            for item in rows[:6]
        ]
        for slot, offset, rows in zip(worth_slots, worth_offsets, batch, strict=True)
    }
    mark("attribution")

    # Share of recorded failures per type that the risk model did not warn about (>=0.5 within
    # 45 days); used as a confidence note on advisories. Uses validation and test periods only.
    start, _ = split.periods(world)["validation"]
    _, end = split.periods(world)["test"]
    warned: dict[str, list[bool]] = {}
    for slot, day, _sudden in world.truth.failure_days:
        if not start + 30 <= day < end:
            continue
        window = np.arange(day - 45, day + 1)
        window = window[features.has_reading[slot, window]]
        code = COMPONENT_TYPES[int(world.slot_type[slot])].code
        hit = bool(window.size) and bool(
            (predict_risk(models, features.values[slot, window].astype(np.float64), 14) >= 0.5)
            .any()
        )
        warned.setdefault(code, []).append(hit)
    unwarned = {code: round(1.0 - float(np.mean(hits)), 3) for code, hits in warned.items()}

    snapshot = snapshot_from_world(world, rul[:, -1, :], risk30[:, -1])
    forecast = simulate_fleet(snapshot, FORECAST_HORIZON, FORECAST_RUNS, FORECAST_SEED).describe()
    mark("forecast")
    integration = integrate(world, flags)

    recent = world.days - RECENT_DAYS
    directory.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        directory / "arrays.npz",
        aircraft_state=world.aircraft_state,
        flight_hours=world.flight_hours,
        cycles=world.cycles,
        stock=world.stock,
        readings=values[:, recent:, :].astype(np.float32),
        flags=flags[:, recent:, :],
        z=features.z[:, recent:, :].astype(np.float32),
        hi_recent=features.health_index[:, recent:],
        instance_recent=world.instance_index[:, recent:],
        ambient=world.ambient[:, recent:],
        hi=hi,
        risk14=risk14.astype(np.float32),
        risk30=risk30.astype(np.float32),
        rul=rul.astype(np.float32),
        anomaly=anomaly.astype(np.float32),
        alert=alert,
        has_reading=has_reading,
        missing_rate=features.values[:, first:, FEATURE_INDEX["missing_rate_20"]],
        days_since=features.values[:, first:, FEATURE_INDEX["days_since_reading"]],
        mean5=features.values[:, first:, [FEATURE_INDEX[f"p{k}_mean5"] for k in range(3)]],
        hours=world.hours_since_install[:, first:],
    )
    _json(directory / "records.json", _records(world, unwarned))
    _json(directory / "attributions.json", attributions)
    evaluation["training"] = {
        "features": list(FEATURE_NAMES),
        "anomaly_threshold_percentile": models.anomaly_threshold,
        "rul_conformal_widening_days": models.rul_conformal,
        "models": {
            "anomaly": "IsolationForest(150 trees) on residual statistics + residual z >= 2",
            "failure_risk": "HistGradientBoostingClassifier + isotonic calibration (14 and 30 d)",
            "failure_risk_baseline": "LogisticRegression (balanced) + isotonic calibration",
            "rul": "HistGradientBoostingRegressor quantile 0.1/0.5/0.9, cap 60 d, split CQR",
            "rul_baseline": "linear extrapolation of the health index to 20",
            "priority": "transparent weighted rule (configs/fleet_priority.yaml)",
            "availability": "day-step Monte Carlo with common random numbers",
        },
        "library_versions": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "scikit-learn": sklearn.__version__,
        },
        "data_hash": hashlib.sha256(values[:, :, 0].tobytes()).hexdigest()[:16],
        "timings_seconds": timings,
        "substitutions": [
            "LightGBM replaced by scikit-learn HistGradientBoosting (locked dependency set)",
            "SHAP replaced by occlusion attribution on the risk model's log-odds",
        ],
    }
    _json(directory / "evaluation.json", evaluation)
    _json(directory / "forecast.json", {"horizon_days": FORECAST_HORIZON, "runs": FORECAST_RUNS,
                                         "seed": FORECAST_SEED, **forecast})
    _json(directory / "integration.json", integration)
    _json(directory / "truth.json", {
        "warning": "Hidden simulation truth. Evaluation and demo storytelling only; never used "
        "as a model feature.",
        "future_failure_days": {str(k): v for k, v in world.truth.future_failures.items()},
        "recent_failures": [
            {"slot": slot, "day": day, "sudden": sudden}
            for slot, day, sudden in world.truth.failure_days if day >= recent
        ],
    })
    joblib.dump(models, directory / "models.joblib", compress=3)
    mark("persist")
    manifest = {
        "run_id": run_id,
        "seed": seed,
        "as_of": world.config.as_of.isoformat(),
        "created_at": datetime.now(UTC).isoformat(),
        "data": "synthetic",
        "hashes": {name: _sha256(directory / name) for name in BUNDLE_FILES},
        "timings_seconds": timings,
    }
    _json(directory / "manifest.json", manifest)
    risk_test = evaluation["failure_risk"]
    return {
        "run_id": run_id,
        "as_of": manifest["as_of"],
        "hashes": manifest["hashes"],
        "summary": {
            "pr_auc_14d": risk_test["14d"]["pr_auc"],  # type: ignore[index]
            "baseline_pr_auc_14d": risk_test["14d"]["baseline_logistic_pr_auc"],  # type: ignore[index]
            "rul_mae_near_failure": evaluation["rul"]["mae_days_near_failure"],  # type: ignore[index]
            "forecast_availability_mean": forecast["availability_mean"],
            "timings_seconds": timings,
        },
    }
