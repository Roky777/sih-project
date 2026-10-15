import { HeadingReplay } from "./ReplaySlider";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon, type IconName } from "../../shared/ui/Icon";
import { useAdvisories, useInventory, useRunScenario, useScenarios, type ScenarioRequest, type ScenarioRun } from "./api";
import { availabilityLabel, longDate, num, pct, scenarioLabel, shortDate, signed } from "./format";
import { OpsChart, baseAxes, tooltip, usePalette } from "./OpsChart";
import { can, useRole } from "./roles";
import { Card, EmptyState, Pill, Query, Segmented, useToast } from "./ui";

type Kind = ScenarioRequest["kind"];
const kinds: { kind: Kind; icon: IconName; text: string }[] = [
  { kind: "schedule_maintenance", icon: "calendar", text: "Replace a component on a chosen day instead of waiting for it to fail" },
  { kind: "spare_unavailable", icon: "box", text: "A critical part is out of stock and its lead time stretches" },
  { kind: "early_replacement", icon: "spark", text: "Act early on every P1 (and optionally P2) prediction" },
  { kind: "extra_capacity", icon: "layers", text: "Add a bay or a shift at one maintenance agency" },
];
type Result = { assumptions?: { aircraft_count: number; exposure_aircraft_days: number; availability_formula: string; comparison_formula: string; failure_model: string; repair_model: string; [key: string]: unknown }; dates: string[]; baseline: Summary; scenario: Summary; delta: { availability_pct_points: number; aircraft_days_lost: number; by_cause: Record<string, number> }; by_aircraft: { aircraft: string; delta_aircraft_days: number }[]; stockouts: { part_number: string; baseline: number; scenario: number }[]; baseline_includes_planned_work: number; framing: string };
type Summary = { curve: { p10: number[]; p50: number[]; p90: number[]; mean: number[] }; availability_mean: number; availability_p10: number; availability_p90: number; aircraft_days_lost: number; by_cause: Record<string, number>; expected_failures: number };
const result = (run: ScenarioRun) => run.results as unknown as Result;

export function SimulatorPage({ embedded = false }: { embedded?: boolean }) {
  const scenarios = useScenarios();
  const [query] = useSearchParams();
  // ?scenario=<id> (e.g. "Open in Simulator" from the copilot) selects that saved run.
  const [compare, setCompare] = useState<string[]>(() => query.get("scenario") ? [query.get("scenario")!] : []);
  useEffect(() => { if (scenarios.data && compare.length === 0 && scenarios.data.length) setCompare([scenarios.data[0].id]); }, [scenarios.data, compare.length]);
  const chosen = (scenarios.data ?? []).filter(run => compare.includes(run.id));
  return <div className="o-screen">
    {!embedded && <div className="o-screen-head"><h1>Scenario Simulator</h1><span>Monte Carlo discrete-event simulation · shared random numbers · synthetic data</span><HeadingReplay/></div>}
    <div className="o-grid-12 o-sim-grid">
      <div className="span-3"><Builder onRan={run => setCompare(list => [run.id, ...list.filter(id => id !== run.id)].slice(0, 3))}/></div>
      <div className="span-9 o-stack">
        <Card title="Availability curves" subtitle={chosen.length ? `Baseline (current plan, grey dotted) vs ${chosen.length} intervention${chosen.length > 1 ? "s" : ""} · P10–P90 shaded` : "Run or select a scenario"}>
          {chosen.length === 0 ? <EmptyState title="No scenario selected" icon="sliders">Set parameters on the left, or pick saved runs below (up to three).</EmptyState> : <Comparison runs={chosen}/>}
        </Card>
        <Card title="Saved runs" subtitle="Select up to three to compare. Runs belong to the current engine bundle.">
          <Query query={scenarios} rows={4}>{runs => runs.length === 0 ? <EmptyState title="No saved runs yet" icon="sliders"/> : <div className="o-run-list">{runs.map(run => { const r = result(run); const on = compare.includes(run.id); return <button type="button" key={run.id} className={`o-run${on ? " on" : ""}`} onClick={() => setCompare(list => on ? list.filter(id => id !== run.id) : [...list, run.id].slice(-3))}>
            <span className="o-run-check">{on && <Icon name="check" size={13}/>}</span>
            <div><strong>{run.name}</strong><small>{scenarioLabel[run.kind]} · {run.horizon_days} d · {run.runs} runs · {shortDate(run.created_at)} by {run.created_by}</small></div>
            <b className={r.delta.availability_pct_points >= 0 ? "o-tone-healthy" : "o-tone-critical"}>{signed(r.delta.availability_pct_points, 2, " pts")}</b>
          </button>; })}</div>}</Query>
        </Card>
      </div>
    </div>
  </div>;
}

