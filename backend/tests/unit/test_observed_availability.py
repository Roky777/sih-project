from datetime import UTC, datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from fleet_maintenance.science.fleet.observed_availability import (
    AvailabilityExport,
    Interval,
    StateInterval,
    measure_availability,
)

START = datetime(2026, 1, 1, tzinfo=UTC)


def event(identity: str, state: str, start: int, end: int | None) -> StateInterval:
    return StateInterval.model_validate({
        "source_event_id": identity, "aircraft_id": "A", "state": state,
        "start": START + timedelta(hours=start),
        "end": START + timedelta(hours=end) if end is not None else None,
    })


def source(*events: StateInterval) -> AvailabilityExport:
    return AvailabilityExport(
        schema_version="observed-availability-v1",
        evidence_kind="synthetic_fixture",
        source_reference="independent hand-calculated fixture",
        frozen_protocol_reference="test-only reference",
        window_start=START,
        window_end=START + timedelta(hours=12),
        memberships=(Interval(aircraft_id="A", start=START),),
        states=events,
    )


def test_overlap_union_missing_time_and_redelivery_have_independent_denominators() -> None:
    down = event("d1", "unavailable", 4, 8)
    report = measure_availability(source(
        event("a", "available", 0, 4), down, event("d2", "unavailable", 5, 7), down,
    ))
    assert report.overall.eligible_aircraft_hours == 12
    assert report.overall.unavailable_aircraft_hours == 4
    assert report.overall.unknown_aircraft_hours == 4
    assert report.overall.availability_known_fraction == .5
    assert report.overall.availability_lower_bound == pytest.approx(1 / 3)
    assert report.overall.availability_upper_bound == pytest.approx(2 / 3)
    assert report.duplicate_deliveries == 1
    assert report.evidence_kind == "synthetic_fixture"


def test_membership_gaps_cutoff_and_open_records_are_clipped() -> None:
    original = source(event("open", "unavailable", -2, None))
    original = original.model_copy(update={"memberships": (
        Interval(aircraft_id="A", start=START, end=START + timedelta(hours=2)),
        Interval(aircraft_id="A", start=START + timedelta(hours=4),
                 end=START + timedelta(hours=6)),
    )})
    report = measure_availability(original)
    assert report.overall.eligible_aircraft_hours == 4
    assert report.overall.unavailable_aircraft_hours == 4
    assert report.open_state_intervals_censored_at_cutoff == 1


@pytest.mark.parametrize("state", ["available", "unknown"])
def test_contradictory_states_require_reconciliation(state: str) -> None:
    with pytest.raises(ValueError, match="Conflicting aircraft states"):
        measure_availability(source(event("d", "unavailable", 0, 8), event("x", state, 6, 9)))


def test_conflicting_event_id_cannot_silently_correct_evidence() -> None:
    with pytest.raises(ValueError, match="Conflicting source event ID"):
        measure_availability(source(event("d", "unavailable", 0, 2),
                                    event("d", "unavailable", 0, 4)))


def test_no_known_state_is_unknown_not_zero_availability() -> None:
    report = measure_availability(source())
    assert report.overall.availability_known_fraction is None
    assert report.overall.unknown_fraction == 1
    assert report.overall.availability_lower_bound == 0
    assert report.overall.availability_upper_bound == 1


def test_state_for_undeclared_aircraft_is_rejected() -> None:
    with pytest.raises(ValueError, match="absent from the declared cohort"):
        measure_availability(source(event("a", "available", 0, 4).model_copy(
            update={"aircraft_id": "OTHER"}
        )))


def test_overlapping_memberships_and_zero_exposure_are_rejected() -> None:
    with pytest.raises(ValueError, match="Overlapping cohort"):
        measure_availability(source().model_copy(update={"memberships": (
            Interval(aircraft_id="A", start=START), Interval(aircraft_id="A", start=START),
        )}))
    with pytest.raises(ValueError, match="No eligible"):
        measure_availability(source().model_copy(update={"memberships": (
            Interval(aircraft_id="A", start=START + timedelta(days=1)),
        )}))


def test_timezone_offsets_represent_the_same_clock_and_touching_states_do_not_conflict() -> None:
    shifted = event("a", "available", 0, 4).model_copy(update={
        "start": START.astimezone(timezone(timedelta(hours=5, minutes=30)))
    })
    report = measure_availability(source(shifted, event("d", "unavailable", 4, None)))
    assert report.overall.available_aircraft_hours == 4
    assert report.overall.unavailable_aircraft_hours == 8


def test_naive_clocks_reverse_intervals_and_invented_states_fail_validation() -> None:
    with pytest.raises(ValidationError):
        Interval(aircraft_id="A", start=datetime(2026, 1, 1))
    with pytest.raises(ValidationError):
        event("a", "available", 4, 4)
    with pytest.raises(ValidationError):
        event("a", "healthy", 0, 4)
    with pytest.raises(ValidationError):
        Interval(aircraft_id="   ", start=START)
