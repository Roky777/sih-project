"""Measure recorded fleet states; never infer clearance or causal improvement."""

import hashlib
from datetime import datetime
from typing import Literal, Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class Interval(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    aircraft_id: str = Field(min_length=1, pattern=r"\S")
    start: AwareDatetime
    end: AwareDatetime | None = None

    @model_validator(mode="after")
    def ordered(self) -> Self:
        if self.end is not None and self.end <= self.start:
            raise ValueError("Interval end must follow start")
        return self


class StateInterval(Interval):
    source_event_id: str = Field(min_length=1, pattern=r"\S")
    state: Literal["available", "unavailable", "unknown"]


class AvailabilityExport(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal["observed-availability-v1"]
    evidence_kind: Literal["synthetic_fixture", "operator_export"]
    source_reference: str = Field(min_length=1, pattern=r"\S")
    frozen_protocol_reference: str = Field(min_length=1, pattern=r"\S")
    window_start: AwareDatetime
    window_end: AwareDatetime
    memberships: tuple[Interval, ...] = Field(min_length=1)
    states: tuple[StateInterval, ...]

    @model_validator(mode="after")
    def ordered_window(self) -> Self:
        if self.window_end <= self.window_start:
            raise ValueError("Observation window end must follow start")
        return self


def _clip(interval: Interval, start: datetime, end: datetime) -> tuple[datetime, datetime] | None:
    left, right = max(start, interval.start), min(end, interval.end or end)
    return (left, right) if left < right else None


def _union_seconds(intervals: list[tuple[datetime, datetime]]) -> float:
    if not intervals:
        return 0.0
    ordered = sorted(intervals)
    left, right = ordered[0]
    seconds = 0.0
    for a, b in ordered[1:]:
        if a <= right:
            right = max(right, b)
        else:
            seconds += (right - left).total_seconds()
            left, right = a, b
    return seconds + (right - left).total_seconds()


class Exposure(BaseModel):
    aircraft_id: str
    eligible_aircraft_hours: float
    available_aircraft_hours: float
    unavailable_aircraft_hours: float
    unknown_aircraft_hours: float
    availability_known_fraction: float | None
    availability_lower_bound: float
    availability_upper_bound: float
    unknown_fraction: float


class AvailabilityReport(BaseModel):
    version: Literal["observed-availability-v1"] = "observed-availability-v1"
    evidence_kind: Literal["synthetic_fixture", "operator_export"]
    input_sha256: str
    source_reference: str
    frozen_protocol_reference: str
    duplicate_deliveries: int
    open_state_intervals_censored_at_cutoff: int
    by_aircraft: tuple[Exposure, ...]
    overall: Exposure
    qualification: str = (
        "Descriptive measurement of supplied records, not verification of their authority, "
        "airworthiness clearance, model/geometry qualification or proof of causal improvement. "
        "Unknown exposure is reported, never assumed healthy."
    )


def _exposure(aircraft: str, eligible: float, available: float, unavailable: float) -> Exposure:
    known = available + unavailable
    unknown = max(0.0, eligible - known)
    return Exposure(
        aircraft_id=aircraft,
        eligible_aircraft_hours=eligible / 3600,
        available_aircraft_hours=available / 3600,
        unavailable_aircraft_hours=unavailable / 3600,
        unknown_aircraft_hours=unknown / 3600,
        availability_known_fraction=available / known if known else None,
        availability_lower_bound=available / eligible,
        availability_upper_bound=(available + unknown) / eligible,
        unknown_fraction=unknown / eligible,
    )


def measure_availability(source: AvailabilityExport) -> AvailabilityReport:
    """Union same-state intervals, reject ambiguity, and clip to eligible membership."""
    members: dict[str, list[tuple[datetime, datetime]]] = {}
    for interval in source.memberships:
        clipped = _clip(interval, source.window_start, source.window_end)
        if clipped:
            members.setdefault(interval.aircraft_id, []).append(clipped)
    for intervals in members.values():
        ordered = sorted(intervals)
        if any(b[0] < a[1] for a, b in zip(ordered, ordered[1:], strict=False)):
            raise ValueError("Overlapping cohort memberships require reconciliation")
    if not members:
        raise ValueError("No eligible membership exposure in observation window")

    identities = {m.aircraft_id for m in source.memberships}
    events: dict[str, StateInterval] = {}
    duplicates = 0
    for interval in source.states:
        if interval.aircraft_id not in identities:
            raise ValueError("State belongs to an aircraft absent from the declared cohort")
        old = events.get(interval.source_event_id)
        if old is not None:
            if old != interval:
                raise ValueError("Conflicting source event ID; supply reconciled revisions")
            duplicates += 1
        events[interval.source_event_id] = interval

    by_aircraft = []
    totals = [0.0, 0.0, 0.0]
    for aircraft, memberships in sorted(members.items()):
        states: dict[str, list[tuple[datetime, datetime]]] = {
            "available": [], "unavailable": [], "unknown": []
        }
        for interval in events.values():
            if interval.aircraft_id == aircraft:
                for start, end in memberships:
                    clipped = _clip(interval, start, end)
                    if clipped:
                        states[interval.state].append(clipped)
        # Even an explicit unknown state must not overwrite an authoritative known state.
        ordered_states = sorted(
            (start, end, state)
            for state, intervals in states.items()
            for start, end in intervals
        )
        latest: dict[str, datetime] = {}
        for start, end, state in ordered_states:
            if any(other != state and stop > start for other, stop in latest.items()):
                raise ValueError("Conflicting aircraft states overlap in eligible exposure")
            latest[state] = max(end, latest.get(state, end))
        eligible = _union_seconds(memberships)
        available = _union_seconds(states["available"])
        unavailable = _union_seconds(states["unavailable"])
        by_aircraft.append(_exposure(aircraft, eligible, available, unavailable))
        for index, value in enumerate((eligible, available, unavailable)):
            totals[index] += value
    return AvailabilityReport(
        evidence_kind=source.evidence_kind,
        input_sha256=hashlib.sha256(source.model_dump_json().encode()).hexdigest(),
        source_reference=source.source_reference,
        frozen_protocol_reference=source.frozen_protocol_reference,
        duplicate_deliveries=duplicates,
        open_state_intervals_censored_at_cutoff=sum(e.end is None for e in events.values()),
        by_aircraft=tuple(by_aircraft),
        overall=_exposure("ALL_ELIGIBLE_AIRCRAFT", *totals),
    )