function Builder({ onRan }: { onRan: (run: ScenarioRun) => void }) {
  const [params] = useSearchParams();
  const advisories = useAdvisories();
  const inventory = useInventory();
  const { role } = useRole();
  const run = useRunScenario();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>((params.get("kind") as Kind) || "schedule_maintenance");
  const [component, setComponent] = useState(params.get("component") ?? "");
  const [startIn, setStartIn] = useState(1);
  const [part, setPart] = useState(params.get("part") ?? "HYD-114");
  const [lead, setLead] = useState(60);
  const [levels, setLevels] = useState<string[]>(["P1"]);
  const [components] = useState(params.get("components")?.split(",").filter(Boolean) ?? []);
  const [agency, setAgency] = useState("AG-BASE");
  const [bays, setBays] = useState(1);
  const [horizon, setHorizon] = useState<"14" | "30" | "45" | "60">("30");
  const [runs, setRuns] = useState<"100" | "300" | "500">("300");
  const options = useMemo(() => (advisories.data ?? []).filter(a => !["completed", "dismissed"].includes(a.status)), [advisories.data]);
  useEffect(() => { if (!component && options.length) setComponent(options[0].component_id); }, [options, component]);
  const allowed = can.simulate(role.id);
  const describe = () => kind === "schedule_maintenance" ? `Replace ${component} in ${startIn} d` : kind === "spare_unavailable" ? `${part} unavailable (${lead} d lead)` : kind === "early_replacement" ? (components.length ? `Early replacement of ${components.length} selected` : `Early replacement: ${levels.join("+")}`) : `+${bays} bay at ${agency}`;
  const submit = () => {
    const body: ScenarioRequest = { name: describe(), kind, horizon_days: Number(horizon), runs: Number(runs), seed: 7, params:
      kind === "schedule_maintenance" ? { component_id: component, start_in_days: startIn } : kind === "spare_unavailable" ? { part_number: part, lead_time_days: lead }
        : kind === "early_replacement" ? (components.length ? { component_ids: components } : { priority_levels: levels }) : { agency_id: agency, extra_bays: bays } };
    run.mutate(body, { onSuccess: data => { onRan(data); toast({ tone: "success", title: "Scenario complete", body: `${data.name}: ${signed(result(data).delta.availability_pct_points, 2, " pts")} availability` }); }, onError: error => toast({ tone: "error", title: "Scenario failed", body: error.message }) });
  };
  return <Card title="Build a scenario" subtitle="Interventions are applied on top of the current plan (planned work orders are part of the baseline)." className="o-builder">
    <label className="o-field">Select scenario type<select value={kind} onChange={event => setKind(event.target.value as Kind)}>{kinds.map(item => <option key={item.kind} value={item.kind}>{scenarioLabel[item.kind]}</option>)}</select><small>{kinds.find(item => item.kind === kind)?.text}</small></label>
    <div className="o-builder-fields">
      {kind === "schedule_maintenance" && <>
        <label className="o-field">Component<select value={component} onChange={event => setComponent(event.target.value)}>{component && !options.some(o => o.component_id === component) && <option value={component}>{component}</option>}{options.map(a => <option key={a.id} value={a.component_id}>{a.priority.level} · {a.aircraft} {a.component_name} — risk {pct(a.risk_14d)}</option>)}</select></label>
        <label className="o-field">Replace in <b>{startIn} days</b><input type="range" min={0} max={30} value={startIn} onChange={event => setStartIn(Number(event.target.value))}/><small>Compare 0–2 days against deferring 10+ days by running both</small></label>
      </>}
      {kind === "spare_unavailable" && <>
        <label className="o-field">Part number<select value={part} onChange={event => setPart(event.target.value)}>{(inventory.data ?? []).map(item => <option key={item.part_number} value={item.part_number}>{item.part_number} · {item.description} ({item.status.replace("_", " ")})</option>)}</select></label>
        <label className="o-field">Lead time <b>{lead} days</b><input type="range" min={10} max={120} step={5} value={lead} onChange={event => setLead(Number(event.target.value))}/><small>Stock set to zero and pending receipts removed</small></label>
      </>}
      {kind === "early_replacement" && (components.length ? <p className="o-note"><Icon name="list" size={16}/>{components.length} components selected in the risk queue: {components.join(", ")}</p>
        : <div className="o-field">Act early on<div className="o-filters o-filters-tight">{["P1", "P2", "P3"].map(level => <button type="button" key={level} className={`o-chip${levels.includes(level) ? " on" : ""}`} onClick={() => setLevels(list => list.includes(level) ? list.filter(l => l !== level) : [...list, level])}>{level} advisories</button>)}</div><small>All selected replacements start on day 1, so bay and spare contention is part of the result</small></div>)}
      {kind === "extra_capacity" && <>
        <label className="o-field">Agency<select value={agency} onChange={event => setAgency(event.target.value)}><option value="AG-LINE">Line maintenance unit</option><option value="AG-BASE">Base repair workshop</option><option value="AG-DEPOT">Depot overhaul agency</option></select></label>
        <label className="o-field">Extra bays <b>{bays}</b><input type="range" min={1} max={3} value={bays} onChange={event => setBays(Number(event.target.value))}/></label>
      </>}
      <div className="o-field">Horizon<Segmented label="Horizon" value={horizon} onChange={setHorizon} options={[["14", "14 d"], ["30", "30 d"], ["45", "45 d"], ["60", "60 d"]] as const}/></div>
      <div className="o-field">Monte Carlo runs<Segmented label="Runs" value={runs} onChange={setRuns} options={[["100", "100"], ["300", "300"], ["500", "500"]] as const}/></div>
    </div>
    <button type="button" className="o-big-btn o-btn-wide" disabled={!allowed || run.isPending || (kind === "schedule_maintenance" && !component)} onClick={submit}>{run.isPending ? <><span className="o-spinner sm"/>SIMULATING {runs} RUNS…</> : <>RUN {runs} MONTE CARLO SIMULATIONS</>}</button>
    {!allowed && <p className="o-muted o-small">Fleet managers (commanders) and supervisors run scenarios.</p>}
    <p className="o-muted o-small">Decision-support simulation on synthetic data, not operational planning. Seeded for reproducibility.</p>
  </Card>;
}

