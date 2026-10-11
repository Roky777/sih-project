import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { useAsOf } from "./AsOf";
import { useAdvisories, useAlerts, useHeatGrid, useSummary, useTrend, type Advisory, type HeatGrid } from "./api";
import { availabilityLabel, longDate, num, pct, rulText, shortDate, stateLabel } from "./format";
import { MONO, OpsChart, areaFill, baseAxes, tooltip, withAlpha } from "./OpsChart";
import { FlowStrip } from "./FlowStrip";
import { FleetGroundingDetails } from "./WorkflowPages";
import { HeadingReplay } from "./ReplaySlider";
import { Card, PriorityBadge, Query, Segmented, StateBadge } from "./ui";

/** Screen 1 · Fleet Dashboard (UI spec §3): every value is computed by the engine and simulator. */
export function FleetDashboard() {
  const summary = useSummary();
  const trend = useTrend();
  const alerts = useAlerts();
  const { asOf } = useAsOf();
  const navigate = useNavigate();
  const s = summary.data;
  const forecast = s?.forecast_30d as { availability_mean: number; availability_p10: number; availability_p90: number } | undefined;
  const delta = s ? s.availability_today - s.availability_7d : 0;
  const falling = s && forecast ? forecast.availability_mean < s.availability_today : false;
  const urgent = s ? (s.open_advisories.P1 ?? 0) + (s.open_advisories.P2 ?? 0) : null;
  const critical = alerts.data?.filter(alert => alert.severity === "critical" && !alert.acknowledged_by) ?? [];
  const tone = (value: number) => value >= 0.8 ? "healthy" : value >= 0.7 ? "watch" : "critical";
  return <div className="o-screen">
    <div className="o-screen-head o-dashboard-heading">
      <div className="o-dashboard-heading-copy">
        <h1>Fleet Dashboard</h1>
        <span>{s ? `${s.aircraft} aircraft · as of ${longDate(s.as_of)}` : ""}{asOf ? " · REPLAY (read only)" : ""}</span>
        {critical.length > 0 && !asOf && <Link className="o-head-alert" to="/notifications"><Icon name="warning" size={14}/>{critical.length} critical alert{critical.length === 1 ? "" : "s"}</Link>}
      </div>
      <HeadingReplay/>
    </div>
    <FlowStrip compact/>
    <div className="o-kpi-row">
      <KpiBlock label="Fleet availability" value={s ? pct(s.availability_today, 0) : "—"} tone={s ? tone(s.availability_today) : undefined} big
        chip={s ? { text: `${delta >= 0 ? "+" : "−"}${Math.abs(delta * 100).toFixed(1)} pts`, up: delta >= 0 } : undefined}
        sub={s ? `vs 7-day average · ${s.by_availability_state.available}/${s.aircraft} aircraft available` : ""}/>
      <KpiBlock label="30-day forecast" value={forecast ? pct(forecast.availability_mean, 0) : "—"} tone={forecast ? (falling ? "critical" : "healthy") : undefined} big
        chip={s && forecast ? { text: `${forecast.availability_mean >= s.availability_today ? "+" : "−"}${Math.abs((forecast.availability_mean - s.availability_today) * 100).toFixed(1)} pts`, up: forecast.availability_mean >= s.availability_today } : undefined}
        sub={forecast ? `${falling ? "Trending down" : "Stable or improving"} · P10–P90 ${pct(forecast.availability_p10)}–${pct(forecast.availability_p90)}` : ""}/>
      <KpiBlock label="Open P1/P2 advisories" value={urgent === null ? "—" : String(urgent)} tone="watch" onClick={() => navigate("/advisories")}
        sub={s ? `${s.open_advisories.P1 ?? 0} P1 · ${s.open_advisories.P2 ?? 0} P2` : ""}/>
      <KpiBlock label="Current backlog" value={s ? `${num(s.backlog.man_hours)} Hrs` : "—"} onClick={() => navigate("/maintenance")}
        sub={s ? `${s.backlog.open_work_orders} open work orders` : ""}/>
      <KpiBlock label="Parts at risk" value={s ? String(s.parts_at_risk.length) : "—"} tone={s && s.parts_at_risk.length ? "critical" : "healthy"} onClick={() => navigate("/spares")}
        sub={s?.parts_at_risk.slice(0, 3).join(" · ") || "No shortfall flagged"}/>
    </div>
    <div className="o-grid-12">
      <Card className="span-7" title="Availability trend" subtitle="T−14 to T+30 · recorded (solid) and Monte Carlo forecast median (dotted) with P10–P90 band">
        <Query query={trend} rows={5}>{data => <TrendChart data={data}/>}</Query>
      </Card>
      <Card className="span-5" title="Downtime by cause" subtitle="Aircraft-days lost per week, last 5 weeks">
        <Query query={trend} rows={5}>{data => <DowntimeWeeks history={data.history}/>}</Query>
      </Card>
    </div>
    <div className="o-grid-12">
      <Card className="span-5" title="Aircraft × system health" subtitle="Worst component state per system. Hover for the driver, click to open the aircraft.">
        <HeatMatrix/>
      </Card>
      <Card className="span-7" title="Highest-priority advisories" subtitle="From the predictive engine and the rule-based priority engine" actions={<Link className="o-link" to="/advisories">Full queue<Icon name="arrow" size={13}/></Link>}>
        <TopAdvisories/>
      </Card>
    </div>
    <FleetGroundingDetails/>
  </div>;
}

