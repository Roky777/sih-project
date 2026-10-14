from dataclasses import replace

from fleet_maintenance.domain.contracts.planning import (
    Assignment,
    PlanningInput,
    PlanningResult,
    ResourceInput,
    TaskInput,
)
from fleet_maintenance.science.scheduling.constraints import validate_result
from fleet_maintenance.science.scheduling.solver import solve


def source() -> PlanningInput:
    return PlanningInput(
        8,
        (TaskInput("t", 2, 0, 8, "engine", aircraft_id="a"),),
        {"engine": 2},
        {},
        resources=(
            ResourceInput("crew", "crew", ("engine",), ((2, 6),), valid_until=6),
            ResourceInput("bay", "bay", ("engine",), ((0, 8),), valid_until=8),
        ),
    )


def test_qualified_calendar_and_assignment():
    value = source()
    result = solve(value)
    assert result.status == "optimal"
    assert result.assignments[0].start == 2
    assert result.assignments[0].crew_id == "crew"
    assert result.assignments[0].bay_id == "bay"
    assert not validate_result(value, result)


def test_qualification_must_cover_entire_work_and_breaks_cannot_be_bridged():
    value = source()
    crew = replace(value.resources[0], available=((0, 1), (3, 4)), valid_until=4)
    result = solve(replace(value, resources=(crew, value.resources[1])))
    assert result.status == "infeasible"
    assert "crew" in result.diagnostics[0]


def test_incompatible_aircraft_bay_is_infeasible():
    value = source()
    bay = replace(value.resources[1], aircraft_ids=("other-aircraft",))
    assert solve(replace(value, resources=(value.resources[0], bay))).status == "infeasible"


def test_independent_checker_rejects_capacity_overlap_and_qualification():
    value = source()
    value = replace(value, tasks=value.tasks + (replace(value.tasks[0], id="u"),))
    result = PlanningResult(
        "feasible",
        (
            Assignment("t", 0, 2, "crew", "bay"),
            Assignment("u", 0, 2, "crew", "bay"),
        ),
    )
    errors = validate_result(value, result)
    assert any("shift" in error for error in errors)
    assert any("overlaps" in error for error in errors)
    assert any("Aircraft" in error for error in errors)


def test_capacity_units_are_independently_allocated():
    value = source()
    value = replace(
        value,
        tasks=value.tasks + (replace(value.tasks[0], id="u", aircraft_id="b"),),
        resources=tuple(replace(resource, capacity=2) for resource in value.resources),
    )
    result = solve(value)
    assert result.status == "optimal"
    assert result.objective == 8 * (value.horizon + 1) + 4
    assert {a.crew_unit for a in result.assignments} == {0, 1}
    assert {a.bay_unit for a in result.assignments} == {0, 1}