function Comparison({ runs }: { runs: ScenarioRun[] }) {
  const [focus, setFocus] = useState(runs[0].id);
  const active = runs.find(run => run.id === focus) ?? runs[0];
  const base = result(runs[0]);
  const palette = usePalette();
  const colors = () => [palette.accent, palette.accent2, palette.watch];
  return <>
    <div className="o-delta-grid">
      <div className="o-delta base"><span>Baseline (current plan)</span><b>{pct(base.baseline.availability_mean, 1)}</b><small>{num(base.baseline.aircraft_days_lost, 0)} aircraft-days lost · P10–P90 {pct(base.baseline.availability_p10)}–{pct(base.baseline.availability_p90)}</small></div>
      {runs.map((run, index) => { const r = result(run); return <button type="button" key={run.id} className={`o-delta${run.id === active.id ? " on" : ""}`} onClick={() => setFocus(run.id)}>
        <span><i style={{ background: colors()[index] }}/>{run.name}</span>
        <b className={r.delta.availability_pct_points >= 0 ? "o-tone-healthy" : "o-tone-critical"}>{signed(r.delta.availability_pct_points, 2, " pts")}</b>
        <small>{signed(r.delta.aircraft_days_lost, 1)} aircraft-days · {pct(r.scenario.availability_mean, 1)} mean</small>
      </button>; })}
    </div>
    <OpsChart label="Availability curves: baseline and scenarios with P10–P90 bands" height={300} deps={[runs]} build={p => {
      const dates = base.dates;
      const band = (summary: Summary, color: string, key: string) => [
        { name: `${key} floor`, type: "line" as const, stack: key, data: summary.curve.p10, lineStyle: { opacity: 0 }, symbol: "none", tooltip: { show: false } },
        { name: `${key} band`, type: "line" as const, stack: key, data: summary.curve.p90.map((v, i) => v - summary.curve.p10[i]), lineStyle: { opacity: 0 }, symbol: "none", areaStyle: { color, opacity: 0.1 }, tooltip: { show: false } },
      ];
      return {
        grid: { left: 44, right: 14, top: 14, bottom: 28 }, tooltip: { ...tooltip(p), valueFormatter: (v: unknown) => typeof v === "number" ? pct(v, 1) : "—" },
        xAxis: { type: "category", data: dates, boundaryGap: false, ...baseAxes(p), axisLabel: { color: p.muted, fontSize: 11, formatter: (v: string) => shortDate(v) } },
        yAxis: { type: "value", min: (v: { min: number }) => Math.max(0, Math.floor(v.min * 20) / 20 - 0.05), max: 1, ...baseAxes(p), axisLabel: { color: p.muted, fontSize: 11, formatter: (v: number) => pct(v) } },
        series: [
          ...band(base.baseline, p.neutral, "Baseline"),
          { name: "Baseline (current plan)", type: "line", data: base.baseline.curve.p50, symbol: "none", lineStyle: { width: 2, color: p.neutral, type: "dotted" } },
          ...runs.flatMap((run, index) => { const r = result(run); return [...band(r.scenario, colors()[index], run.id), { name: run.name, type: "line" as const, data: r.scenario.curve.p50, symbol: "none", lineStyle: { width: 2.4, color: colors()[index] } }]; }),
        ],
      };
    }}/>
    <ImpactStrip run={active}/>
    <div className="o-note" aria-label="Simulation assumptions and formula"><div><strong>Simulated availability — calculation and assumptions</strong><p>Availability = 1 − mean unavailable aircraft-days ÷ (aircraft × horizon days). Change = 100 × (scenario − baseline), in percentage points. A positive change is a simulated projection, not an observed operational improvement.</p>
      {result(active).assumptions ? <><p>{result(active).assumptions!.aircraft_count} aircraft × {active.horizon_days} days = {result(active).assumptions!.exposure_aircraft_days} aircraft-days. Baseline lost {num(result(active).baseline.aircraft_days_lost, 2)}; intervention lost {num(result(active).scenario.aircraft_days_lost, 2)} aircraft-days.</p><p>{result(active).assumptions!.repair_model}</p><details><summary>Frozen downtime, stock, capacity and intervention inputs</summary><pre>{JSON.stringify(result(active).assumptions, null, 2)}</pre></details></> : <p>This older run does not retain the full assumptions snapshot. Run a new scenario to inspect its actual denominator and downtime inputs.</p>}
    </div></div>
    <div className="o-grid o-cols-2" style={{ marginTop: 6 }}>
      <div><h4 className="o-sub">Change in aircraft-days lost by cause · {active.name}</h4>
        <OpsChart label="Change in downtime by cause" height={190} deps={[active]} build={p => { const entries = Object.entries(result(active).delta.by_cause); return {
          grid: { left: 120, right: 20, top: 6, bottom: 20 }, tooltip: { ...tooltip(p), axisPointer: { type: "shadow" } },
          xAxis: { type: "value", ...baseAxes(p) }, yAxis: { type: "category", data: entries.map(([cause]) => availabilityLabel[cause] ?? cause), ...baseAxes(p) },
          series: [{ type: "bar", barWidth: "50%", data: entries.map(([, value]) => ({ value, itemStyle: { color: value > 0 ? p.critical : p.healthy, borderRadius: 4 } })) }],
        }; }}/>
      </div>
      <div><h4 className="o-sub">Most affected aircraft</h4>
        <ul className="o-impact-list">{result(active).by_aircraft.slice(0, 7).map(row => <li key={row.aircraft}><Link to={`/aircraft/${row.aircraft}`}>{row.aircraft}</Link><span className="o-impact-bar"><span className={row.delta_aircraft_days > 0 ? "o-bg-critical" : "o-bg-healthy"} style={{ width: `${Math.min(100, Math.abs(row.delta_aircraft_days) / Math.max(...result(active).by_aircraft.map(r => Math.abs(r.delta_aircraft_days)), 0.1) * 100)}%` }}/></span><b className={row.delta_aircraft_days > 0 ? "o-tone-critical" : "o-tone-healthy"}>{signed(row.delta_aircraft_days, 1)} d</b></li>)}
          {result(active).by_aircraft.length === 0 && <li className="o-muted">No aircraft changes by more than 0.05 days</li>}</ul>
        {result(active).stockouts.length > 0 && <><h4 className="o-sub">Stock-out probability</h4><ul className="o-impact-list">{result(active).stockouts.slice(0, 4).map(row => <li key={row.part_number}><span className="o-mono">{row.part_number}</span><span className="o-muted o-small">{pct(row.baseline)} → </span><b className={row.scenario > row.baseline ? "o-tone-critical" : "o-tone-healthy"}>{pct(row.scenario)}</b></li>)}</ul></>}
      </div>
    </div>
    <p className="o-muted o-small">{result(active).framing} Baseline includes {result(active).baseline_includes_planned_work} planned work order(s). {active.runs} runs · seed {active.seed} · {active.horizon_days}-day horizon · created {longDate(active.created_at)}.</p>
    {result(active).delta.availability_pct_points < 0 && active.kind === "schedule_maintenance" && <p className="o-note warn"><Icon name="info" size={16}/>Replacing early lowers availability here. Check the stock-out and per-aircraft lists: an early replacement can consume the only spare that another aircraft’s failing part needs.</p>}
    <div className="o-legend"><Pill tone="neutral">Shared random numbers</Pill><Pill tone="neutral">Failures from RUL quantiles</Pill><Pill tone="neutral">Bays, spares and inspections modelled</Pill></div>
  </>;
}