function KpiBlock({ label, value, sub, tone, big, chip, onClick }: { label: string; value: string; sub: string; tone?: string; big?: boolean; chip?: { text: string; up: boolean }; onClick?: () => void }) {
  const body = <><span className="o-kpi-block-label">{label}{chip && <span className={`o-chip-delta ${chip.up ? "up" : "down"}`}>{chip.text}</span>}</span><strong className={`${big ? "big" : ""}${tone ? ` o-tone-${tone}` : ""}`}>{value}</strong><small>{sub}</small></>;
  return onClick ? <button type="button" className="o-kpi-block" onClick={onClick}>{body}</button> : <div className="o-kpi-block">{body}</div>;
}

function TrendChart({ data }: { data: NonNullable<ReturnType<typeof useTrend>["data"]> }) {
  const history = data.history.slice(-15);
  const dates = [...history.map(point => point.date), ...data.forecast.map(point => point.date)];
  const pad = (values: (number | null)[], before: number, after: number) => [...Array(before).fill(null), ...values, ...Array(after).fill(null)];
  const last = history.at(-1);
  return <OpsChart label="Availability trend T−14 to T+30 with forecast band" height={260} deps={[data]} build={p => ({
    grid: { left: 42, right: 12, top: 14, bottom: 24 },
    tooltip: { ...tooltip(p), valueFormatter: (value: unknown) => typeof value === "number" ? pct(value, 1) : "—" },
    xAxis: { type: "category", data: dates, boundaryGap: false, ...baseAxes(p), axisLabel: { color: p.muted, fontSize: 10.5, fontFamily: MONO, formatter: (value: string, index: number) => index === history.length - 1 ? "T0" : shortDate(value) } },
    yAxis: { type: "value", min: 0, max: 1, splitNumber: 4, ...baseAxes(p), axisLabel: { color: p.muted, fontSize: 10.5, fontFamily: MONO, formatter: (value: number) => pct(value) } },
    series: [
      { name: "P10", type: "line", data: pad(data.forecast.map(f => f.p10), history.length, 0), stack: "band", lineStyle: { opacity: 0 }, symbol: "none", tooltip: { show: false } },
      { name: "P10–P90", type: "line", data: pad(data.forecast.map(f => f.p90 - f.p10), history.length, 0), stack: "band", lineStyle: { opacity: 0 }, symbol: "none", areaStyle: { color: withAlpha(p.accent, 0.12) }, tooltip: { show: false } },
      { name: "Recorded", type: "line", data: pad(history.map(h => h.availability), 0, data.forecast.length), symbol: "none", smooth: 0.35, lineStyle: { width: 2.4, color: p.accent }, areaStyle: areaFill(p.accent),
        markLine: { symbol: "none", silent: true, label: { formatter: "T0", color: p.muted, fontSize: 10, fontFamily: MONO }, lineStyle: { color: p.grid, type: "solid" }, data: [{ xAxis: last?.date ?? "" }] } },
      { name: "Forecast P50", type: "line", data: pad([last?.availability ?? null, ...data.forecast.map(f => f.p50)], history.length - 1, 0), symbol: "none", smooth: 0.35, lineStyle: { width: 2, type: "dashed", color: p.neutral } },
    ],
  })}/>;
}

