from fleet_maintenance.verification.availability_study import run_study


def test_study_retains_ties_impossible_deadlines_and_matching_exposure() -> None:
    report = run_study()
    cases = {row["name"]: row for row in report["cases"]}
    assert len(cases["shared_resources_delayed_supply"]["input"]["tasks"]) == 4
    tie = cases["single_task_tie"]["comparison"]["cases"][0]
    assert tie["actual"]["downtime_aircraft_hours"] == 8
    assert tie["downtime_difference_hours"] == 0
    assert cases["impossible_mandatory_deadline"]["solver"]["status"] == "infeasible"
    assert "comparison" not in cases["impossible_mandatory_deadline"]
    for case in cases.values():
        if "comparison" not in case:
            continue
        for assumption in case["comparison"]["cases"]:
            actual = assumption["actual"]
            assert (
                actual["availability"]
                == 1 - actual["downtime_aircraft_hours"] / actual["exposure_aircraft_hours"]
            )
            if assumption["baseline"]:
                assert (
                    actual["exposure_aircraft_hours"]
                    == assumption["baseline"]["exposure_aircraft_hours"]
                )
        declared = case["comparison"]["cases"][0]
        assert declared["actual"]["late_tasks"] == 0
        assert declared["actual"]["resource_window_violations"] == []


def test_grounding_objective_prefers_short_work_without_relaxing_constraints() -> None:
    from fleet_maintenance.domain.contracts.planning import PlanningInput, TaskInput
    from fleet_maintenance.science.scheduling.constraints import validate_result
    from fleet_maintenance.science.scheduling.solver import solve
    from fleet_maintenance.science.simulation.plan_comparison import compare_plan

    source = PlanningInput(
        8,
        (
            TaskInput("A-long", 4, 0, 8, "engine", aircraft_id="A"),
            TaskInput("B-short", 1, 0, 8, "engine", aircraft_id="B"),
        ),
        {"engine": 1},
        {},
    )
    result = solve(source)
    assert not validate_result(source, result)
    comparison = compare_plan(source, result.assignments)["cases"][0]
    assert comparison["actual"]["downtime_aircraft_hours"] == 48
    assert comparison["baseline"]["downtime_aircraft_hours"] == 72


def test_overlapping_grounding_is_counted_once_per_aircraft() -> None:
    from fleet_maintenance.domain.contracts.planning import PlanningInput, TaskInput
    from fleet_maintenance.science.scheduling.solver import solve
    from fleet_maintenance.science.simulation.plan_comparison import simulate_plan

    source = PlanningInput(
        8,
        (
            TaskInput("A-first", 1, 0, 8, "engine", aircraft_id="A"),
            TaskInput("A-second", 1, 0, 8, "engine", aircraft_id="A"),
        ),
        {"engine": 1},
        {},
    )
    result = solve(source)
    projection = simulate_plan(source, result.assignments)
    assert projection["downtime_aircraft_hours"] == 16
    assert result.objective == 2 * (8 + 1) + 2
