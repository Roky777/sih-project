"""Health states, maintenance advisories, digital-twin roll-up, spares and KPIs.

Pure functions over a verified ``FleetBundle``; persistent human decisions (advisory status,
planned work orders) are passed in by the service layer. Every output is synthetic decision
support. Mandatory scheduled inspections are listed independently and are never overridden by
model output.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from functools import lru_cache
from importlib.resources import files
from typing import Any

import numpy as np
import yaml  # type: ignore[import-untyped]

from fleet_maintenance.science.fleet.bundle import FleetBundle
from fleet_maintenance.science.fleet.catalog import PRINT_DAYS

STATE_RANK = {
    "healthy": 0,
    "watch": 1,
    "degraded": 2,
    "critical": 3,
    "failed": 4,
    "under_maintenance": 4,
}
AVAILABILITY_STATES = (
    "available",
    "scheduled_maintenance",
    "unscheduled_repair",
    "awaiting_spares",
    "awaiting_agency",
)
FACTOR_LABELS = {
    "usage_and_age": "Usage and age",
    "fault_messages": "Built-in-test messages",
    "data_quality": "Data quality",
    "operating_conditions": "Operating conditions",
}
MAN_HOURS_PER_REPAIR_DAY = 16.0  # assumption: two technicians per active repair day


@lru_cache
def priority_config() -> dict[str, Any]:
    text = files("fleet_maintenance.science.fleet").joinpath("priority.yaml").read_text()
    loaded: dict[str, Any] = yaml.safe_load(text)
    return loaded


@dataclass(frozen=True)
class Overlay:
    """Human decisions persisted in PostgreSQL, applied on top of the engine bundle."""

    advisory_status: dict[str, dict[str, Any]]
    planned_work: list[dict[str, Any]]
    # Logistics parts requests: {"part", "quantity", "status", "eta" (date | None)}.
    part_requests: tuple[dict[str, Any], ...] = ()
    # Agency work orders a supervisor closed (aircraft returned to service).
    closed_recorded: frozenset[str] = frozenset()
    # Positions fitted with a new part by completed work (planned or closed agency work).
    replaced_components: frozenset[str] = frozenset()

    assessments: dict[str, dict[str, Any]] = field(default_factory=dict)

    def in_work(self) -> list[dict[str, Any]]:
        return [
            w for w in self.planned_work if w["status"] in {"in_progress", "awaiting_verification"}
        ]

    def consumed(self) -> Counter[str]:
        """Spares used by completed planned work."""
        return Counter(
            w["part"]
            for w in self.planned_work
            if w["status"] in {"completed", "awaiting_verification"} and w.get("part")
        )

    def ordered(self) -> list[dict[str, Any]]:
        return [r for r in self.part_requests if r["status"] == "ordered" and r["eta"]]

    def received(self) -> Counter[str]:
        counts: Counter[str] = Counter()
        for request in self.part_requests:
            counts[request["part"]] += int(
                request.get(
                    "received_quantity",
                    request["quantity"] if request["status"] == "received" else 0,
                )
            )
        return counts

    def parts_status(self, work_order_id: str | None) -> str | None:
        statuses = [
            r["status"]
            for r in self.part_requests
            if work_order_id and r.get("work_order_id") == work_order_id
        ]
        return statuses[0] if statuses else None


EMPTY_OVERLAY = Overlay({}, [])


# Component health ---------------------------------------------------------------------------
def health_state(hi: float, risk14: float) -> str:
    thresholds = priority_config()["health_states"]
    if hi < thresholds["degraded"] or risk14 > priority_config()["risk_bands"]["critical"]:
        return "critical"
    if hi < thresholds["watch"]:
        return "degraded"
    if hi < thresholds["healthy"]:
        return "watch"
    return "healthy"


def risk_band(risk14: float) -> str:
    bands = priority_config()["risk_bands"]
    if risk14 >= bands["critical"]:
        return "critical"
    if risk14 >= bands["high"]:
        return "high"
    if risk14 >= bands["watch"]:
        return "watch"
    return "low"


def open_recorded(
    bundle: FleetBundle, day: int, overlay: Overlay = EMPTY_OVERLAY
) -> list[dict[str, Any]]:
    """Agency work orders still open on ``day``, excluding those a supervisor closed."""
    return [wo for wo in bundle.open_work_orders(day) if wo["id"] not in overlay.closed_recorded]


NEW_PART: dict[str, Any] = {
    "hi": 100.0,
    "risk14": 0.0,
    "risk30": 0.0,
    "rul": (60.0, 60.0, 60.0),
    "anomaly": 0.0,
}


def component_states(
    bundle: FleetBundle, offset: int, overlay: Overlay = EMPTY_OVERLAY
) -> list[dict[str, Any]]:
    day = bundle.replay_start_day + offset
    arrays = bundle.arrays
    in_work: dict[int, dict[str, Any]] = {}
    for wo in open_recorded(bundle, day + 1, overlay):
        if wo["slot"] is not None:
            in_work[int(wo["slot"])] = wo
    started = {w["component_id"]: w for w in overlay.in_work()}
    rows = []
    for slot, record in enumerate(bundle.slots):
        hi = float(arrays["hi"][slot, offset])
        risk14 = float(arrays["risk14"][slot, offset])
        risk30 = float(arrays["risk30"][slot, offset])
        rul = arrays["rul"][slot, offset]
        anomaly = float(arrays["anomaly"][slot, offset])
        alert = bool(arrays["alert"][slot, offset])
        assessment = overlay.assessments.get(record["id"])
        if assessment and assessment.get("state") == "available":
            hi, risk14, risk30 = (
                assessment["health_index"],
                assessment["risk14"],
                assessment["risk30"],
            )
            rul = np.array([assessment["rul"][key] for key in ("p10", "p50", "p90")])
            anomaly = assessment["anomaly"]
        if record["id"] in overlay.replaced_components:
            # A new part was fitted in the workspace; the engine's scores describe the old one.
            hi, risk14, risk30 = NEW_PART["hi"], NEW_PART["risk14"], NEW_PART["risk30"]
            rul, anomaly, alert = np.array(NEW_PART["rul"]), NEW_PART["anomaly"], False
        work = in_work.get(slot)
        if record["id"] in started:
            state = "under_maintenance"
            work = {"id": started[record["id"]]["id"]}
        elif work is not None:
            state = "failed" if work["kind"] == "unscheduled" else "under_maintenance"
        else:
            state = health_state(hi, risk14)
        rows.append(
            {
                "slot": slot,
                "id": record["id"],
                "aircraft": record["aircraft"],
                "type": record["type"],
                "state": state,
                "hi": round(hi, 1),
                "risk14": round(risk14, 4),
                "risk30": round(risk30, 4),
                "rul": {
                    "p10": round(float(rul[0]), 1),
                    "p50": round(float(rul[1]), 1),
                    "p90": round(float(rul[2]), 1),
                },
                "anomaly": round(anomaly, 4),
                "anomaly_sustained": alert,
                "work_order": work["id"] if work else None,
            }
        )
    return rows


# Spares -------------------------------------------------------------------------------------
def _reserved(overlay: Overlay) -> Counter[str]:
    counts: Counter[str] = Counter()
    active = {
        w["id"]
        for w in overlay.planned_work
        if w["status"] in {"planned", "approved", "in_progress"}
    }
    for request in overlay.part_requests:
        if request.get("work_order_id") in active and request["status"] == "reserved":
            counts[request["part"]] += int(request["quantity"])
    return counts


def _receipts_within(
    bundle: FleetBundle, day: int, part: str, horizon: int, overlay: Overlay = EMPTY_OVERLAY
) -> list[int]:
    ordered = [
        {
            "arrival_day": bundle.day_of(r["eta"]),
            "quantity": max(0, r["quantity"] - r.get("received_quantity", 0)),
            "part": r["part"],
        }
        for r in overlay.ordered()
    ]
    return [
        int(r["arrival_day"])
        for r in [*bundle.receipts_after(day), *ordered]
        if r["part"] == part and day < int(r["arrival_day"]) <= day + horizon
        for _ in range(int(r["quantity"]))
    ]


def failure_probability(rul: np.ndarray, risk: float, horizon: int, hazard: float) -> float:
    """P(failure within horizon days) from RUL quantiles, or risk/background without signal."""
    p10, p50, p90 = (float(value) for value in rul)
    if p50 < 50.0:
        knots = [max(0.0, p10 - (p50 - p10)), p10, p50, p90, p90 + (p90 - p50) if p90 < 60 else 1e6]
        return float(np.interp(horizon, knots, [0.0, 0.1, 0.5, 0.9, 1.0]))
    if horizon <= 30:
        return float(max(risk * horizon / 30.0, 1 - math.exp(-hazard * horizon)))
    return float(max(risk, 1 - math.exp(-hazard * horizon)))


def spare_position(
    bundle: FleetBundle, offset: int, overlay: Overlay, states: list[dict[str, Any]] | None = None
) -> dict[str, dict[str, Any]]:
    day = bundle.replay_start_day + offset
    stock = bundle.stock_on(day)
    received = overlay.received()
    reserved = _reserved(overlay)
    states = states or component_states(bundle, offset, overlay)
    consumed = overlay.consumed()
    competing: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in states:
        if row["state"] in ("failed", "under_maintenance"):
            continue
        if row["risk30"] >= 0.2 or row["rul"]["p50"] < 30:
            competing[bundle.type_by_code[row["type"]]["part_number"]].append(row)
    result = {}
    for index, component_type in enumerate(bundle.types):
        part = component_type["part_number"]
        on_hand = max(0, int(stock[index]) + received.get(part, 0) - consumed.get(part, 0))
        held = int(reserved.get(part, 0))
        arrivals = _receipts_within(bundle, day, part, 365, overlay)
        waiting = sorted(competing.get(part, []), key=lambda row: row["rul"]["p50"])
        result[part] = {
            "part_number": part,
            "description": component_type["name"],
            "on_hand": on_hand,
            "reserved": min(held, on_hand),
            "available": max(on_hand - held, 0),
            "on_order": len(arrivals),
            "next_receipt": bundle.date_of(min(arrivals)).isoformat() if arrivals else None,
            "next_receipt_in_days": (min(arrivals) - day) if arrivals else None,
            "lead_time_days": int(component_type["lead_time_days"]),
            "additive_printable": bool(bundle.printable[index]),
            "reorder_level": int(component_type["reorder_level"]),
            "competing_components": [row["id"] for row in waiting],
            "competing_rul_days": [float(row["rul"]["p50"]) for row in waiting],
        }
    return result


def spare_check(
    position: dict[str, Any], component_id: str, rul_p10: float, own_reservation: int = 0
) -> dict[str, Any]:
    """Spare status for one component; a unit already reserved for its own work counts."""
    queue = position["competing_components"]
    rank = queue.index(component_id) + 1 if component_id in queue else 1
    supply = position["available"] + own_reservation
    arriving = (
        position["on_order"]
        if position["next_receipt_in_days"] is not None and (position["next_receipt_in_days"] <= 30)
        else 0
    )
    lead_exceeds = position["lead_time_days"] > rul_p10
    printable = bool(position.get("additive_printable"))
    if supply >= 1 and rank <= supply:
        status = "available"
    elif printable:
        # Project Forge: no unit for this component, but the part can be printed in a day.
        status = "additive_print"
    elif supply >= 1:
        status = "contested"
    else:
        status = "short"
    shortfall = len(queue) > supply + arriving and not printable
    # The shortfall bites when the first component without a unit is expected to fail.
    first_unserved = supply + arriving
    ruls = position.get("competing_rul_days", [])
    shortfall_in = round(ruls[first_unserved]) if shortfall and first_unserved < len(ruls) else None
    note = None
    if shortfall:
        note = (
            f"{len(queue)} components may need {position['part_number']} within ~30 days; "
            f"{supply} available, {arriving} arriving in 30 days."
        )
    return {
        **{
            k: position[k]
            for k in ("part_number", "on_hand", "reserved", "on_order", "next_receipt")
        },
        "lead_time_days": PRINT_DAYS if status == "additive_print" else position["lead_time_days"],
        "supplier_lead_time_days": position["lead_time_days"],
        "additive_printable": printable,
        "available": supply,
        "status": status,
        "queue_position": rank,
        "fleet_demand_30d": len(queue),
        "fleet_shortfall": shortfall,
        "lead_time_exceeds_rul": bool(
            status not in ("available", "additive_print") and lead_exceeds
        ),
        "shortfall_in_days": shortfall_in,
        "note": note,
    }


# Advisories ---------------------------------------------------------------------------------
def _action(
    state: str, criticality: int, risk14: float, rul: dict[str, float], sustained: bool
) -> dict[str, Any]:
    if criticality >= 4 and (
        risk14 >= priority_config()["ground_now"]["risk_14d"] or rul["p10"] <= 1
    ):
        return {"code": "ground_now", "label": "Ground and replace now", "within_days": 0}
    if risk14 >= 0.3 or rul["p50"] <= 21 or state in ("critical", "degraded"):
        days = max(1, math.floor(rul["p10"] * 0.7))
        return {
            "code": "replace_within",
            "label": f"Replace within {days} days",
            "within_days": days,
        }
    if sustained or state == "watch":
        return {"code": "inspect", "label": "Inspect at next opportunity", "within_days": None}
    return {"code": "monitor", "label": "Continue monitoring", "within_days": None}


def _queue_days(bundle: FleetBundle, day: int, agency: str) -> float:
    load = bundle.agency_load(day + 1).get(agency, 0)
    bays = int(bundle.agencies[agency]["bays"])
    return max(0, load - bays + 1) * float(bundle.agencies[agency]["avg_turnaround_days"]) / bays


def build_advisories(
    bundle: FleetBundle, offset: int, overlay: Overlay = EMPTY_OVERLAY
) -> list[dict[str, Any]]:  # noqa: C901
    config = priority_config()
    weights = config["weights"]
    day = bundle.replay_start_day + offset
    states = component_states(bundle, offset, overlay)
    positions = spare_position(bundle, offset, overlay, states)
    arrays = bundle.arrays
    open_aircraft = {wo["aircraft"] for wo in open_recorded(bundle, day + 1, overlay)}
    advisories = []
    for row in states:
        slot = row["slot"]
        if row["state"] in ("failed", "under_maintenance"):
            continue
        if not (row["state"] != "healthy" or row["risk30"] >= 0.2 or row["anomaly_sustained"]):
            continue
        component_type = bundle.type_by_code[row["type"]]
        record = bundle.slots[slot]
        criticality = int(component_type["criticality"])
        own = sum(
            1
            for work in overlay.planned_work
            if work.get("component_id") == record["id"]
            and work["status"] in ("planned", "approved", "in_progress", "awaiting_verification")
        )
        spare = spare_check(
            positions[component_type["part_number"]], row["id"], row["rul"]["p10"], min(own, 1)
        )
        queue_days = _queue_days(bundle, day, component_type["agency"])
        repair = float(component_type["repair_days"])
        if spare["status"] == "additive_print":
            spare_wait = float(PRINT_DAYS)
        elif spare["available"] >= 1:
            spare_wait = 0.0
        elif spare["next_receipt"]:
            spare_wait = float(positions[spare["part_number"]]["next_receipt_in_days"] or 0)
        else:
            spare_wait = float(spare["lead_time_days"])
        act_now = round(repair * 0.7 + queue_days + spare_wait, 1)
        run_to_failure = round(
            repair * (1.25 if criticality >= 4 else 1.0) + queue_days + spare_wait + 1.0, 1
        )
        expected_rtf = round(row["risk30"] * run_to_failure, 1)
        action = _action(
            row["state"], criticality, row["risk14"], row["rul"], row["anomaly_sustained"]
        )

        risk_factor = max(row["risk14"], 0.6 * row["risk30"])
        spare_factor = (
            1.0
            if spare["lead_time_exceeds_rul"]
            else 0.5
            if (spare["status"] != "available" or spare["fleet_shortfall"])
            else 0.0
        )
        factors = {
            "failure_risk": risk_factor,
            "criticality": criticality / 5.0,
            "remaining_life": min(1.0, 10.0 / max(row["rul"]["p50"], 1.0)),
            "spare_shortfall": spare_factor,
            "availability_impact": min(1.0, expected_rtf / 10.0)
            if record["aircraft"] not in open_aircraft
            else 0.0,
        }
        score = sum(weights[name] * value for name, value in factors.items())
        level = next((band for band in ("P1", "P2", "P3") if score >= config["bands"][band]), "P4")

        mean5 = arrays["mean5"][slot, offset]
        contributing = sorted(
            (
                {
                    "name": parameter["name"],
                    "unit": parameter["unit"],
                    "deviation_sigma": round(float(mean5[k]), 2),
                }
                for k, parameter in enumerate(component_type["parameters"])
                if not math.isnan(float(mean5[k]))
            ),
            key=lambda item: -abs(float(item["deviation_sigma"])),
        )
        attribution = [
            {
                "factor": item["factor"],
                "label": item["factor"].split(":", 1)[1]
                if item["factor"].startswith("parameter:")
                else FACTOR_LABELS.get(item["factor"], item["factor"]),
                "contribution": item["contribution"],
            }
            for item in bundle.attributions.get(f"{slot}:{offset}", [])
        ]
        hi_before = float(arrays["hi"][slot, max(0, offset - 20)])
        missing_rate = float(arrays["missing_rate"][slot, offset])
        stale = float(arrays["days_since"][slot, offset])
        width = row["rul"]["p90"] - row["rul"]["p10"]
        unwarned = component_type.get("unwarned_failure_share")
        notes = []
        if missing_rate > 0.1:
            notes.append(f"{missing_rate:.0%} of recent readings missing")
        if stale >= 3:
            notes.append(f"latest reading {stale:.0f} days old")
        notes.append(f"RUL interval width {width:.0f} days")
        if unwarned is not None:
            notes.append(
                f"{unwarned:.0%} of recent {component_type['name'].lower()} failures had no "
                "high-risk warning"
            )
        confidence = (
            "low"
            if missing_rate > 0.2 or stale >= 5 or width > 40
            else ("moderate" if width > 20 or missing_rate > 0.1 else "high")
        )
        advisory_id = f"ADV-{record['id']}-{record['serial'].rsplit('-', 1)[-1]}"
        status = overlay.advisory_status.get(advisory_id, {})
        drivers = ", ".join(
            f"{item['name'].lower()} {item['deviation_sigma']:+.1f}σ" for item in contributing[:2]
        )
        explanation = (
            f"{component_type['name']} on {record['aircraft']}: health index {row['hi']:.0f}/100 "
            f"({row['hi'] - hi_before:+.0f} over 20 days). 14-day failure probability "
            f"{row['risk14']:.0%} ({risk_band(row['risk14'])}). Remaining life about "
            f"{row['rul']['p50']:.0f} days (range {row['rul']['p10']:.0f}–{row['rul']['p90']:.0f})."
            f" Largest deviations: {drivers or 'none recorded'}. Recommended: "
            f"{action['label'].lower()}. Spare {spare['part_number']}: {spare['status']}."
        )
        advisories.append(
            {
                "id": advisory_id,
                "component_id": record["id"],
                "aircraft": record["aircraft"],
                "system": component_type["system"],
                "system_name": bundle.systems[component_type["system"]],
                "component_type": component_type["code"],
                "component_name": component_type["name"],
                "serial": record["serial"],
                "criticality": criticality,
                "as_of": bundle.date_of(day).isoformat(),
                "health_state": row["state"],
                "health_index": row["hi"],
                "health_index_20d_ago": round(hi_before, 1),
                "risk_14d": row["risk14"],
                "risk_30d": row["risk30"],
                "risk_band": risk_band(row["risk14"]),
                "rul_days": row["rul"],
                "anomaly_score": row["anomaly"],
                "anomaly_sustained": row["anomaly_sustained"],
                "contributing_parameters": contributing,
                "attribution": attribution,
                "action": action,
                "priority": {
                    "level": level,
                    "score": round(score, 3),
                    "factors": [
                        {
                            "name": name,
                            "weight": weights[name],
                            "value": round(value, 3),
                            "points": round(weights[name] * value, 3),
                        }
                        for name, value in factors.items()
                    ],
                },
                "spare": spare,
                "downtime": {
                    "act_now_days": act_now,
                    "run_to_failure_days": run_to_failure,
                    "queue_days": round(queue_days, 1),
                    "spare_wait_days": spare_wait,
                },
                "availability_impact": {
                    "act_now_aircraft_days": -act_now,
                    "run_to_failure_expected_aircraft_days": -expected_rtf,
                },
                "confidence": {"level": confidence, "notes": notes},
                "explanation": explanation,
                "status": status.get("status", "proposed"),
                "status_reason": status.get("reason"),
                "status_actor": status.get("actor"),
                "status_updated_at": status.get("updated_at"),
                "work_order_id": status.get("work_order_id"),
                "parts_status": overlay.parts_status(status.get("work_order_id")),
            }
        )
    order = {"P1": 0, "P2": 1, "P3": 2, "P4": 3}
    return sorted(
        advisories,
        key=lambda item: (order[item["priority"]["level"]], -float(item["priority"]["score"])),
    )


# Digital twin -------------------------------------------------------------------------------
def _worst(states: list[str]) -> str:
    return max(states, key=lambda state: STATE_RANK[state]) if states else "healthy"


def effective_aircraft_state(
    bundle: FleetBundle, offset: int, overlay: Overlay = EMPTY_OVERLAY
) -> np.ndarray:
    """Availability state per aircraft on the offset day, after workspace decisions:
    closing all of an aircraft's agency work returns it to service, and starting planned
    work grounds it for scheduled maintenance."""
    day = bundle.replay_start_day + offset
    state: np.ndarray = bundle.arrays["aircraft_state"][:, day].astype(int).copy()
    still_open = {wo["aircraft"] for wo in open_recorded(bundle, day, overlay)}
    originally_open = {wo["aircraft"] for wo in bundle.open_work_orders(day)}
    concerns = {
        row["aircraft"]
        for row in component_states(bundle, offset, overlay)
        if row["state"] == "failed"
        or _action(
            row["state"],
            int(bundle.type_by_code[row["type"]]["criticality"]),
            row["risk14"],
            row["rul"],
            row["anomaly_sustained"],
        )["code"]
        == "ground_now"
    }
    completed_mandatory = {
        work.get("impact", {}).get("mandatory_task_id")
        for work in overlay.planned_work
        if work["status"] == "completed"
    }
    overdue = {
        task["aircraft"]
        for task in scheduled_tasks(bundle)
        if task["overdue"] and task["id"] not in completed_mandatory
    }
    for index, aircraft in enumerate(bundle.aircraft):
        identifier = aircraft["id"]
        # Only closed, identifiable recorded work can remove its own restriction.
        # Other findings and mandatory tasks are independently evaluated.
        if (
            state[index] > 0
            and identifier in originally_open
            and identifier not in still_open
            and identifier not in concerns
            and identifier not in overdue
        ):
            state[index] = 0
        if identifier in concerns and state[index] == 0:
            state[index] = 2
        if identifier in overdue and state[index] == 0:
            state[index] = 1
    for work in overlay.in_work():
        state[bundle.aircraft_index[work["aircraft"]]] = 1
    return state


def twin_aircraft(
    bundle: FleetBundle,
    offset: int,
    aircraft_id: str,
    states: list[dict[str, Any]] | None = None,
    overlay: Overlay = EMPTY_OVERLAY,
    availability_states: np.ndarray | None = None,
) -> dict[str, Any]:
    states = states or component_states(bundle, offset, overlay)
    rows = [row for row in states if row["aircraft"] == aircraft_id]
    systems = []
    for code, name in bundle.systems.items():
        members = [row for row in rows if bundle.type_by_code[row["type"]]["system"] == code]
        weights = np.array([bundle.type_by_code[r["type"]]["criticality"] for r in members])
        his = np.array([r["hi"] for r in members])
        worst = max(members, key=lambda r: (STATE_RANK[r["state"]], -r["hi"]))
        systems.append(
            {
                "code": code,
                "name": name,
                "state": _worst([r["state"] for r in members]),
                "health_index": round(float((weights * his).sum() / weights.sum()), 1),
                "driver": worst["id"] if STATE_RANK[worst["state"]] > 0 else None,
                "components": [
                    {
                        **r,
                        "name": bundle.type_by_code[r["type"]]["name"],
                        "criticality": bundle.type_by_code[r["type"]]["criticality"],
                        "serial": bundle.slots[r["slot"]]["serial"],
                    }
                    for r in members
                ],
            }
        )
    critical = [r for r in rows if bundle.type_by_code[r["type"]]["criticality"] >= 3]
    driver = max(critical, key=lambda r: (STATE_RANK[r["state"]], -r["hi"]))
    weights = np.array([bundle.type_by_code[r["type"]]["criticality"] for r in rows])
    if availability_states is None:
        availability_states = effective_aircraft_state(bundle, offset, overlay)
    availability = AVAILABILITY_STATES[int(availability_states[bundle.aircraft_index[aircraft_id]])]
    return {
        "aircraft": aircraft_id,
        "state": _worst([r["state"] for r in critical]),
        "availability_state": availability,
        "health_index": round(
            float((weights * np.array([r["hi"] for r in rows])).sum() / weights.sum()), 1
        ),
        "driver": driver["id"] if STATE_RANK[driver["state"]] > 0 else None,
        "systems": systems,
    }


def heat_grid(bundle: FleetBundle, offset: int, overlay: Overlay = EMPTY_OVERLAY) -> dict[str, Any]:
    states = component_states(bundle, offset, overlay)
    availability = effective_aircraft_state(bundle, offset, overlay)
    rows = []
    for aircraft in bundle.aircraft:
        twin = twin_aircraft(bundle, offset, aircraft["id"], states, overlay, availability)
        rows.append(
            {
                "aircraft": aircraft["id"],
                "state": twin["state"],
                "availability_state": twin["availability_state"],
                "health_index": twin["health_index"],
                "driver": twin["driver"],
                "cells": [
                    {
                        "system": system["code"],
                        "state": system["state"],
                        "health_index": system["health_index"],
                        "driver": system["driver"],
                    }
                    for system in twin["systems"]
                ],
            }
        )
    return {"systems": [{"code": c, "name": n} for c, n in bundle.systems.items()], "rows": rows}


# Fleet summary and KPIs ---------------------------------------------------------------------
def availability_history(
    bundle: FleetBundle,
    days: int = 180,
    end_day: int | None = None,
    overlay: Overlay = EMPTY_OVERLAY,
) -> list[dict[str, Any]]:
    end = bundle.days - 1 if end_day is None else end_day
    state = bundle.arrays["aircraft_state"]
    aircraft = state.shape[0]
    points = []
    for day in range(max(0, end - days + 1), end + 1):
        today = day == bundle.days - 1
        column = (
            effective_aircraft_state(bundle, day - bundle.replay_start_day, overlay)
            if today
            else state[:, day]
        )
        counts = np.bincount(column, minlength=5)
        points.append(
            {
                "date": bundle.date_of(day).isoformat(),
                "availability": round(float(counts[0]) / aircraft, 4),
                **{AVAILABILITY_STATES[i]: int(counts[i]) for i in range(1, 5)},
            }
        )
    return points


def downtime_by_month(bundle: FleetBundle, months: int = 12) -> list[dict[str, Any]]:
    state = bundle.arrays["aircraft_state"]
    buckets: dict[str, Counter[str]] = defaultdict(Counter)
    for day in range(max(0, bundle.days - months * 31), bundle.days):
        month = bundle.date_of(day).strftime("%Y-%m")
        counts = np.bincount(state[:, day], minlength=5)
        for index in range(1, 5):
            buckets[month][AVAILABILITY_STATES[index]] += int(counts[index])
    return [{"month": month, **counts} for month, counts in sorted(buckets.items())][-months:]


def backlog(bundle: FleetBundle, day: int, overlay: Overlay) -> dict[str, Any]:
    open_orders = open_recorded(bundle, day + 1, overlay)
    remaining = 0.0
    for wo in open_orders:
        if bundle.work_order_phase(wo, day) == "in_work":
            done = (
                wo["done_day"]
                if wo["done_day"] is not None
                else (wo["bay_start_day"] + wo["repair_days"])
            )
            remaining += max(0, done - day)
        else:
            remaining += wo["repair_days"]
    planned = [
        w
        for w in overlay.planned_work
        if w["status"] in ("planned", "approved", "in_progress", "awaiting_verification")
    ]
    remaining += sum(float(w["duration_days"]) for w in planned)
    return {
        "open_work_orders": len(open_orders) + len(planned),
        "recorded_open": len(open_orders),
        "planned_from_advisories": len(planned),
        "man_hours": round(remaining * MAN_HOURS_PER_REPAIR_DAY, 0),
        "man_hours_assumption": f"{MAN_HOURS_PER_REPAIR_DAY:.0f} man-hours per repair day",
    }


def fleet_summary(
    bundle: FleetBundle,
    offset: int,
    overlay: Overlay,
    advisories: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    day = bundle.replay_start_day + offset
    advisories = advisories if advisories is not None else build_advisories(bundle, offset, overlay)
    state = bundle.arrays["aircraft_state"]
    aircraft = state.shape[0]
    current = effective_aircraft_state(bundle, offset, overlay)
    counts = np.bincount(current, minlength=5)
    trailing7 = float((state[:, max(0, day - 6) : day + 1] == 0).mean())
    trailing30 = float((state[:, max(0, day - 29) : day + 1] == 0).mean())
    open_levels = Counter(
        a["priority"]["level"] for a in advisories if a["status"] not in ("completed", "dismissed")
    )
    p1p2_aircraft = {
        a["aircraft"]
        for a in advisories
        if a["priority"]["level"] in ("P1", "P2") and a["status"] not in ("completed", "dismissed")
    }
    available = [bundle.aircraft[i]["id"] for i in range(aircraft) if current[i] == 0]
    parts_at_risk = sorted(
        {
            a["spare"]["part_number"]
            for a in advisories
            if a["spare"]["status"] != "available" or a["spare"]["fleet_shortfall"]
        }
    )
    twin_states = Counter(row["state"] for row in heat_grid(bundle, offset, overlay)["rows"])
    return {
        "as_of": bundle.date_of(day).isoformat(),
        "aircraft": aircraft,
        "availability_today": round(float(counts[0]) / aircraft, 4),
        "availability_7d": round(trailing7, 4),
        "availability_30d": round(trailing30, 4),
        "by_availability_state": {AVAILABILITY_STATES[i]: int(counts[i]) for i in range(5)},
        "by_health_state": dict(twin_states),
        "open_advisories": dict(open_levels),
        "readiness_proxy": round(
            len([tail for tail in available if tail not in p1p2_aircraft]) / aircraft, 4
        ),
        "readiness_proxy_definition": "available and no open P1/P2 advisory (proxy, not an "
        "operational readiness measure)",
        "backlog": backlog(bundle, day, overlay),
        "parts_at_risk": parts_at_risk,
    }


def reliability_kpis(bundle: FleetBundle) -> dict[str, Any]:
    state = bundle.arrays["aircraft_state"]
    fleet_fh = float(bundle.arrays["flight_hours"].sum())
    orders = [wo for wo in bundle.records["work_orders"] if wo["done_day"] is not None]
    unscheduled = [wo for wo in orders if wo["kind"] == "unscheduled"]
    failures_by_type = Counter(
        bundle.slots[wo["slot"]]["type"]
        for wo in bundle.records["work_orders"]
        if wo["kind"] == "unscheduled" and wo["slot"] is not None
    )
    active = [wo["done_day"] - wo["bay_start_day"] + 1 for wo in unscheduled]
    turnaround = [wo["done_day"] - wo["opened_day"] for wo in orders]
    downtime = [wo["done_day"] - wo["opened_day"] for wo in orders]
    available_days = float((state == 0).sum())
    aircraft_days = float(state.size)
    mtbf_days = available_days / max(len(unscheduled), 1)
    mttr_days = float(np.mean(active)) if active else 0.0
    mtbm_days = available_days / max(len(orders), 1)
    mdt_days = float(np.mean(downtime)) if downtime else 0.0
    # Repeat defect: a failure on the same position within 30 days of the previous replacement.
    last_done: dict[int, int] = {}
    repeats = 0
    for wo in sorted(unscheduled, key=lambda w: w["opened_day"]):
        slot = wo["slot"]
        if slot in last_done and wo["opened_day"] - last_done[slot] <= 30:
            repeats += 1
        last_done[slot] = wo["done_day"]
    issues = [wo for wo in orders if wo["part"] is not None]
    by_type = []
    for component_type in bundle.types:
        count = failures_by_type.get(component_type["code"], 0)
        aircraft_fh = fleet_fh  # one position of each type per aircraft
        by_type.append(
            {
                "type": component_type["code"],
                "name": component_type["name"],
                "system": component_type["system"],
                "failures": count,
                "mtbf_flight_hours": round(aircraft_fh / count, 0) if count else None,
                "failure_rate_per_1000_fh": round(1000 * count / aircraft_fh, 3),
                "unwarned_failure_share": component_type.get("unwarned_failure_share"),
            }
        )
    return {
        "period": {"from": bundle.start.isoformat(), "to": bundle.as_of.isoformat()},
        "fleet_availability": round(available_days / aircraft_days, 4),
        "inherent_availability": round(mtbf_days / (mtbf_days + mttr_days), 4),
        "operational_availability": round(mtbm_days / (mtbm_days + mdt_days), 4),
        "mtbf_aircraft_days": round(mtbf_days, 1),
        "mttr_days": round(mttr_days, 2),
        "mtbm_aircraft_days": round(mtbm_days, 1),
        "mean_downtime_days": round(mdt_days, 2),
        "turnaround_days": round(float(np.mean(turnaround)), 2) if turnaround else 0.0,
        "failure_rate_per_1000_fh": round(1000 * len(unscheduled) / fleet_fh, 3),
        "unscheduled_to_scheduled_ratio": round(
            len(unscheduled) / max(len(orders) - len(unscheduled), 1), 2
        ),
        "repeat_defect_rate": round(repeats / max(len(unscheduled), 1), 4),
        "spare_fill_rate": round(
            sum(1 for wo in issues if wo["spare_wait_days"] == 0) / max(len(issues), 1), 4
        ),
        "on_time_rate": round(
            sum(1 for wo in orders if wo["done_day"] <= wo["promised_day"]) / max(len(orders), 1), 4
        ),
        "downtime_days_by_cause": {
            AVAILABILITY_STATES[i]: int((state == i).sum()) for i in range(1, 5)
        },
        "by_type": by_type,
        "definitions": {
            "fleet_availability": "available aircraft-days / all aircraft-days",
            "inherent_availability": "MTBF / (MTBF + MTTR), aircraft-days",
            "operational_availability": "MTBM / (MTBM + mean downtime incl. spare and agency "
            "waits)",
        },
    }


# Inventory and demand -----------------------------------------------------------------------
def demand_forecast(
    bundle: FleetBundle,
    offset: int,
    part: str,
    horizon: int,
    overlay: Overlay,
    position: dict[str, Any] | None = None,
) -> dict[str, Any]:
    day = bundle.replay_start_day + offset
    index = bundle.part_index[part]
    component_type = bundle.types[index]
    hazard = bundle.background_hazard
    contributors = []
    in_work = {
        wo["slot"] for wo in open_recorded(bundle, day + 1, overlay) if wo["slot"] is not None
    }
    probabilities = []
    for slot in np.flatnonzero(bundle.slot_type_index == index):
        if int(slot) in in_work:
            continue
        replaced = bundle.slots[int(slot)]["id"] in overlay.replaced_components
        probability = failure_probability(
            np.array(NEW_PART["rul"]) if replaced else bundle.arrays["rul"][slot, offset],
            0.0 if replaced else float(bundle.arrays["risk30"][slot, offset]),
            horizon,
            float(hazard[slot]),
        )
        probabilities.append(probability)
        if probability >= 0.05:
            contributors.append(
                {
                    "component_id": bundle.slots[int(slot)]["id"],
                    "probability": round(probability, 3),
                }
            )
    hard_time = component_type.get("hard_time_fh")
    scheduled = 0
    if hard_time:
        fh_per_day = bundle.arrays["flight_hours"][:, max(0, day - 29) : day + 1].mean(axis=1)
        for slot in np.flatnonzero(bundle.slot_type_index == index):
            remaining = hard_time - float(bundle.arrays["hours"][slot, offset])
            rate = max(float(fh_per_day[bundle.slot_aircraft_index[slot]]), 0.3)
            if remaining / rate <= horizon:
                scheduled += 1
    planned = sum(
        1 for w in overlay.planned_work if w.get("part") == part and w["status"] == "planned"
    )
    p = np.array(probabilities)
    expected = float(p.sum()) + scheduled + planned
    spread = math.sqrt(float((p * (1 - p)).sum()))
    issues = [
        t
        for t in bundle.records["transactions"]
        if t["part"] == part and t["kind"] == "issue" and t["day"] <= day
    ]
    window = max(1, day - bundle.recent_start_day + 1)
    moving_average = len(issues) * horizon / window
    position = position or spare_position(bundle, offset, overlay)[part]
    supply = position["available"] + len(_receipts_within(bundle, day, part, horizon, overlay))
    z = (supply + 0.5 - expected) / max(spread, 1e-6)
    shortfall = 0.5 * math.erfc(z / math.sqrt(2))
    return {
        "part_number": part,
        "horizon_days": horizon,
        "expected": round(expected, 2),
        "p10": max(0, round(expected - 1.2816 * spread)),
        "p90": round(expected + 1.2816 * spread),
        "predicted_failure_demand": round(float(p.sum()), 2),
        "scheduled_demand": scheduled + planned,
        "baseline_moving_average": round(moving_average, 2),
        "supply_within_horizon": supply,
        "shortfall_probability": round(float(shortfall), 3),
        "contributors": sorted(contributors, key=lambda c: -float(c["probability"]))[:10],
        "method": "sum of calibrated failure probabilities + scheduled replacements; normal "
        "approximation for the range",
    }


def inventory(bundle: FleetBundle, offset: int, overlay: Overlay) -> list[dict[str, Any]]:
    positions = spare_position(bundle, offset, overlay)
    rows = []
    for component_type in bundle.types:
        part = component_type["part_number"]
        position = positions[part]
        forecast = {
            h: demand_forecast(bundle, offset, part, h, overlay, position) for h in (30, 60, 90)
        }
        risk = forecast[30]["shortfall_probability"]
        # Short = likely to run out within 30 days even counting parts already on order.
        empty = position["available"] == 0 and forecast[30]["expected"] >= 0.5
        status = "short" if risk >= 0.6 else "at_risk" if risk >= 0.25 or empty else "ok"
        if position["additive_printable"] and (status != "ok" or position["available"] == 0):
            status = "print"  # Project Forge prints the gap; the stock-out probability stays as is
        rows.append(
            {
                **{
                    k: v
                    for k, v in position.items()
                    if k not in ("competing_components", "competing_rul_days")
                },
                "system": component_type["system"],
                "criticality": component_type["criticality"],
                "unit_cost": component_type["unit_cost"],
                "repairable": component_type["repairable"],
                "demand": {
                    str(h): {
                        k: forecast[h][k]
                        for k in (
                            "expected",
                            "p10",
                            "p90",
                            "shortfall_probability",
                            "baseline_moving_average",
                        )
                    }
                    for h in forecast
                },
                "status": status,
                "competing_components": position["competing_components"],
            }
        )
    order = {"print": 0, "short": 1, "at_risk": 2, "ok": 3}
    return sorted(rows, key=lambda r: (order[r["status"]], -r["demand"]["30"]["expected"]))


# Planning -----------------------------------------------------------------------------------
def scheduled_tasks(bundle: FleetBundle) -> list[dict[str, Any]]:
    """Mandatory periodic inspections and hard-time replacements (never overridden by models)."""
    interval = float(bundle.records["meta"]["config"]["inspection_interval_fh"])
    fh = bundle.arrays["flight_hours"]
    tasks = []
    for index, aircraft in enumerate(bundle.aircraft):
        rate = max(float(fh[index, -30:].mean()), 0.3)
        remaining = interval - float(aircraft["inspection_hours_since"])
        tasks.append(
            {
                "id": f"TASK-INSP-{aircraft['id']}",
                "aircraft": aircraft["id"],
                "task": f"Periodic inspection ({interval:.0f} FH)",
                "kind": "inspection",
                "mandatory": True,
                "remaining_flight_hours": round(remaining, 1),
                "due_in_days": math.floor(remaining / rate),
                "due_date": bundle.date_of(
                    bundle.days - 1 + math.floor(remaining / rate)
                ).isoformat(),
                "overdue": remaining < 0,
                "component_id": None,
            }
        )
    for slot, record in enumerate(bundle.slots):
        component_type = bundle.type_by_code[record["type"]]
        if not component_type.get("hard_time_fh"):
            continue
        rate = max(float(fh[bundle.slot_aircraft_index[slot], -30:].mean()), 0.3)
        remaining = float(component_type["hard_time_fh"]) - float(record["hours_since_install"])
        if remaining / rate <= 45:
            tasks.append(
                {
                    "id": f"TASK-HT-{record['id']}",
                    "aircraft": record["aircraft"],
                    "task": f"Hard-time replacement: {component_type['name']}",
                    "kind": "hard_time",
                    "mandatory": True,
                    "remaining_flight_hours": round(remaining, 1),
                    "due_in_days": math.floor(remaining / rate),
                    "due_date": bundle.date_of(
                        bundle.days - 1 + math.floor(remaining / rate)
                    ).isoformat(),
                    "overdue": remaining < 0,
                    "component_id": record["id"],
                }
            )
    return sorted(tasks, key=lambda task: task["due_in_days"])


def bay_schedule(
    bundle: FleetBundle, overlay: Overlay, past_days: int = 21, future_days: int = 30
) -> dict[str, Any]:
    """Bay lanes per agency with recorded, projected and planned work for a Gantt view."""
    end_day = bundle.days - 1
    window_start = end_day - past_days
    lanes: dict[str, list[list[tuple[int, int]]]] = {
        agency: [[] for _ in range(int(info["bays"]))] for agency, info in bundle.agencies.items()
    }
    bars = []

    def assign(agency: str, start: int, end: int) -> int:
        for index, lane in enumerate(lanes[agency]):
            if all(end < s or start > e for s, e in lane):
                lane.append((start, end))
                return index
        lanes[agency].append([(start, end)])
        return len(lanes[agency]) - 1

    for wo in sorted(bundle.records["work_orders"], key=lambda w: w["opened_day"]):
        done = wo["done_day"]
        if done is not None and done < window_start:
            continue
        start = wo["bay_start_day"]
        if wo["id"] in overlay.closed_recorded:
            done = end_day  # returned to service in the workspace today
        projected = done is None
        if start is None and wo["id"] in overlay.closed_recorded:
            start = end_day
        if start is None:
            bars.append(
                {
                    "id": wo["id"],
                    "agency": wo["agency"],
                    "lane": None,
                    "aircraft": wo["aircraft"],
                    "label": wo["finding"],
                    "kind": wo["kind"],
                    "status": "waiting",
                    "waiting_for": "spares"
                    if wo["part"] and wo["allocated_day"] is None
                    else "bay",
                    "start": bundle.date_of(max(wo["opened_day"] + 1, window_start)).isoformat(),
                    "end": bundle.date_of(end_day).isoformat(),
                    "projected": False,
                    "component_id": bundle.slots[wo["slot"]]["id"]
                    if wo["slot"] is not None
                    else None,
                }
            )
            continue
        finish = done if done is not None else start + wo["repair_days"] - 1
        bars.append(
            {
                "id": wo["id"],
                "agency": wo["agency"],
                "lane": assign(wo["agency"], start, finish),
                "aircraft": wo["aircraft"],
                "label": wo["finding"],
                "kind": wo["kind"],
                "status": "open" if projected else "closed",
                "waiting_for": None,
                "start": bundle.date_of(start).isoformat(),
                "end": bundle.date_of(finish).isoformat(),
                "projected": projected,
                "component_id": bundle.slots[wo["slot"]]["id"] if wo["slot"] is not None else None,
            }
        )
    for work in overlay.planned_work:
        if work["status"] not in ("planned", "approved", "in_progress", "awaiting_verification"):
            continue
        start = bundle.day_of(work["planned_start"])
        finish = start + max(1, math.ceil(float(work["duration_days"]))) - 1
        bars.append(
            {
                "id": work["id"],
                "agency": work["agency_id"],
                "lane": assign(work["agency_id"], start, finish),
                "aircraft": work["aircraft"],
                "label": work["title"],
                "kind": "predictive",
                "status": "planned",
                "waiting_for": None,
                "start": bundle.date_of(start).isoformat(),
                "end": bundle.date_of(finish).isoformat(),
                "projected": True,
                "component_id": work.get("component_id"),
            }
        )
    return {
        "from": bundle.date_of(window_start).isoformat(),
        "to": bundle.date_of(end_day + future_days).isoformat(),
        "today": bundle.as_of.isoformat(),
        "agencies": [
            {**info, "lanes": max(len(lanes[agency]), int(info["bays"]))}
            for agency, info in bundle.agencies.items()
        ],
        "bars": bars,
        "tasks_due": [t for t in scheduled_tasks(bundle) if t["due_in_days"] <= future_days],
    }