function DowntimeWeeks({ history }: { history: { date: string; scheduled_maintenance: number; unscheduled_repair: number; awaiting_spares: number; awaiting_agency: number }[] }) {
  const weeks = useMemo(() => {
    const days = history.slice(-35);
    return Array.from({ length: 5 }, (_, index) => {
      const chunk = days.slice(index * 7, index * 7 + 7);
      const sum = (key: keyof typeof chunk[number]) => chunk.reduce((total, day) => total + Number(day[key]), 0);
      return { label: chunk.length ? `${shortDate(chunk[0].date)}–${shortDate(chunk.at(-1)!.date)}` : "", scheduled: sum("scheduled_maintenance"), supply: sum("awaiting_spares"), agency: sum("awaiting_agency"), unscheduled: sum("unscheduled_repair") };
    });
  }, [history]);
  return <><OpsChart label="Downtime by cause, last five weeks" height={236} deps={[weeks]} build={p => ({
    grid: { left: 92, right: 14, top: 6, bottom: 22 },
    tooltip: { ...tooltip(p), axisPointer: { type: "shadow" } },
    xAxis: { type: "value", ...baseAxes(p), name: "aircraft-days", nameLocation: "end", nameTextStyle: { color: p.muted, fontSize: 10 } },
    yAxis: { type: "category", data: weeks.map(w => w.label), inverse: true, ...baseAxes(p), axisLabel: { color: p.muted, fontSize: 10, fontFamily: MONO } },
    series: [
      { name: "Scheduled", type: "bar", stack: "d", barWidth: 14, data: weeks.map(w => w.scheduled), itemStyle: { color: p.bar, borderRadius: [6, 0, 0, 6] } },
      { name: "Supply wait", type: "bar", stack: "d", data: weeks.map(w => w.supply), itemStyle: { color: p.watch } },
      { name: "Agency queue", type: "bar", stack: "d", data: weeks.map(w => w.agency), itemStyle: { color: p.accent2 } },
      { name: "Unscheduled", type: "bar", stack: "d", data: weeks.map(w => w.unscheduled), itemStyle: { color: p.critical, borderRadius: [0, 6, 6, 0] } },
    ],
  })}/>
  <div className="o-legend"><span><i style={{ background: "var(--o-chart-bar)" }}/>Scheduled</span><span><i style={{ background: "var(--o-watch)" }}/>Supply wait</span><span><i style={{ background: "var(--o-accent-2)" }}/>Agency queue</span><span><i style={{ background: "var(--o-critical)" }}/>Unscheduled</span></div></>;
}