/** Bottom impact strip: three numbers taken directly from the baseline vs scenario difference. */
function ImpactStrip({ run }: { run: ScenarioRun }) {
  const advisories = useAdvisories();
  const r = result(run);
  const params = run.params as { component_id?: string; part_number?: string; component_ids?: string[] };
  const targetPart = params.part_number ?? (params.component_id ? advisories.data?.find(a => a.component_id === params.component_id)?.spare.part_number : undefined);
  const target = r.stockouts.find(row => row.part_number === targetPart);
  const best = [...r.stockouts].sort((a, b) => (b.baseline - b.scenario) - (a.baseline - a.scenario))[0];
  const stock = target ?? best;
  const avoided = stock ? stock.baseline - stock.scenario : 0;
  const uplift = r.delta.availability_pct_points;
  const saved = -r.delta.aircraft_days_lost;
  const cls = (value: number) => value > 0.005 ? "good" : value < -0.005 ? "bad" : "flat";
  return <div className="o-impact-strip">
    <div className={cls(uplift)}><span>Availability uplift</span><b>{signed(uplift, 1, "%")}</b><small>mean over {run.horizon_days} days · percentage points</small></div>
    <div className={cls(saved)}><span>Aircraft-days saved</span><b>{signed(saved, 1)} days</b><small>{num(r.baseline.aircraft_days_lost, 0)} → {num(r.scenario.aircraft_days_lost, 0)} lost</small></div>
    <div className={cls(avoided)}><span>Stock-out probability avoided</span><b>{stock ? signed(avoided * 100, 0, "%") : "—"}</b><small>{stock ? `${stock.part_number}: ${pct(stock.baseline)} → ${pct(stock.scenario)}` : "no part at risk in this scenario"}</small></div>
  </div>;
}
