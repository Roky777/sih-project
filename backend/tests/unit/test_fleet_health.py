"""Fleet-health engine checks from docs/plan.md section 17 (fast, small synthetic worlds)."""

from dataclasses import replace
from datetime import date

import numpy as np
import pytest

from fleet_maintenance.science.fleet.availability import (
    Intervention,
    OpenWork,
    Snapshot,
    simulate_fleet,
)
from fleet_maintenance.science.fleet.catalog import WorldConfig
from fleet_maintenance.science.fleet.decisions import _action, health_state, risk_band
from fleet_maintenance.science.fleet.features import build_features, clean_readings, fit_normaliser
from fleet_maintenance.science.fleet.integration import normalise_part, normalise_tail
from fleet_maintenance.science.fleet.simulator import simulate

SMALL = WorldConfig(seed=5, aircraft=6, as_of=date(2026, 9, 30), history_days=300)


@pytest.fixture(scope="module")
def world():  # type: ignore[no-untyped-def]
    return simulate(SMALL)


def test_same_seed_reproduces_world(world) -> None:  # type: ignore[no-untyped-def]
    again = simulate(SMALL)
    assert np.array_equal(np.nan_to_num(world.readings), np.nan_to_num(again.readings))
    assert [wo.id for wo in world.work_orders] == [wo.id for wo in again.work_orders]
    assert world.truth.failure_days == again.truth.failure_days


def test_stock_never_negative_and_states_valid(world) -> None:  # type: ignore[no-untyped-def]
    assert world.stock.min() >= 0
    assert set(np.unique(world.aircraft_state)) <= {0, 1, 2, 3, 4}
    # Grounded aircraft accumulate no flight hours.
    assert float(world.flight_hours[world.aircraft_state > 0].sum()) == 0.0


def test_missing_rate_within_spec(world) -> None:  # type: ignore[no-untyped-def]
    flown = (world.flags != 9).sum()
    missing = (world.flags == 1).sum()
    assert 0.02 <= missing / flown <= 0.06


def test_features_use_only_past_data(world) -> None:  # type: ignore[no-untyped-def]
    values, flags = clean_readings(world)
    mask = np.zeros((world.slots, world.days), dtype=bool)
    mask[:, :150] = True
    normaliser = fit_normaliser(world, values, mask)
    baseline = build_features(world, values, flags, normaliser).values
    cut = 200
    future = values.copy()
    future[:, cut:, :] = future[:, cut:, :] + 1000.0  # perturb only later readings
    perturbed = build_features(world, future, flags, normaliser).values
    np.testing.assert_array_equal(
        np.nan_to_num(baseline[:, :cut]), np.nan_to_num(perturbed[:, :cut])
    )


def _snapshot(stock: int = 2, bays: int = 2) -> Snapshot:
    slots = 8
    return Snapshot(
        aircraft_ids=tuple(f"AC-{i:03d}" for i in range(4)),
        slot_aircraft=np.repeat(np.arange(4), 2),
        slot_part=np.zeros(slots, dtype=int),
        slot_agency=np.zeros(slots, dtype=int),
        repair_days=np.full(slots, 3.0),
        rul=np.tile([[4.0, 10.0, 20.0]], (slots, 1)),
        risk30=np.full(slots, 0.8),
        background_hazard=np.full(slots, 0.001),
        stock=np.array([stock]),
        reorder_level=np.array([0]),
        lead_time=np.array([20]),
        receipts=(),
        bays=np.array([bays]),
        open_work=(OpenWork(0, 3, "unscheduled", 0, True),),
        inspection_due_day=np.full(4, 100),
        inspection_days=2,
        inspection_agency=0,
    )


def test_simulation_reproducible_with_seed() -> None:
    first = simulate_fleet(_snapshot(), 30, 50, 11).describe()
    second = simulate_fleet(_snapshot(), 30, 50, 11).describe()
    assert first == second


def test_removing_spares_never_raises_availability() -> None:
    snapshot = _snapshot(stock=3)
    base = simulate_fleet(snapshot, 30, 100, 3)
    blocked_part = Intervention("spare_unavailable", part=0, lead_time_days=40)
    blocked = simulate_fleet(snapshot, 30, 100, 3, (blocked_part,))
    assert blocked.availability.mean() <= base.availability.mean() + 1e-9


def test_adding_capacity_never_lowers_availability() -> None:
    snapshot = _snapshot(stock=8, bays=1)
    base = simulate_fleet(snapshot, 30, 100, 3)
    extra = Intervention("extra_capacity", agency=0, extra_bays=2)
    wider = simulate_fleet(snapshot, 30, 100, 3, (extra,))
    assert wider.availability.mean() >= base.availability.mean() - 1e-9


def test_simulation_rejects_out_of_range_horizon() -> None:
    with pytest.raises(ValueError):
        simulate_fleet(replace(_snapshot()), 90, 50, 1)