const rank = { healthy: 0, watch: 1, degraded: 2, critical: 3, failed: 4, under_maintenance: 3 } as const;
function HeatMatrix() {
  const grid = useHeatGrid();
  const advisories = useAdvisories();
  const navigate = useNavigate();
  const [sort, setSort] = useState<"risk" | "tail">("risk");
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const byComponent = useMemo(() => new Map((advisories.data ?? []).map(a => [a.component_id, a])), [advisories.data]);
  return <Query query={grid} rows={8}>{data => {
    const rows = sort === "tail" ? data.rows : [...data.rows].sort((a, b) => rank[b.state] - rank[a.state] || a.health_index - b.health_index);
    const describe = (row: HeatGrid["rows"][number], index: number) => {
      const cell = row.cells[index];
      const system = data.systems[index].name;
      const advisory = cell.driver ? byComponent.get(cell.driver) : undefined;
      if (advisory) return `${advisory.component_name} - HI ${advisory.health_index.toFixed(0)} - ${advisory.priority.level} Advisory`;
      if (cell.state === "failed" || cell.state === "under_maintenance") return `${system} - ${stateLabel[cell.state]}`;
      return `${system} - HI ${cell.health_index.toFixed(0)} - ${stateLabel[cell.state]}`;
    };
    return <>
      <div className="o-matrix-tools"><Segmented label="Sort aircraft" value={sort} onChange={setSort} options={[["risk", "By risk"], ["tail", "By tail"]] as const}/>
        <div className="o-legend">{(["healthy", "degraded", "critical"] as const).map(state => <span key={state}><i className={`m-${state}`}/>{state === "healthy" ? "HI ≥ 80" : state === "degraded" ? "HI 40–80" : "HI < 40 / failed"}</span>)}</div></div>
      <div className="o-matrix o-matrix-split" onMouseLeave={() => setTip(null)}>{[rows.slice(0, Math.ceil(rows.length / 2)), rows.slice(Math.ceil(rows.length / 2))].map((half, column) => <div key={column}>
        <div className="o-matrix-row head"><span className="o-matrix-tail"/>{data.systems.map(system => <span key={system.code} className="o-matrix-col" title={system.name}>{system.code}</span>)}</div>
        {half.map(row => <div className="o-matrix-row" key={row.aircraft}>
          <button type="button" className={`o-matrix-tail${row.availability_state === "available" ? "" : " down"}`} onClick={() => navigate(`/aircraft/${row.aircraft}`)} title={availabilityLabel[row.availability_state]}>{row.aircraft}</button>
          {row.cells.map((cell, index) => <button type="button" key={cell.system} className={`o-matrix-cell m-${cell.state}`} aria-label={`${row.aircraft} ${describe(row, index)}`}
            onClick={() => navigate(`/aircraft/${row.aircraft}?system=${cell.system}`)}
            onMouseEnter={event => { const box = event.currentTarget.getBoundingClientRect(); setTip({ x: box.left + box.width / 2, y: box.top, text: `${row.aircraft} › ${describe(row, index)}` }); }}/>)}
        </div>)}
      </div>)}
        {tip && <div className="o-matrix-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
      </div>
    </>;
  }}</Query>;
}

function TopAdvisories() {
  const advisories = useAdvisories();
  const navigate = useNavigate();
  return <Query query={advisories} rows={8}>{items => <div className="o-table-wrap o-table-fixed"><table className="o-table dense">
    <thead><tr><th>Aircraft</th><th>Component</th><th>Pri</th><th>State</th><th className="num">Risk 14d</th><th className="num">RUL</th><th>Action</th></tr></thead>
    <tbody>{items.filter((a: Advisory) => !["completed", "dismissed"].includes(a.status)).slice(0, 11).map((a: Advisory) => <tr key={a.id} className="clickable" onClick={() => navigate(`/health/${a.component_id}`)}>
      <td className="o-strong">{a.aircraft}</td><td className="o-sans">{a.component_name}</td><td><PriorityBadge level={a.priority.level}/></td>
      <td><StateBadge state={a.health_state} compact/></td><td className="num">{pct(a.risk_14d)}</td><td className="num">{rulText(a.rul_days).split(" (")[0]}</td>
      <td className="o-sans">{a.action.label}</td>
    </tr>)}</tbody>
  </table></div>}</Query>;
}
