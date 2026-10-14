from fleet_maintenance.science.scheduling.baselines import earliest_deadline_first
from fleet_maintenance.science.scheduling.constraints import validate_result
from fleet_maintenance.science.scheduling.formulation import (
    Assignment,
    PartArrivalInput,
    PlanningInput,
    PlanningResult,
    TaskInput,
)
from fleet_maintenance.science.scheduling.solver import solve


def test_future_delivery_cannot_be_consumed_early_or_twice():
    source = PlanningInput(
        10,
        (TaskInput("a", 1, 0, 8, "engine", "kit", 1), TaskInput("b", 1, 0, 8, "engine", "kit", 1)),
        {"engine": 2},
        {"kit": 0},
        (PartArrivalInput("kit", 3, 1), PartArrivalInput("kit", 5, 1)),
    )
    result = solve(source)
    assert result.status == "optimal" and validate_result(source, result) == []
    starts = sorted(item.start for item in result.assignments)
    assert starts[0] >= 3 and starts[1] == 5
    assert result.objective == (4 + 6) * (source.horizon + 1) + 6
    early = PlanningResult("feasible", (Assignment("a", 3, 4), Assignment("b", 3, 4)))
    assert any("unavailable" in error for error in validate_result(source, early))
    baseline = earliest_deadline_first(source)
    assert baseline.status == "feasible" and validate_result(source, baseline) == []


def test_delivery_after_deadline_is_infeasible_not_a_stock_error():
    source = PlanningInput(
        10,
        (TaskInput("a", 2, 0, 4, "engine", "kit", 1),),
        {"engine": 1},
        {"kit": 0},
        (PartArrivalInput("kit", 5, 1),),
    )
    assert solve(source).status == "infeasible"


def test_invalid_delivery_and_forged_stock_result_are_rejected():
    source = PlanningInput(
        5,
        (TaskInput("a", 1, 0, 4, "engine", "kit", 1),),
        {"engine": 1},
        {"kit": 0},
        (PartArrivalInput("kit", 5, 1),),
    )
    assert solve(source).status == "invalid"
    forged = PlanningResult("feasible", (Assignment("a", 0, 1),))
    assert any("unavailable" in error for error in validate_result(source, forged))