def test_health_state_thresholds() -> None:
    assert health_state(92, 0.01) == "healthy"
    assert health_state(70, 0.01) == "watch"
    assert health_state(50, 0.01) == "degraded"
    assert health_state(30, 0.01) == "critical"
    assert health_state(95, 0.8) == "critical"
    assert risk_band(0.1) == "low" and risk_band(0.5) == "high" and risk_band(0.75) == "critical"


def test_recommended_action_rules() -> None:
    urgent = {"p10": 3, "p50": 8, "p90": 20}
    assert _action("critical", 5, 0.9, urgent, True)["code"] == "ground_now"
    replace_action = _action("degraded", 3, 0.4, {"p10": 10, "p50": 18, "p90": 30}, False)
    assert replace_action["code"] == "replace_within" and replace_action["within_days"] == 7
    calm = {"p10": 40, "p50": 60, "p90": 60}
    assert _action("watch", 3, 0.05, calm, False)["code"] == "inspect"
    assert _action("healthy", 3, 0.05, calm, False)["code"] == "monitor"


def test_identifier_normalisation() -> None:
    assert normalise_tail("SYN AC 17") == "AC-017"
    assert normalise_tail("ac_09") == "AC-009"
    assert normalise_tail("TAIL-9") is None
    assert normalise_part("hyd-114") == "HYD-114"
    assert normalise_part("HYD114-A") == "HYD-114"
    assert normalise_part("NSN-HYD-114") is None


def test_reliability_kpis_match_hand_computed_fixture() -> None:
    from types import SimpleNamespace

    from fleet_maintenance.science.fleet.decisions import reliability_kpis

    # Two aircraft over 10 days: 3 down days (one unscheduled order, 2 days in bay after 1 day
    # waiting for a spare) and 17 available days.
    state = np.zeros((2, 10), dtype=np.int8)
    state[0, 2] = 3
    state[0, 3:5] = 2
    orders = [
        {
            "kind": "unscheduled",
            "slot": 0,
            "opened_day": 1,
            "bay_start_day": 3,
            "done_day": 4,
            "promised_day": 4,
            "part": "P-1",
            "spare_wait_days": 1,
        }
    ]
    bundle = SimpleNamespace(
        arrays={"aircraft_state": state, "flight_hours": np.full((2, 10), 2.0)},
        records={"work_orders": orders},
        slots=[{"type": "T1"}],
        types=[{"code": "T1", "name": "Pump", "system": "HYD", "unwarned_failure_share": None}],
        start=date(2026, 1, 1),
        as_of=date(2026, 1, 10),
    )
    k = reliability_kpis(bundle)  # type: ignore[arg-type]
    assert k["fleet_availability"] == pytest.approx(17 / 20)
    assert k["mttr_days"] == pytest.approx(2.0)  # done 4 - bay start 3 + 1
    assert k["mean_downtime_days"] == pytest.approx(3.0)  # done 4 - opened 1
    assert k["inherent_availability"] == pytest.approx(17 / (17 + 2), abs=1e-4)
    assert k["operational_availability"] == pytest.approx(17 / (17 + 3), abs=1e-4)
    assert k["failure_rate_per_1000_fh"] == pytest.approx(1000 / 40, abs=1e-3)
    assert k["spare_fill_rate"] == 0.0
    assert k["downtime_days_by_cause"] == {
        "scheduled_maintenance": 0,
        "unscheduled_repair": 2,
        "awaiting_spares": 1,
        "awaiting_agency": 0,
    }


