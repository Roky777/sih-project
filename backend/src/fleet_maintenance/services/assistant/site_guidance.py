"""Versioned site help answered without model inference or operational guesses."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fleet_maintenance.services.assistant.copilot import Turn

# Deliberately bounded: compound, dated or adversarial questions are not silently remapped.
GUIDANCE: dict[str, tuple[str, str]] = {
    "problem": (
        "PS 26249, Air Power — Predictive Maintenance & Fleet Availability, addresses "
        "low aircraft availability associated with fragmented records and reactive maintenance. "
        "AeroCare connects supported health evidence, engineering review, constrained planning, "
        "supply and recorded work. Simulations evaluate projected availability effects; the "
        "demonstrator has not established a real-fleet operational improvement.",
        "/help",
    ),
    "navigation": (
        "AeroCare connects aircraft evidence to reviewed maintenance work. Overview shows "
        "recorded availability; Aircraft holds identities and component records; Findings supports "
        "engineering review; Maintenance tracks planning and work; Spares shows supply readiness; "
        "Analysis compares separately labelled projections. Open Help for the connected journey.",
        "/help",
    ),
    "registration": (
        "Open Aircraft and choose Add aircraft. Enter its tail, serial, type, base and fleet-entry "
        "date, then register installed components and validate source-record imports. An engineer, "
        "planner, supervisor or administrator is required outside replay. New aircraft remain "
        "not assessed with unknown availability; registration does not qualify a prediction model.",
        "/aircraft?filter=onboarding",
    ),
    "prediction": (
        "A recorded condition, a model forecast and a maintenance decision are different. "
        "Inspect the selected component's sensor history, quality, model applicability and "
        "remaining-life interval. A life interval is not an individual failure probability. "
        "Missing or unsupported evidence can withhold a prediction; mandatory work still applies. "
        "Engine research uses its own dataset and units, separately from the synthetic fleet.",
        "/analysis?view=models",
    ),
    "approval": (
        "Review the evidence and proposed maintenance before approval. The server checks your "
        "permissions, current inputs, resources and stock. "
        "A proposal alone does not reserve parts. "
        "Use the maintenance workflow to approve and record work. Copilot text cannot approve "
        "work, change your role or grant airworthiness clearance.",
        "/maintenance",
    ),
    "availability": (
        "AeroCare supports maintenance decisions that may reduce avoidable downtime. Recorded "
        "availability describes the selected snapshot; forecasts and scenario comparisons are "
        "projections. Compare alternatives under matching fleet demand and horizon and inspect "
        "changed assumptions. No real-fleet availability improvement is established by a synthetic "
        "comparison. Newly registered, unassessed aircraft are reported separately.",
        "/analysis?view=compare",
    ),
    "privacy": (
        "The copilot's default configuration uses private local inference through the backend. "
        "Application tools enforce their existing permissions; model text cannot bypass them. "
        "Hosted inference requires explicit server configuration and can send selected context "
        "to that provider. Local inference does not establish a complete security certification. "
        "Do not enter secrets into the conversation.",
        "/help",
    ),
    "capabilities": (
        "I can explain AeroCare's workflow, retrieve supported fleet, component, finding, work "
        "and spare records, and request supported simulation scenarios for authorised roles. "
        "Common record questions use direct service answers. I cannot diagnose a physical fault, "
        "predict an exact failure date, clear an aircraft or alter approval permissions. Select "
        "an aircraft, component or part for a specific evidence question.",
        "/help",
    ),
}
ALIASES = {
    "what is the problem statement": "problem",
    "what is our ps": "problem",
    "what problem does aerocare solve": "problem",
    "what is ps 26249": "problem",
    "what is aerocare": "navigation",
    "explain the site": "navigation",
    "how does aerocare work": "navigation",
    "explain the workflow": "navigation",
    "where do i start": "navigation",
    "how do i use this site": "navigation",
    "how do i add an aircraft": "registration",
    "how to register an aircraft": "registration",
    "how do i register a new aircraft": "registration",
    "add aircraft": "registration",
    "where can i add an aircraft": "registration",
    "what does rul mean": "prediction",
    "what is remaining useful life": "prediction",
    "why is my prediction unavailable": "prediction",
    "what does health index mean": "prediction",
    "how do i approve maintenance": "approval",
    "can you approve maintenance": "approval",
    "can you clear this aircraft for flight": "approval",
    "is this aircraft safe to fly": "approval",
    "does aerocare increase fleet availability": "availability",
    "have we proven increased availability": "availability",
    "is our ai private": "privacy",
    "is my data private": "privacy",
    "what can you do": "capabilities",
    "help": "capabilities",
    "hello": "capabilities",
    "hi": "capabilities",
    "what are your limitations": "capabilities",
}


def site_answer(content: str) -> Turn | None:
    from fleet_maintenance.services.assistant.copilot import Turn

    question = re.sub(r"\s+", " ", content.lower()).strip(" .?!")
    if re.search(
        r"(?:reveal|print|give|show).{0,35}(?:api key|password|secret|system prompt)"
        r"|ignore.{0,25}(?:instructions|rules)"
        r"|bypass.{0,25}(?:approval|permissions|authentication)",
        question,
    ):
        return Turn(
            reply=(
                "I cannot reveal secrets, bypass permissions or replace maintenance approval. "
                "Ask about AeroCare's workflow or select a record for evidence."
            ),
            answer_mode="guidance",
        )
    if re.fullmatch(
        r"(?:how many aircraft (?:will be|are) available|what (?:is|will be) "
        r"(?:the )?(?:fleet )?availability) tomorrow",
        question,
    ):
        return Turn(
            reply=(
                "Tomorrow's recorded availability does not exist yet. "
                "I can retrieve the selected snapshot or existing model forecast, labelled "
                "as a projection; I cannot promise an exact future aircraft count."
            ),
            answer_mode="guidance",
        )
    if re.search(
        r"(?:exact (?:failure date|failure time)|when exactly will .{0,50} fail)", question
    ):
        return Turn(
            reply=(
                "AeroCare does not establish an exact failure date. A supported component may "
                "have a remaining-life estimate and interval, subject to data quality, model "
                "limits and explicit usage assumptions. Select its evidence record to inspect "
                "those limits."
            ),
            answer_mode="guidance",
        )
    topic = ALIASES.get(question)
    if topic is None:
        return None
    text, href = GUIDANCE[topic]
    return Turn(
        answer_mode="guidance",
        reply=f"{text} [AEROCARE-HELP]",
        tool_calls=[{"name": "site_guidance", "arguments": {"topic": topic}, "ok": True}],
        citations=[
            {
                "id": "AEROCARE-HELP",
                "kind": "help",
                "label": "AeroCare workflow guidance",
                "href": href,
                "cited": True,
            }
        ],
    )
