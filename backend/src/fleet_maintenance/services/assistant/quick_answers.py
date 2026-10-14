"""Exact read-only questions answered from existing services without inference."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from sqlalchemy.orm import Session

from fleet_maintenance.api.dependencies import Actor
from fleet_maintenance.services.assistant.tools import Context, call_tool

if TYPE_CHECKING:
    from fleet_maintenance.services.assistant.copilot import Turn


def quick_answer(
    session: Session,
    actor: Actor,
    ctx: Context,
    history: list[dict[str, str]],
) -> Turn | None:
    from fleet_maintenance.services.assistant.copilot import Turn

    if not history or history[-1]["role"] != "user":
        return None
    question = re.sub(r"\s+", " ", history[-1]["content"].lower()).strip(" .?!")
    question = re.sub(r"^(?:please |can you |could you )", "", question)
    aliases = {
        "why was this component flagged": "explain this finding with evidence",
        "why is this component flagged": "explain this finding with evidence",
        "show evidence for this finding": "explain this finding with evidence",
        "show sensor history": "show the recent sensor trends behind this alert",
        "show this aircraft's open maintenance": "what maintenance is open for this aircraft",
        "show the availability forecast": "show the 30-day availability forecast",
        "what is the availability forecast": "show the 30-day availability forecast",
    }
    question = aliases.get(question, question)

    summaries = {
        "summarise this aircraft",
        "summarize this aircraft",
        "show this aircraft",
        "what is this aircraft's condition",
        "what is happening with this aircraft",
        "summarise the selected aircraft",
    }
    if (
        ctx.aircraft_id
        and ctx.aircraft_id.startswith("REG-")
        and question
        in summaries
        | {"what maintenance is open for this aircraft", "explain this finding with evidence",
           "which findings need attention first, and why",
           "which findings on this aircraft need attention first, and why"}
    ):
        result = call_tool(session, actor, ctx, "get_registered_aircraft", {})
        session.rollback()
        row = result.data
        hours = "not recorded" if row["flight_hours"] is None else f"{row['flight_hours']:g} h"
        cycles = "not recorded" if row["cycles"] is None else str(row["cycles"])
        reply = (
            f"{row['tail_number']} · user-entered records through {row['as_of']}. "
            f"Availability is unknown; health is not assessed. Recorded usage: {hours}; "
            f"cycles: {cycles}. {row['component_count']} components are registered."
        )
        for requirement in row["requirements"]:
            payload = requirement["payload"]
            reply += f"\n- Source requirement: {payload['title']}; due {payload['due_date']}."
        reply += (
            "\nSource requirements are not approved work or proof of completion. "
            f"A qualified prediction is not available for this registration. [{row['id']}]"
        )
        return Turn(
            reply=reply,
            answer_mode="records",
            tool_calls=[{"name": "get_registered_aircraft", "arguments": {}, "ok": True}],
            citations=[{**c, "cited": True} for c in result.citations],
        )
    if question in summaries:
        if not ctx.aircraft_id:
            return Turn(
                reply="Select an aircraft first so I can retrieve its records.",
                answer_mode="records",
            )
        result = call_tool(session, actor, ctx, "get_aircraft_health", {})
        session.rollback()
        row = result.data
        reply = (
            f"{row['aircraft']} · snapshot {row['as_of']}. Assessment: {row['state']}; "
            f"recorded availability state: {row['availability_state']}. "
            f"Aggregate health index: {row['health_index']:g}/100."
        )
        for finding in row["open_findings"]:
            reply += (
                f"\n- {finding['priority']} · {finding['component']}: "
                f"{finding['action']}. [{finding['advisory_id']}]"
            )
        reply += (
            f"\nThe bounded search returned {len(row['recent_work_orders'])} recent work orders. "
            f"Inspect maintenance evidence for blockers and next actions. [{row['aircraft']}]"
        )
        return Turn(
            reply=reply,
            answer_mode="records",
            tool_calls=[{"name": "get_aircraft_health", "arguments": {}, "ok": True}],
            citations=[{**c, "cited": True} for c in result.citations],
        )
    if question in {
        "explain this finding with evidence",
        "explain this finding",
        "show the recent sensor trends behind this alert",
    } and not (ctx.component_id or ctx.advisory_id):
        return Turn(
            answer_mode="records",
            reply=(
                "Select a component or finding first, then ask again. "
                "I need its record identity to retrieve the correct evidence."
            ),
        )
    if question == "what maintenance is open for this aircraft" and not ctx.aircraft_id:
        return Turn(reply="Select an aircraft first so I can retrieve its maintenance records.")

    if question in {
        "which findings need attention first, and why",
        "which findings need attention first",
        "which findings on this aircraft need attention first, and why",
        "show the evidence behind this aircraft's alert",
    }:
        if "this aircraft" in question and not ctx.aircraft_id:
            return Turn(
                reply="Select an aircraft first so I can retrieve its findings.",
                answer_mode="records",
            )
        args: dict[str, Any] = {"aircraft_id": ctx.aircraft_id} if ctx.aircraft_id else {}
        result = call_tool(session, actor, ctx, "get_priority_findings", args)
        session.rollback()
        reply = (
            f"Open findings for {result.data['scope']} as of {result.data['as_of']}, "
            "ordered by recorded priority score (up to eight):"
        )
        for item in result.data["findings"]:
            factors = ", ".join(str(f["name"]) for f in item["factors"])
            reply += (
                f"\n- {item['priority']} · {item['aircraft']} · {item['component']}: "
                f"{item['action']}. Priority factors: {factors}. [{item['id']}]"
            )
        if not result.data["findings"]:
            reply += (
                " No matching open findings were returned. "
                "That does not establish flight clearance or completion of mandatory work."
            )
        reply += "\nPriority factors explain ranking, not a confirmed mechanical fault."
        return Turn(
            reply=reply,
            answer_mode="records",
            tool_calls=[{"name": "get_priority_findings", "arguments": args, "ok": True}],
            artifacts=result.artifacts,
            citations=[{**c, "cited": True} for c in result.citations],
        )
    if question in {
        "which spare shortages affect the current plan",
        "show spare shortages",
        "which parts are at risk",
    }:
        result = call_tool(session, actor, ctx, "get_spare_availability", {"only_at_risk": True})
        session.rollback()
        reply = f"Parts marked short or at risk as of {result.data['as_of']} (up to ten):"
        for item in result.data["parts"]:
            reply += (
                f"\n- {item['part_number']}: {item['available']} available, "
                f"{item['reserved']} reserved, {item['on_order']} on order; "
                f"status {item['status']}."
            )
        if not result.data["parts"]:
            reply += (
                " No matching parts were returned; this is not a guarantee "
                "that every maintenance requirement is covered."
            )
        reply += "\nInspect linked supply requests and work readiness before committing a plan."
        return Turn(
            reply=reply,
            answer_mode="records",
            tool_calls=[
                {"name": "get_spare_availability", "arguments": {"only_at_risk": True}, "ok": True}
            ],
            artifacts=result.artifacts,
            citations=[{**c, "cited": False} for c in result.citations],
        )
    if question == "explain the drop in fleet availability":
        result = call_tool(session, actor, ctx, "get_fleet_summary", {})
        session.rollback()
        data = result.data
        points = data["observed_last_14_days"]
        reply = (
            f"Recorded fleet availability is {data['availability_today'] * 100:g}% "
            f"as of {data['as_of']}."
        )
        if len(points) >= 2:
            previous, latest = points[-2:]
            reply += (
                f" The latest two recorded points are {previous['availability'] * 100:g}% "
                f"on {previous['date']} and {latest['availability'] * 100:g}% on {latest['date']}."
            )
        states = data["by_availability_state"]
        labels = {
            "unscheduled_repair": "unscheduled repair",
            "scheduled_maintenance": "scheduled maintenance",
            "awaiting_spares": "awaiting spares",
            "awaiting_agency": "awaiting agency",
        }
        reasons = [f"{states[key]} {label}" for key, label in labels.items() if states.get(key)]
        if reasons:
            reply += " Latest recorded downtime states: " + "; ".join(reasons) + "."
        reply += (
            " These are recorded availability states, "
            "not confirmed mechanical fault causes. [DASHBOARD]"
        )
        return Turn(
            answer_mode="records",
            reply=reply,
            tool_calls=[{"name": "get_fleet_summary", "arguments": {}, "ok": True}],
            artifacts=result.artifacts,
            citations=[{**c, "cited": True} for c in result.citations],
        )
    if question in {
        "what does the 30-day availability forecast show",
        "show the 30-day availability forecast",
        "30-day availability forecast",
        "what is the 30-day availability forecast",
    }:
        result = call_tool(session, actor, ctx, "get_existing_forecast", {})
        session.rollback()
        data = result.data
        reply = (
            f"The 30-day model forecast as of {data['as_of']} has mean availability "
            f"{data['availability_mean'] * 100:g}%, with P10–P90 {data['p10'] * 100:g}%–"
            f"{data['p90'] * 100:g}%. "
            f"Projected aircraft-days lost: {data['aircraft_days_lost']:g}. "
            "These are forecasts, not observed past losses. [DASHBOARD]"
        )
        return Turn(
            answer_mode="records",
            reply=reply,
            tool_calls=[{"name": "get_existing_forecast", "arguments": {}, "ok": True}],
            artifacts=result.artifacts,
            citations=[{**c, "cited": True} for c in result.citations],
        )
    if question in {"explain this finding with evidence", "explain this finding"} and (
        ctx.component_id or ctx.advisory_id
    ):
        result = call_tool(session, actor, ctx, "get_finding_details", {})
        session.rollback()
        data = result.data
        rul = data["rul_days"]
        reply = (
            f"**{data['aircraft']} · {data['component']}** — as of {data['as_of']}.\n\n"
            f"- Recorded assessment: {data['health_state']}; health index "
            f"{data['health_index']:g}/100.\n"
            f"- Model forecast: {data['risk_14d'] * 100:g}% failure risk over 14 days; "
            f"remaining life median {rul['p50']:g} days "
            f"(P10–P90 {rul['p10']:g}–{rul['p90']:g} days).\n"
            f"- Recorded priority: {data['priority']['level']}. "
            f"Proposed action: {data['recommended_action']}.\n\n"
            "Forecasts and attribution do not confirm a fault cause. "
            f"The proposed action needs engineer review. [{data['advisory_id']}]"
        )
        return Turn(
            answer_mode="records",
            reply=reply,
            tool_calls=[{"name": "get_finding_details", "arguments": {}, "ok": True}],
            artifacts=result.artifacts,
            citations=[{**c, "cited": c["id"] == data["advisory_id"]} for c in result.citations],
        )
    if question == "show the recent sensor trends behind this alert" and (
        ctx.component_id or ctx.advisory_id
    ):
        result = call_tool(session, actor, ctx, "get_sensor_history", {})
        session.rollback()
        data = result.data
        reply = (
            f"Recorded sensor history for {data['component']} ({data['component_id']}) "
            f"through {data['as_of']}, covering {data['window_days']} recorded days:"
        )
        for sensor in data["sensors"]:
            first = "missing" if sensor["first"] is None else str(sensor["first"])
            latest = "missing" if sensor["latest"] is None else str(sensor["latest"])
            reply += (
                f"\n- {sensor['name']}: first {first}, latest {latest} {sensor['unit']}; "
                f"missing data {sensor['missing_share'] * 100:g}%."
            )
        reply += (
            "\nThese recorded trends alone do not establish a fault cause or imminent failure. "
            f"[{data['component_id']}]"
        )
        return Turn(
            answer_mode="records",
            reply=reply,
            tool_calls=[{"name": "get_sensor_history", "arguments": {}, "ok": True}],
            artifacts=result.artifacts,
            citations=[{**c, "cited": c["id"] == data["component_id"]} for c in result.citations],
        )
    if question == "what maintenance is open for this aircraft" and ctx.aircraft_id:
        args = {"aircraft_id": ctx.aircraft_id, "status": "open", "limit": 8}
        result = call_tool(session, actor, ctx, "search_maintenance_records", args)
        session.rollback()
        data = result.data
        reply = (
            f"For {ctx.aircraft_id} as of {data['as_of']}, this search returned "
            f"{len(data['recorded'])} matching open recorded work orders and "
            f"{len(data['planned_proposals'])} planned proposals (up to 8 of each). "
            "An empty result does not prove all maintenance is completed."
        )
        return Turn(
            answer_mode="records",
            reply=reply,
            tool_calls=[{"name": "search_maintenance_records", "arguments": args, "ok": True}],
            artifacts=result.artifacts,
            citations=[{**c, "cited": False} for c in result.citations],
        )
    count = {
        "how many aircraft are in the fleet",
        "how many aircraft are there",
        "what is the fleet size",
        "fleet count",
        "how many aircraft do we have",
        "fleet size",
        "aircraft count",
        "total aircraft",
    }
    availability = {
        "what is the current fleet availability",
        "what is the current availability",
        "how many aircraft are available",
        "current fleet availability",
        "what is fleet availability",
        "current availability",
        "fleet availability",
        "show current availability",
        "show fleet availability",
        "what's the current availability",
        "what's the current fleet availability",
    }
    both = {"how many aircraft are in the fleet and what is the current availability"}
    stock = re.fullmatch(
        r"(?:how many|what is the stock level for) ([a-z]{3}-\d{3})(?: are in stock)?", question
    )
    part = stock.group(1).upper() if stock else None
    if question in {"what is the stock level", "how many are in stock"}:
        part = ctx.part_number
    if part:
        result = call_tool(session, actor, ctx, "get_spare_availability", {"part_number": part})
        session.rollback()
        row = result.data["parts"][0]
        cite = result.citations[0]["id"] if result.citations else None
        reply = (
            f"As of {result.data['as_of']}, {part} has {row['on_hand']} on hand, "
            f"{row['reserved']} reserved and {row['available']} available. "
            f"{row['on_order']} are on order."
        )
        if cite:
            reply += f" [{cite}]"
        return Turn(
            answer_mode="records",
            reply=reply,
            tool_calls=[
                {"name": "get_spare_availability", "arguments": {"part_number": part}, "ok": True}
            ],
            artifacts=result.artifacts,
            citations=[{**c, "cited": c["id"] == cite} for c in result.citations],
        )
    if question not in count | availability | both:
        return None
    result = call_tool(session, actor, ctx, "get_fleet_summary", {})
    session.rollback()
    data = result.data
    total = data["aircraft"]
    available = data["by_availability_state"]["available"]
    date = data["as_of"]
    if question in count:
        reply = (
            f"The scored demonstration fleet contains {total} aircraft as of {date}. "
            "Newly registered aircraft awaiting assessment are shown separately. [DASHBOARD]"
        )
    else:
        percent = data["availability_today"] * 100
        reply = (
            f"As of {date}, {available} of {total} aircraft are available "
            f"({percent:g}% observed fleet availability). [DASHBOARD]"
        )
    return Turn(
        answer_mode="records",
        reply=reply,
        tool_calls=[{"name": "get_fleet_summary", "arguments": {}, "ok": True}],
        artifacts=result.artifacts,
        citations=[{**c, "cited": True} for c in result.citations],
    )