def test_workspace_decisions_change_effective_availability(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    from types import SimpleNamespace

    from fleet_maintenance.science.fleet.decisions import Overlay, effective_aircraft_state

    state = np.zeros((3, 5), dtype=np.int8)
    state[0, 4] = 2  # AC-A grounded by one agency repair
    state[1, 4] = 4  # AC-B grounded by two orders
    orders = [
        {"id": "WO-1", "aircraft": "A"},
        {"id": "WO-2", "aircraft": "B"},
        {"id": "WO-3", "aircraft": "B"},
    ]
    bundle = SimpleNamespace(
        replay_start_day=0,
        arrays={"aircraft_state": state},
        aircraft=[{"id": "A"}, {"id": "B"}, {"id": "C"}],
        aircraft_index={"A": 0, "B": 1, "C": 2},
        open_work_orders=lambda day: orders,
    )
    planned = [{"id": "PWO-1", "aircraft": "C", "status": "in_progress", "component_id": "C-X"}]
    overlay = Overlay({}, planned, (), frozenset({"WO-1", "WO-2"}))
    monkeypatch.setattr(
        "fleet_maintenance.science.fleet.decisions.component_states", lambda *args: []
    )
    monkeypatch.setattr(
        "fleet_maintenance.science.fleet.decisions.scheduled_tasks", lambda *args: []
    )
    result = effective_aircraft_state(bundle, 4, overlay)  # type: ignore[arg-type]
    assert list(result) == [0, 4, 1]  # A returned; B still has WO-3; C grounded by started work


def test_project_forge_prints_zero_stock_part_in_a_day() -> None:
    from fleet_maintenance.science.fleet.catalog import PRINT_DAYS
    from fleet_maintenance.science.fleet.decisions import spare_check

    position = {
        "part_number": "HYD-020",
        "on_hand": 0,
        "reserved": 0,
        "on_order": 0,
        "next_receipt": None,
        "next_receipt_in_days": None,
        "lead_time_days": 45,
        "available": 0,
        "competing_components": ["X"],
        "competing_rul_days": [3.0],
    }
    supplier = spare_check(position, "X", 3.0)
    assert supplier["status"] == "short" and supplier["lead_time_exceeds_rul"]
    printed = spare_check({**position, "additive_printable": True}, "X", 3.0)
    assert printed["status"] == "additive_print"
    assert printed["lead_time_days"] == PRINT_DAYS == 1
    assert printed["supplier_lead_time_days"] == 45
    assert not printed["lead_time_exceeds_rul"] and not printed["fleet_shortfall"]


def test_project_forge_beats_supplier_in_simulation() -> None:
    supplier = replace(_snapshot(stock=0), lead_time=np.array([45]))
    printed = replace(supplier, printable=np.array([True]))
    base = simulate_fleet(supplier, 30, 100, 3)
    forge = simulate_fleet(printed, 30, 100, 3)
    assert forge.availability.mean() > base.availability.mean()
    # Even with the supplier cut off, the print route keeps parts flowing.
    cut = (Intervention("spare_unavailable", part=0, lead_time_days=90),)
    assert simulate_fleet(printed, 30, 100, 3, cut).availability.mean() == pytest.approx(
        forge.availability.mean()
    )


def _cannibal_case(seed: int):  # type: ignore[no-untyped-def]
    from types import SimpleNamespace

    from fleet_maintenance.science.fleet.cannibalize import Donor, Need

    rng = np.random.default_rng(seed)
    codes = ["P", "Q", "R"]
    types = [
        {
            "code": c,
            "part_number": f"PN-{c}",
            "repair_days": float(rng.uniform(1, 6)),
            "lead_time_days": 45,
        }
        for c in codes
    ]
    aircraft = [{"id": f"AC-{i}", "base": "N" if i % 2 else "S"} for i in range(7)]
    bundle = SimpleNamespace(
        types=types,
        part_index={t["part_number"]: i for i, t in enumerate(types)},
        aircraft=aircraft,
        aircraft_index={a["id"]: i for i, a in enumerate(aircraft)},
    )
    needs: dict[str, list[Need]] = {}
    for a in rng.choice(7, size=4, replace=False):
        picks = rng.choice(3, size=int(rng.integers(1, 3)), replace=False)
        needs[f"AC-{a}"] = [
            Need(f"AC-{a}", codes[p], f"PN-{codes[p]}", None, f"WO-{a}{p}", 30.0) for p in picks
        ]
    donors = [
        Donor(f"AC-{a}", f"AC-{a}-{codes[p]}{k}", codes[p], 90.0, aircraft[a]["base"])
        for a in range(7)
        for k, p in enumerate(rng.choice(3, size=2))
        if rng.random() < 0.5
    ]
    return bundle, needs, donors


@pytest.mark.parametrize("seed", range(25))
def test_cannibalization_plan_is_feasible_and_checked_against_optimum(seed: int) -> None:
    from fleet_maintenance.science.fleet.cannibalize import _swap_hours, exact, greedy

    bundle, needs, donors = _cannibal_case(seed)
    restored, swaps = greedy(bundle, needs, donors)
    used = [d.component_id for _, d in swaps]
    assert len(used) == len(set(used))  # no unit moved twice
    assert all(n.type_code == d.type_code and n.aircraft != d.aircraft for n, d in swaps)
    assert not {d.aircraft for _, d in swaps} & set(restored)  # donors stay down
    for aircraft in restored:  # every unblocked aircraft gets all its parts
        assert sorted(n.type_code for n, _ in swaps if n.aircraft == aircraft) == sorted(
            n.type_code for n in needs[aircraft]
        )
    best = exact(bundle, needs, donors)
    assert best is not None
    labour = sum(_swap_hours(bundle, n, d) for n, d in swaps)
    assert len(restored) <= best[0]
    if len(restored) == best[0]:
        assert labour >= best[1] - 1e-6
    # The exact plan is itself feasible.
    exact_used = [d.component_id for _, d in best[2]]
    assert len(exact_used) == len(set(exact_used))
    assert all(n.type_code == d.type_code for n, d in best[2])
    assert not {d.aircraft for _, d in best[2]} & {n.aircraft for n, _ in best[2]}
