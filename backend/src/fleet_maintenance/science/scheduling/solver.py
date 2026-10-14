from ortools.sat.python import cp_model

from fleet_maintenance.science.scheduling.constraints import validate_input, validate_result
from fleet_maintenance.science.scheduling.formulation import (
    Assignment,
    PlanningInput,
    PlanningResult,
    TaskInput,
)
from fleet_maintenance.science.scheduling.grouping import groups
from fleet_maintenance.science.scheduling.resources import allowed_starts, compatible


def solve(source: PlanningInput, time_limit_seconds: float = 5.0) -> PlanningResult:
    errors = validate_input(source)
    if errors:
        return PlanningResult("invalid", diagnostics=tuple(errors))
    if not source.tasks:
        return PlanningResult("optimal", objective=0.0, best_bound=0.0)
    model = cp_model.CpModel()
    starts: dict[str, cp_model.IntVar] = {}
    ends: dict[str, cp_model.IntVar] = {}
    intervals: dict[str, cp_model.IntervalVar] = {}
    choices: dict[tuple[str, str], list[tuple[str, int, cp_model.IntVar]]] = {}
    unit_intervals: dict[tuple[str, int], list[cp_model.IntervalVar]] = {}
    blockers: list[str] = []
    for task in source.tasks:
        starts[task.id] = model.new_int_var(
            task.earliest, task.deadline - task.duration, f"start_{task.id}"
        )
        ends[task.id] = model.new_int_var(
            task.earliest + task.duration, task.deadline, f"end_{task.id}"
        )
        intervals[task.id] = model.new_interval_var(
            starts[task.id], task.duration, ends[task.id], f"interval_{task.id}"
        )
        if task.fixed_start is not None:
            model.add(starts[task.id] == task.fixed_start)
        for kind in ("crew", "bay") if source.resources else ():
            options = []
            for resource in source.resources:
                allowed = allowed_starts(resource, task)
                if resource.kind != kind or not compatible(resource, task) or not allowed:
                    continue
                for unit in range(resource.capacity):
                    fixed_id = task.fixed_crew_id if kind == "crew" else task.fixed_bay_id
                    fixed_unit = task.fixed_crew_unit if kind == "crew" else task.fixed_bay_unit
                    if fixed_id and unit != fixed_unit:
                        continue
                    selected = model.new_bool_var(f"{task.id}_{resource.id}_{unit}")
                    optional = model.new_optional_interval_var(
                        starts[task.id],
                        task.duration,
                        ends[task.id],
                        selected,
                        f"use_{task.id}_{resource.id}_{unit}",
                    )
                    model.add_allowed_assignments(
                        [starts[task.id]], [(start,) for start in allowed]
                    ).only_enforce_if(selected)
                    unit_intervals.setdefault((resource.id, unit), []).append(optional)
                    options.append((resource.id, unit, selected))
            choices[(task.id, kind)] = options
            if not options:
                blockers.append(
                    f"Task {task.id}: no qualified {kind} with a valid uninterrupted shift/window."
                )
            model.add_exactly_one([choice[2] for choice in options])
    for resource_intervals in unit_intervals.values():
        model.add_no_overlap(resource_intervals)
    for aircraft in {t.aircraft_id for t in source.tasks if t.aircraft_id}:
        model.add_no_overlap([intervals[t.id] for t in source.tasks if t.aircraft_id == aircraft])
    for task in source.tasks:
        for predecessor_id in task.predecessors:
            model.add(starts[task.id] >= ends[predecessor_id])
    for tasks in groups(source).values():
        for previous, current in zip(tasks, tasks[1:], strict=False):
            model.add(starts[current.id] == ends[previous.id])
    for skill, capacity in source.skill_capacity.items():
        skill_intervals = [intervals[t.id] for t in source.tasks if t.skill == skill]
        if skill_intervals:
            model.add_cumulative(skill_intervals, [1] * len(skill_intervals), capacity)
    for part_id in {task.part_id for task in source.tasks if task.part_id}:
        stock = source.part_stock.get(part_id, 0)
        arrivals = [a for a in source.part_arrivals if a.part_id == part_id]
        part_tasks = [t for t in source.tasks if t.part_id == part_id and t.part_quantity]
        # Simultaneous arrivals are available at task start; consumption is counted once.
        model.add_reservoir_constraint(
            [0] + [a.slot for a in arrivals] + [starts[t.id] for t in part_tasks],
            [stock] + [a.quantity for a in arrivals] + [-t.part_quantity for t in part_tasks],
            0,
            stock + sum(a.quantity for a in arrivals),
        )
    makespan = model.new_int_var(0, source.horizon, "makespan")
    model.add_max_equality(makespan, list(ends.values()))
    # Match the simulator's grounding definition exactly: each task grounds its aircraft
    # from release until completion, with overlapping intervals counted only once.
    # Minimising makespan alone can leave many short jobs waiting behind one long job.
    aircraft_tasks: dict[str, list[TaskInput]] = {}
    for task in source.tasks:
        aircraft_tasks.setdefault(task.aircraft_id or task.component_id or task.id, []).append(task)
    grounded = []
    for aircraft_index, aircraft_group in enumerate(aircraft_tasks.values()):
        for slot in range(source.horizon):
            pending = []
            for task in aircraft_group:
                if task.earliest > slot:
                    continue
                waiting = model.new_bool_var(f"grounded_{task.id}_{slot}")
                model.add(ends[task.id] > slot).only_enforce_if(waiting)
                model.add(ends[task.id] <= slot).only_enforce_if(waiting.Not())
                pending.append(waiting)
            if pending:
                occupied = model.new_bool_var(f"aircraft_{aircraft_index}_{slot}")
                model.add_max_equality(occupied, pending)
                grounded.append(occupied)
    # Lexicographic integer objective: a single grounding slot outweighs any makespan change.
    model.minimize(sum(grounded) * (source.horizon + 1) + makespan)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 26249
    status = solver.solve(model)
    names = {
        cp_model.OPTIMAL: "optimal",
        cp_model.FEASIBLE: "feasible",
        cp_model.INFEASIBLE: "infeasible",
        cp_model.UNKNOWN: "unknown",
        cp_model.MODEL_INVALID: "invalid",
    }
    label = names.get(status, "failed")
    if label not in {"optimal", "feasible"}:
        return PlanningResult(label, diagnostics=tuple(blockers))

    def selected_resource(task_id: str, kind: str) -> tuple[str | None, int]:
        return next(
            (
                (identifier, unit)
                for identifier, unit, selected in choices.get((task_id, kind), [])
                if solver.value(selected)
            ),
            (None, 0),
        )

    assignments = tuple(
        Assignment(
            task.id,
            solver.value(starts[task.id]),
            solver.value(ends[task.id]),
            selected_resource(task.id, "crew")[0],
            selected_resource(task.id, "bay")[0],
            selected_resource(task.id, "crew")[1],
            selected_resource(task.id, "bay")[1],
        )
        for task in source.tasks
    )
    result = PlanningResult(
        label,
        assignments,
        objective=solver.objective_value,
        best_bound=solver.best_objective_bound,
    )
    violations = validate_result(source, result)
    return result if not violations else PlanningResult("failed", diagnostics=tuple(violations))
