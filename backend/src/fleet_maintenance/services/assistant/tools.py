"""Allowlisted copilot tools.

Each tool wraps an existing fleet-health service; none computes predictions, schedules or
simulations itself. Tools receive typed, validated arguments plus the chat context (timeline
date, selected records) and return:

* ``data`` — compact JSON given to the model (never the hidden simulation truth table);
* ``artifacts`` — UI cards built from the same service output, so displayed numbers come from
  the services rather than from model text;
* ``citations`` — real record IDs with links into the existing pages.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal, cast

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.orm import Session

from fleet_maintenance.api.dependencies import Actor
from fleet_maintenance.science.fleet import decisions
from fleet_maintenance.science.fleet.bundle import FleetBundle
from fleet_maintenance.services import fleet_health as service

# Same role rule as the Simulator route (supervisors are always allowed).
SCENARIO_ROLES = {"fleet_manager", "planner", "supervisor"}
# Same Monte Carlo settings as the Simulator page defaults, so results are comparable.
SIM_HORIZON, SIM_RUNS, SIM_SEED = 30, 300, 7


class ToolError(Exception):
    """A tool could not run; the message is safe to show to the model and the user."""


@dataclass
class Context:
    as_of: date | None = None
    aircraft_id: str | None = None
    component_id: str | None = None
    advisory_id: str | None = None
    part_number: str | None = None
    scenario_id: str | None = None


@dataclass
class ToolResult:
    data: dict[str, Any]
    artifacts: list[dict[str, Any]] = field(default_factory=list)
    citations: list[dict[str, Any]] = field(default_factory=list)


def _cite(kind: str, record_id: str, label: str, href: str) -> dict[str, Any]:
    return {"id": record_id, "kind": kind, "label": label, "href": href}


def _r(value: Any, digits: int = 3) -> Any:
    return round(float(value), digits) if isinstance(value, (int, float)) else value


def _date_label(session: Session, context: Context) -> tuple[FleetBundle, int, bool]:
    bundle = service.active_bundle(session)
    if context.as_of and context.as_of > bundle.as_of:
        raise ToolError("The selected date is after the latest scored date.")
    offset = service.offset_for(bundle, context.as_of)
    return bundle, offset, offset != bundle.replay_offset(None)


# Argument models --------------------------------------------------------------------------
class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class NoArgs(Strict):
    pass


class AircraftArgs(Strict):
    aircraft_id: str | None = Field(default=None, pattern=r"^AC-\d{3}$")


class RegisteredAircraftArgs(Strict):
    aircraft_id: str | None = Field(default=None, pattern=r"^REG-[a-f0-9]{20}$")


class FindingArgs(Strict):
    advisory_id: str | None = Field(default=None, max_length=80)
    component_id: str | None = Field(default=None, max_length=40)


class SensorArgs(Strict):
    component_id: str | None = Field(default=None, max_length=40)
    days: int = Field(default=60, ge=7, le=180)


class RecordArgs(Strict):
    aircraft_id: str | None = Field(default=None, pattern=r"^AC-\d{3}$")
    component_id: str | None = Field(default=None, max_length=40)
    status: Literal["open", "closed"] | None = None
    limit: int = Field(default=8, ge=1, le=20)


class SpareArgs(Strict):
    part_number: str | None = Field(default=None, max_length=20)
    only_at_risk: bool = False


class PlanArgs(Strict):
    component_id: str | None = Field(default=None, max_length=40)
    start_days: list[int] = Field(default_factory=lambda: [0, 7, 14], min_length=1, max_length=4)


class ScenarioArgs(Strict):
    change: Literal[
        "spare_delay", "extra_bay_capacity", "early_replacement", "schedule_maintenance"
    ]
    part_number: str | None = Field(default=None, max_length=20)
    delay_days: int | None = Field(default=None, ge=1, le=120)
    agency_id: str | None = Field(default=None, max_length=20)
    extra_bays: int | None = Field(default=None, ge=1, le=5)
    component_id: str | None = Field(default=None, max_length=40)
    start_in_days: int | None = Field(default=None, ge=0, le=59)
    priority_levels: list[Literal["P1", "P2", "P3"]] | None = None


# Tools ------------------------------------------------------------------------------------
def fleet_summary(session: Session, actor: Actor, ctx: Context, args: NoArgs) -> ToolResult:
    bundle, offset, replay = _date_label(session, ctx)
    s = service.summary(session, ctx.as_of)
    trend = service.availability_trend(session, ctx.as_of)
    recent = trend["history"][-14:]
    causes = ("scheduled_maintenance", "unscheduled_repair", "awaiting_spares", "awaiting_agency")
    data = {
        "as_of": s["as_of"],
        "replay": replay,
        "aircraft": s["aircraft"],
        "availability_today": _r(s["availability_today"]),
        "availability_7d": _r(s["availability_7d"]),
        "by_availability_state": s["by_availability_state"],
        "open_advisories": s["open_advisories"],
        "backlog": s["backlog"],
        "parts_at_risk": s["parts_at_risk"],
        "observed_last_14_days": [
            {
                "date": p["date"],
                "availability": _r(p["availability"]),
                **{c: p.get(c) for c in causes},
            }
            for p in recent
        ],
        "forecast_30d": {
            k: _r(v) if not isinstance(v, dict) else v for k, v in s["forecast_30d"].items()
        },
        "notes": "availability values are fractions of the fleet; forecast is Monte Carlo "
        "(P10/P50/P90) from the existing engine",
    }
    chart = {
        "type": "series",
        "title": "Fleet availability — observed (last 14 days)",
        "label": "observed",
        "unit": "fraction available",
        "dates": [p["date"] for p in recent],
        "series": [{"name": "Availability", "values": [p["availability"] for p in recent]}],
    }
    return ToolResult(data, [chart], [_cite("page", "DASHBOARD", "Fleet dashboard", "/dashboard")])


def existing_forecast(session: Session, actor: Actor, ctx: Context, args: NoArgs) -> ToolResult:
    _, _, replay = _date_label(session, ctx)
    s = service.summary(session, ctx.as_of)
    trend = service.availability_trend(session, ctx.as_of)
    points = trend["forecast"]
    f = s["forecast_30d"]
    data = {
        "as_of": s["as_of"],
        "replay": replay,
        "kind": "forecast",
        "availability_mean": _r(f["availability_mean"]),
        "p10": _r(f["availability_p10"]),
        "p50": _r(f["availability_p50"]),
        "p90": _r(f["availability_p90"]),
        "aircraft_days_lost": _r(f["aircraft_days_lost"], 1),
        "by_cause": f["by_cause"],
        "expected_failures": _r(f["expected_failures"], 2),
        "horizon_days": f["horizon_days"],
        "runs": f["runs"],
        "method": trend["definition"],
    }
    chart = {
        "type": "series",
        "title": "30-day availability forecast",
        "label": "forecast",
        "unit": "fraction available",
        "dates": [p["date"] for p in points],
        "series": [
            {"name": "P50", "values": [p["p50"] for p in points]},
            {"name": "P10", "values": [p["p10"] for p in points]},
            {"name": "P90", "values": [p["p90"] for p in points]},
        ],
    }
    return ToolResult(
        data, [chart], [_cite("page", "DASHBOARD", "Fleet dashboard forecast", "/dashboard")]
    )


def aircraft_health(session: Session, actor: Actor, ctx: Context, args: AircraftArgs) -> ToolResult:
    tail = args.aircraft_id or ctx.aircraft_id
    if not tail:
        raise ToolError("No aircraft selected. Ask the user which aircraft (e.g. AC-017).")
    d = service.aircraft_detail(session, tail, ctx.as_of)
    components = sorted(
        (c for system in d["systems"] for c in system["components"]),
        key=lambda c: (decisions.STATE_RANK[c["state"]], -c["risk14"]),
        reverse=True,
    )[:8]
    open_adv = [a for a in d["advisories"] if a["status"] not in ("completed", "dismissed")]
    data = {
        "aircraft": tail,
        "as_of": d["as_of"],
        "replay": d["replay"],
        "state": d["state"],
        "availability_state": d["availability_state"],
        "health_index": d["health_index"],
        "worst_components": [
            {
                "component_id": c["id"],
                "name": c["name"],
                "state": c["state"],
                "hi": c["hi"],
                "risk_14d": _r(c["risk14"]),
                "rul_days": c["rul"],
            }
            for c in components
        ],
        "open_findings": [
            {
                "advisory_id": a["id"],
                "component": a["component_name"],
                "priority": a["priority"]["level"],
                "action": a["action"]["label"],
                "status": a["status"],
            }
            for a in open_adv[:6]
        ],
        "recent_work_orders": [
            {
                "id": w["id"],
                "kind": w["kind"],
                "finding": w["finding"],
                "status": w["status"],
                "opened": w["opened"],
            }
            for w in d["work_orders"][:5]
        ],
    }
    cites = [_cite("aircraft", tail, f"{tail} aircraft record", f"/aircraft/{tail}")]
    cites += [
        _cite("finding", a["id"], f"{a['component_name']} finding", f"/health/{a['component_id']}")
        for a in open_adv[:6]
    ]
    cites += [
        _cite(
            "work_order",
            w["id"],
            f"{w['id']} work order",
            f"/maintenance?view=register&aircraft={tail}",
        )
        for w in d["work_orders"][:5]
    ]
    return ToolResult(data, [], cites)


def registered_aircraft(
    session: Session, actor: Actor, ctx: Context, args: RegisteredAircraftArgs
) -> ToolResult:
    from fleet_maintenance.services.registration import detail

    identifier = args.aircraft_id or ctx.aircraft_id
    if not identifier or not identifier.startswith("REG-"):
        raise ToolError("Select a registered aircraft first")
    row = detail(session, identifier, ctx.as_of)
    data = {
        key: row[key]
        for key in (
            "id",
            "tail_number",
            "aircraft_type",
            "base",
            "as_of",
            "flight_hours",
            "cycles",
            "availability_state",
            "assessment_status",
            "limitations",
        )
    }
    data["component_count"] = len(row["components"])
    data["requirements"] = [r for r in row["records"] if r["kind"] == "maintenance_requirement"][:8]
    data["provenance"] = "user_supplied, unassessed"
    return ToolResult(
        data,
        citations=[
            _cite(
                "aircraft",
                identifier,
                f"{row['tail_number']} onboarding records",
                f"/aircraft/registered/{identifier}",
            )
        ],
    )


def priority_findings(
    session: Session, actor: Actor, ctx: Context, args: AircraftArgs
) -> ToolResult:
    bundle, _, _ = _date_label(session, ctx)
    _, _, items = service.advisories(session, ctx.as_of)
    tail = args.aircraft_id or ctx.aircraft_id
    rows = sorted(
        (
            a
            for a in items
            if a["status"] not in {"completed", "dismissed"} and (not tail or a["aircraft"] == tail)
        ),
        key=lambda a: (-a["priority"]["score"], a["id"]),
    )[:8]
    return ToolResult(
        {
            "as_of": (ctx.as_of or bundle.as_of).isoformat(),
            "scope": tail or "fleet",
            "findings": [
                {
                    "id": a["id"],
                    "aircraft": a["aircraft"],
                    "component": a["component_name"],
                    "priority": a["priority"]["level"],
                    "score": a["priority"]["score"],
                    "action": a["action"]["label"],
                    "factors": sorted(a["priority"]["factors"], key=lambda f: -f["points"])[:2],
                }
                for a in rows
            ],
        },
        citations=[
            _cite(
                "finding",
                a["id"],
                f"{a['aircraft']} · {a['component_name']}",
                f"/health/{a['component_id']}",
            )
            for a in rows
        ],
    )


def _find_advisory(session: Session, ctx: Context, args: FindingArgs) -> dict[str, Any]:
    _, _, items = service.advisories(session, ctx.as_of)
    wanted_id = args.advisory_id or (None if args.component_id else ctx.advisory_id)
    component = args.component_id or ctx.component_id
    for item in items:
        if (wanted_id and item["id"] == wanted_id) or (
            not wanted_id and component and item["component_id"] == component
        ):
            return item
    raise ToolError("No finding matches that selection on the selected date.")


def finding_details(session: Session, actor: Actor, ctx: Context, args: FindingArgs) -> ToolResult:
    a = _find_advisory(session, ctx, args)
    data = {
        "advisory_id": a["id"],
        "aircraft": a["aircraft"],
        "component_id": a["component_id"],
        "component": a["component_name"],
        "as_of": a["as_of"],
        "status": a["status"],
        "health_state": a["health_state"],
        "health_index": a["health_index"],
        "health_index_20d_ago": a["health_index_20d_ago"],
        "risk_14d": _r(a["risk_14d"]),
        "risk_30d": _r(a["risk_30d"]),
        "rul_days": a["rul_days"],
        "rul_interval": "P10–P90 conformal interval, days",
        "anomaly_score": _r(a["anomaly_score"]),
        "anomaly_sustained": a["anomaly_sustained"],
        "contributing_parameters": a["contributing_parameters"],
        "attribution": [x for x in a["attribution"] if abs(x["contribution"]) > 0.01][:5],
        "attribution_method": "occlusion attribution (SHAP substitute); not causal proof",
        "priority": a["priority"],
        "recommended_action": a["action"]["label"],
        "spare": {
            k: a["spare"][k]
            for k in (
                "part_number",
                "available",
                "on_order",
                "next_receipt",
                "lead_time_days",
                "status",
                "lead_time_exceeds_rul",
            )
        },
        "downtime_days": a["downtime"],
        "confidence": a["confidence"],
    }
    prediction = {
        "type": "prediction",
        "label": "forecast",
        "component_id": a["component_id"],
        "title": f"{a['aircraft']} · {a['component_name']}",
        "health_index": a["health_index"],
        "risk_14d": a["risk_14d"],
        "risk_30d": a["risk_30d"],
        "rul_days": a["rul_days"],
        "priority": a["priority"]["level"],
        "action": a["action"]["label"],
        "confidence": a["confidence"]["level"],
    }
    return ToolResult(
        data,
        [prediction],
        [
            _cite(
                "finding", a["id"], f"{a['component_name']} finding", f"/health/{a['component_id']}"
            ),
            _cite(
                "aircraft",
                a["aircraft"],
                f"{a['aircraft']} aircraft record",
                f"/aircraft/{a['aircraft']}",
            ),
        ],
    )


def sensor_history(session: Session, actor: Actor, ctx: Context, args: SensorArgs) -> ToolResult:
    component = args.component_id or ctx.component_id
    if not component and ctx.advisory_id:
        component = _find_advisory(session, ctx, FindingArgs()).get("component_id")
    if not component:
        raise ToolError("No component selected.")
    h = service.component_health(session, component, ctx.as_of, args.days)
    as_of = h["as_of"]
    # Never pass the hidden simulation truth; drop events dated after the selected date.
    events = [e for e in h["history"] if e["date"] <= as_of][:8]
    dates = h["dates"]
    step = max(1, len(dates) // 30)
    sensors = []
    for sensor in h["sensors"]:
        values = [v for v in sensor["values"] if v is not None]
        sensors.append(
            {
                "name": sensor["name"],
                "unit": sensor["unit"],
                "first": _r(values[0]) if values else None,
                "latest": _r(values[-1]) if values else None,
                "min": _r(min(values)) if values else None,
                "max": _r(max(values)) if values else None,
                "missing_share": _r(1 - len(values) / max(len(sensor["values"]), 1), 2),
            }
        )
    data = {
        "component_id": component,
        "component": h["component"]["name"],
        "as_of": as_of,
        "replay": h["replay"],
        "kind": "observed",
        "window_days": len(dates),
        "sensors": sensors,
        "health_index_first": h["health_index"][0] if h["health_index"] else None,
        "health_index_latest": h["health_index"][-1] if h["health_index"] else None,
        "events": events,
    }
    chart = {
        "type": "series",
        "title": f"{h['component']['name']} sensors — observed",
        "label": "observed",
        "component_id": component,
        "dates": dates[::step],
        "series": [
            {"name": f"{s['name']} ({s['unit']})", "values": s["values"][::step]}
            for s in h["sensors"]
        ],
    }
    cites = [
        _cite(
            "component",
            component,
            f"{h['component']['name']} sensor evidence",
            f"/health/{component}",
        )
    ]
    cites += [
        _cite(
            "work_order", e["work_order"], f"{e['work_order']} work order", f"/health/{component}"
        )
        for e in events
        if e.get("work_order")
    ]
    return ToolResult(data, [chart], cites)


def maintenance_records(
    session: Session, actor: Actor, ctx: Context, args: RecordArgs
) -> ToolResult:
    bundle, _, replay = _date_label(session, ctx)
    tail = args.aircraft_id or ctx.aircraft_id
    if replay:
        if not tail:
            raise ToolError("Select an aircraft to inspect maintenance at a historical cutoff")
        historical = service.aircraft_detail(session, tail, ctx.as_of)
        names = {c["id"]: c["name"] for group in historical["systems"] for c in group["components"]}
        w = {
            "recorded": [
                {
                    **row,
                    "aircraft": tail,
                    "component_name": names.get(row["component_id"], "Not mapped"),
                    "phase": "Not recorded at this cutoff",
                    "promised": None,
                    "late": None,
                    "delay_reason": None,
                }
                for row in historical["work_orders"]
                if not args.status or row["status"] == args.status
            ],
            "planned": [],
        }
    else:
        w = service.work_orders(session, args.status, tail, None)
    component = args.component_id
    limit_date = (ctx.as_of or bundle.as_of).isoformat()
    recorded = [
        r
        for r in w["recorded"]
        if (not component or r["component_id"] == component) and r["opened"] <= limit_date
    ][: args.limit]
    planned = [p for p in w["planned"] if not component or p["component_id"] == component]
    data = {
        "as_of": limit_date,
        "replay": replay,
        "aircraft": tail,
        "recorded": [
            {
                k: r[k]
                for k in (
                    "id",
                    "aircraft",
                    "component_name",
                    "kind",
                    "finding",
                    "status",
                    "phase",
                    "opened",
                    "promised",
                    "completed",
                    "late",
                    "delay_reason",
                )
            }
            for r in recorded
        ],
        "planned_proposals": []
        if replay
        else [
            {
                k: p.get(k)
                for k in (
                    "id",
                    "aircraft",
                    "component_id",
                    "title",
                    "planned_start",
                    "duration_days",
                    "status",
                    "agency_id",
                )
            }
            for p in planned[: args.limit]
        ],
    }
    proposals = cast(list[dict[str, Any]], data["planned_proposals"])
    href = f"/maintenance?view=register{f'&aircraft={tail}' if tail else ''}"
    cites = [_cite("work_order", r["id"], f"{r['id']} work order", href) for r in recorded]
    cites += [
        _cite("work_order", p["id"], f"{p['id']} planned work", "/maintenance?view=work")
        for p in proposals
    ]
    rows = [[r["id"], r["aircraft"], r["finding"], r["status"], r["opened"]] for r in recorded]
    table = {
        "type": "table",
        "title": "Maintenance records",
        "label": "observed",
        "columns": ["Work order", "Aircraft", "Finding", "Status", "Opened"],
        "rows": rows,
    }
    return ToolResult(data, [table] if rows else [], cites)


def spare_availability(session: Session, actor: Actor, ctx: Context, args: SpareArgs) -> ToolResult:
    bundle, offset, replay = _date_label(session, ctx)
    current = service.overlay(session) if not replay else decisions.EMPTY_OVERLAY
    part = args.part_number or ctx.part_number
    rows = decisions.inventory(bundle, offset, current)
    if part:
        rows = [r for r in rows if r["part_number"] == part]
        if not rows:
            raise ToolError(f"Unknown part number {part}.")
    elif args.only_at_risk:
        rows = [r for r in rows if r["status"] != "ok"]
    requests = (
        []
        if replay
        else [r for r in service.part_requests(session) if (not part or r["part"] == part)]
    )
    data = {
        "as_of": bundle.date_of(bundle.replay_start_day + offset).isoformat(),
        "replay": replay,
        "parts": [
            {
                "part_number": r["part_number"],
                "description": r.get("description"),
                "status": r["status"],
                "on_hand": r["on_hand"],
                "reserved": r["reserved"],
                "available": r["available"],
                "on_order": r["on_order"],
                "next_receipt": r["next_receipt"],
                "lead_time_days": r["lead_time_days"],
                "additive_printable": r.get("additive_printable", False),
                "demand_30d": r["demand"]["30"],
            }
            for r in rows[:10]
        ],
        "part_requests_for_planned_work": [
            {
                "id": r["id"],
                "part": r["part"],
                "status": r["status"],
                "needed_by": r["needed_by"],
                "eta": r["eta"],
                "earliest_order_arrival": r["earliest_order_arrival"],
                "at_risk": r["at_risk"],
                "work_order_id": r["work_order_id"],
                "aircraft": r.get("aircraft"),
            }
            for r in requests[:10]
        ],
        "notes": "demand_30d is the existing ML demand forecast (expected, P10–P90, shortfall "
        "probability); 'at_risk' requests cannot arrive before they are needed",
    }
    table = {
        "type": "table",
        "title": "Spare position",
        "label": "observed + forecast",
        "columns": [
            "Part",
            "Status",
            "Available",
            "On order",
            "Next receipt",
            "Lead (d)",
            "Demand 30 d",
            "Shortfall p",
        ],
        "rows": [
            [
                r["part_number"],
                r["status"],
                r["available"],
                r["on_order"],
                r["next_receipt"] or "—",
                r["lead_time_days"],
                r["demand"]["30"]["expected"],
                r["demand"]["30"]["shortfall_probability"],
            ]
            for r in rows[:10]
        ],
    }
    cites = [
        _cite(
            "part",
            r["part_number"],
            f"{r['part_number']} spare position",
            f"/spares?part={r['part_number']}",
        )
        for r in rows[:10]
    ]
    cites += [
        _cite("part_request", r["id"], f"{r['id']} parts request", "/spares?view=requests")
        for r in requests[:10]
    ]
    return ToolResult(data, [table], cites)


def compare_plans(session: Session, actor: Actor, ctx: Context, args: PlanArgs) -> ToolResult:
    bundle, _, replay = _date_label(session, ctx)
    if replay:
        raise ToolError(
            "Plan comparison simulates forward from the latest scored date; return "
            "the timeline to the latest date to compare plans."
        )
    component = args.component_id or ctx.component_id
    if not component and ctx.advisory_id:
        component = _find_advisory(session, ctx, FindingArgs()).get("component_id")
    if not component or component not in bundle.slot_index:
        raise ToolError("Select a component to compare maintenance start dates.")
    current = service.overlay(session)
    days = sorted({d for d in args.start_days if 0 <= d < 60})
    if not days:
        raise ToolError("start_days must be between 0 and 59.")
    options = []
    for day in days:
        impact = service.scenario_preview(bundle, current, bundle.slot_index[component], day)
        options.append(
            {
                "start_in_days": day,
                "start_date": bundle.date_of(bundle.days - 1 + day).isoformat(),
                **impact,
            }
        )
    data = {
        "component_id": component,
        "kind": "simulated",
        "baseline": "current plan (all planned work orders)",
        "options": options,
        "method": "existing scenario preview: Monte Carlo with common random numbers, "
        "differences versus the current plan",
    }
    table = {
        "type": "table",
        "title": f"Maintenance start options · {component}",
        "label": "simulated",
        "columns": ["Start", "Δ availability (pts)", "Δ aircraft-days lost", "Horizon", "Runs"],
        "rows": [
            [
                o["start_date"],
                o["availability_pct_points"],
                o["aircraft_days_lost"],
                o["horizon_days"],
                o["runs"],
            ]
            for o in options
        ],
    }
    return ToolResult(
        data,
        [table],
        [_cite("component", component, f"{component} evidence", f"/health/{component}")],
    )


def what_if(session: Session, actor: Actor, ctx: Context, args: ScenarioArgs) -> ToolResult:
    if ctx.aircraft_id and ctx.aircraft_id.startswith("REG-"):
        raise ToolError("Registered aircraft are not part of the synthetic fleet simulation")
    if actor.role not in SCENARIO_ROLES:
        raise ToolError("Running a scenario needs the fleet manager, planner or supervisor role.")
    bundle, _, replay = _date_label(session, ctx)
    if replay:
        raise ToolError(
            "Scenarios simulate forward from the latest scored date; return the "
            "timeline to the latest date to run one."
        )
    if args.change == "spare_delay":
        part = args.part_number or ctx.part_number
        if not part or part not in bundle.part_index or not args.delay_days:
            raise ToolError("spare_delay needs a known part_number and delay_days.")
        base = int(bundle.types[bundle.part_index[part]]["lead_time_days"])
        kind, params = (
            "spare_unavailable",
            {"part_number": part, "lead_time_days": base + args.delay_days},
        )
        assumption = (
            f"{part} replenishment lead time {base} → {base + args.delay_days} days "
            f"(+{args.delay_days} d) for orders placed in the horizon"
        )
    elif args.change == "extra_bay_capacity":
        if not args.agency_id or not args.extra_bays:
            raise ToolError("extra_bay_capacity needs agency_id and extra_bays (1–5).")
        kind, params = (
            "extra_capacity",
            {"agency_id": args.agency_id, "extra_bays": args.extra_bays},
        )
        assumption = f"+{args.extra_bays} bay(s) at {args.agency_id}"
    elif args.change == "early_replacement":
        levels = args.priority_levels or ["P1"]
        kind, params = "early_replacement", {"priority_levels": levels}
        assumption = f"Early replacement of open {'/'.join(levels)} findings"
    else:
        component = args.component_id or ctx.component_id
        if not component or args.start_in_days is None:
            raise ToolError("schedule_maintenance needs component_id and start_in_days.")
        kind, params = (
            "schedule_maintenance",
            {"component_id": component, "start_in_days": args.start_in_days},
        )
        assumption = f"Replace {component} in {args.start_in_days} days"
    run = service.run_scenario(
        session,
        actor.id,
        f"Copilot: {assumption}"[:120],
        kind,
        params,
        SIM_HORIZON,
        SIM_RUNS,
        SIM_SEED,
    )
    res = run["results"]
    b, s, d = res["baseline"], res["scenario"], res["delta"]
    data = {
        "scenario_id": run["id"],
        "kind": "simulated",
        "horizon_days": run["horizon_days"],
        "runs": run["runs"],
        "seed": run["seed"],
        "baseline_assumptions": f"current plan ({res['baseline_includes_planned_work']} "
        "planned work orders), recorded stock and lead times",
        "scenario_assumptions": assumption,
        "baseline": {
            "availability_mean": _r(b["availability_mean"]),
            "availability_p10": _r(b["availability_p10"]),
            "availability_p90": _r(b["availability_p90"]),
            "aircraft_days_lost": _r(b["aircraft_days_lost"], 1),
        },
        "scenario": {
            "availability_mean": _r(s["availability_mean"]),
            "availability_p10": _r(s["availability_p10"]),
            "availability_p90": _r(s["availability_p90"]),
            "aircraft_days_lost": _r(s["aircraft_days_lost"], 1),
        },
        "delta": d,
        "most_affected_aircraft": res["by_aircraft"][:5],
        "stockouts": res["stockouts"][:5],
        "framing": res["framing"],
    }
    card = {
        "type": "scenario",
        "label": "simulated",
        "scenario_id": run["id"],
        "name": run["name"],
        "horizon_days": run["horizon_days"],
        "runs": run["runs"],
        "baseline_assumptions": data["baseline_assumptions"],
        "scenario_assumptions": assumption,
        "baseline": data["baseline"],
        "scenario": data["scenario"],
        "delta": d,
        "most_affected_aircraft": res["by_aircraft"][:5],
        "stockouts": res["stockouts"][:5],
        "simulator_href": f"/simulator?scenario={run['id']}",
    }
    return ToolResult(
        data,
        [card],
        [_cite("scenario", run["id"], f"Scenario {run['id']}", f"/simulator?scenario={run['id']}")],
    )


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    args: type[Strict]
    run: Callable[[Session, Actor, Context, Any], ToolResult]
    roles: frozenset[str] | None = None  # None: every authenticated role


TOOLS: dict[str, Tool] = {
    t.name: t
    for t in (
        Tool(
            "get_registered_aircraft",
            "Customer-entered REG aircraft onboarding, source usage and mandatory requirements. "
            "Availability and health are unassessed; no synthetic forecast is assigned.",
            RegisteredAircraftArgs,
            registered_aircraft,
        ),
        Tool(
            "get_priority_findings",
            "Up to eight open findings ordered by recorded priority score, "
            "optionally for the selected aircraft. Priority factors are not physical fault causes.",
            AircraftArgs,
            priority_findings,
        ),
        Tool(
            "get_fleet_summary",
            "Fleet availability today and over the last 14 days with downtime "
            "causes, open findings by priority, backlog and parts at risk, on the selected date.",
            NoArgs,
            fleet_summary,
        ),
        Tool(
            "get_existing_forecast",
            "The existing 30-day Monte Carlo fleet-availability forecast "
            "(mean, P10/P50/P90, aircraft-days lost by cause).",
            NoArgs,
            existing_forecast,
        ),
        Tool(
            "get_aircraft_health",
            "Health, availability state, worst components, open findings "
            "and recent work orders for one aircraft.",
            AircraftArgs,
            aircraft_health,
        ),
        Tool(
            "get_finding_details",
            "One predictive-maintenance finding (advisory): risk, remaining "
            "life interval, anomaly, attribution, priority factors, spare and downtime.",
            FindingArgs,
            finding_details,
        ),
        Tool(
            "get_sensor_history",
            "Observed sensor readings and events for a component over the "
            "last N days up to the selected date.",
            SensorArgs,
            sensor_history,
        ),
        Tool(
            "search_maintenance_records",
            "Recorded agency work orders and planned work proposals, "
            "filtered by aircraft, component or status.",
            RecordArgs,
            maintenance_records,
        ),
        Tool(
            "get_spare_availability",
            "Spare stock, orders, lead time, ML demand forecast and parts "
            "requests for planned work. Use only_at_risk for shortages.",
            SpareArgs,
            spare_availability,
        ),
        Tool(
            "compare_maintenance_plans",
            "Compare starting a component's replacement on different "
            "days (0–59) against the current plan using the existing scenario preview.",
            PlanArgs,
            compare_plans,
        ),
        Tool(
            "run_what_if_scenario",
            "Run a separate Simulator scenario. Supported changes only: "
            "spare_delay (part_number, delay_days), "
            "extra_bay_capacity (agency_id, extra_bays 1–5), "
            "early_replacement (priority_levels), schedule_maintenance (component_id, "
            "start_in_days). Saved as a new scenario; never changes records or the plan.",
            ScenarioArgs,
            what_if,
            frozenset(SCENARIO_ROLES),
        ),
    )
}


def tool_schemas(role: str) -> list[dict[str, Any]]:
    """Ollama/OpenAI-style function schemas for the tools this role may call."""
    out = []
    for tool in TOOLS.values():
        if tool.roles is not None and role not in tool.roles:
            continue
        schema = tool.args.model_json_schema()
        schema.pop("title", None)
        for prop in schema.get("properties", {}).values():
            prop.pop("title", None)
        out.append(
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": {
                        "type": "object",
                        "properties": schema.get("properties", {}),
                        "required": schema.get("required", []),
                    },
                },
            }
        )
    return out


def call_tool(session: Session, actor: Actor, ctx: Context, name: str, raw_args: Any) -> ToolResult:
    tool = TOOLS.get(name)
    if tool is None:
        raise ToolError(f"Unknown tool {name!r}. Allowed: {', '.join(TOOLS)}.")
    if tool.roles is not None and actor.role not in tool.roles:
        raise ToolError(f"{name} is not permitted for the {actor.role} role.")
    if raw_args is None or raw_args == "":
        raw_args = {}
    if not isinstance(raw_args, dict):
        raise ToolError("Tool arguments must be a JSON object.")
    cleaned = {k: v for k, v in raw_args.items() if v is not None and v != ""}
    try:
        args = tool.args.model_validate(cleaned)
    except ValidationError as exc:
        problems = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
        raise ToolError(f"Invalid arguments for {name}: {problems}") from None
    try:
        return tool.run(session, actor, ctx, args)
    except ToolError:
        raise
    except service.EngineNotReady as exc:
        raise ToolError(f"Fleet engine not ready: {exc}") from None
    except LookupError as exc:
        raise ToolError(f"Record not found: {exc}") from None
    except ValueError as exc:
        raise ToolError(str(exc)) from None
