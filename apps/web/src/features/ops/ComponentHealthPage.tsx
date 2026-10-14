import { CaseContext } from "./CaseWorkspace";
import { HeadingReplay } from "./ReplaySlider";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { addDays, dayDiff } from "./AsOf";
import { useComponentHealth, type ComponentHealth } from "./api";
import { AdvisoryCommandCard } from "./AdvisoryViews";
import { useRememberFocus } from "./Focus";
import { longDate, pct, rulText, shortDate } from "./format";
import { MONO, OpsChart, areaFill, baseAxes, tooltip, withAlpha } from "./OpsChart";
import { Card, EmptyState, Query, Segmented, StateBadge } from "./ui";

export function ComponentHealthPage() {
  const { componentId = "" } = useParams();
  useRememberFocus("component", componentId);
  const [days, setDays] = useState<"90" | "180" | "365">("180");
  const health = useComponentHealth(componentId, Number(days));
  return <Query query={health} rows={10}>{data => <ComponentHealthView data={data} days={days} setDays={setDays}/>}</Query>;
}

function alertRanges(dates: string[], flags: boolean[]) {
  const ranges: [string, string][] = [];
  let start: string | null = null;
  flags.forEach((flag, index) => {
    if (flag && start === null) start = dates[index];
    if (!flag && start !== null) { ranges.push([start, dates[index - 1]]); start = null; }
  });
  if (start !== null) ranges.push([start, dates.at(-1)!]);
  return ranges;
}

function ComponentHealthView({ data, days, setDays }: { data: ComponentHealth; days: "90" | "180" | "365"; setDays: (value: "90" | "180" | "365") => void }) {
  const c = data.component as Record<string, string | number | null>;
  const hi = data.health_index.at(-1) ?? 0;
  const ranges = useMemo(() => alertRanges(data.replay_dates, data.anomaly_alert), [data]);
  const firstAlert = ranges[0]?.[0];
  const truth = data.simulation_truth as { scripted_failure_date: string; label: string } | null;
  const tone = hi >= 80 ? "healthy" : hi >= 40 ? "watch" : "critical";
  return <div className="o-screen">
    <div className="o-screen-head"><h1>Component Health</h1><span>{String(c.aircraft)} · {String(c.name)} · {String(c.system_name)}</span><HeadingReplay/></div>
    <section className="component-record-header" aria-label="Component record">
      <div className="component-record-title"><div><Link to={`/aircraft/${c.aircraft}?tab=components`} className="component-record-back"><Icon name="arrow" size={14} style={{ transform: "rotate(180deg)" }}/>{String(c.aircraft)} · Component records</Link><h2>{String(c.name)}</h2><p>{String(c.system_name)} · Snapshot {longDate(data.as_of)}{data.replay ? " · Historical, read only" : ""}</p></div><div className="component-record-condition"><StateBadge state={data.state} compact/><span>Health index <strong className={`o-tone-${tone}`}>{hi.toFixed(0)}<small> / 100</small></strong></span></div></div>
      <dl className="component-record-metadata"><div><dt>Serial number</dt><dd>{String(c.serial)}</dd></div><div><dt>Part number</dt><dd>{String(c.part_number)}</dd></div><div><dt>Since installation</dt><dd>{Number(c.hours_since_install).toFixed(0)} <span>flight hours</span></dd></div><div><dt>Criticality</dt><dd>{String(c.criticality)} <span>/ 5</span></dd></div></dl>
      <div className="component-record-toolbar"><div><span>History window</span><Segmented label="Window" value={days} onChange={setDays} options={[["90", "90 d"], ["180", "180 d"], ["365", "1 y"]] as const}/></div><Link className="o-btn sm ghost" to={`/simulator?kind=schedule_maintenance&component=${c.id}`}><Icon name="sliders" size={14}/>Compare a what-if</Link></div>
    </section>
    {!data.replay && <CaseContext aircraft={String(c.aircraft)} component={String(c.id)}/>}
    {truth && <div className="o-note truth"><Icon name="flask" size={16}/><div><strong>Hidden simulation truth (synthetic truth table).</strong> Scripted failure on {longDate(truth.scripted_failure_date)}{firstAlert ? <> · first sustained Isolation-Forest anomaly on {longDate(firstAlert)}, <b>{dayDiff(firstAlert, truth.scripted_failure_date)} days</b> before it</> : ""}. {truth.label}</div></div>}
    <div className="o-grid-12 o-health-grid">
      <div className="span-8 o-stack">
        <SigmaChart data={data} ranges={ranges}/>
        <RawAmbientChart data={data}/>
        <HealthTrajectory data={data}/>
        <div className="o-grid-12"><div className="span-4"><RiskHistory data={data}/></div><div className="span-4"><RulHistory data={data}/></div><div className="span-4"><AnomalyHistory data={data} ranges={ranges}/></div></div>
      </div>
      <div className="span-4 o-stack">
        {data.advisory ? <AdvisoryCommandCard advisory={data.advisory} replay={data.replay}/>
          : <Card title="No open advisory"><EmptyState title={`${String(c.name)} is ${data.state === "healthy" ? "healthy" : data.state.replace("_", " ")}`}>Health index {hi.toFixed(0)}, 14-day risk {pct(data.risk14.at(-1) ?? 0)}, remaining life {rulText(data.rul.at(-1) ?? { p10: 60, p50: 60, p90: 60 })}.</EmptyState></Card>}
        <Card title="Component history" subtitle="Installations, removals, work orders and built-in-test messages">
          <ol className="o-timeline compact">{(data.history as { date: string; kind: string; label: string }[]).slice(0, 16).map((event, index) => <li key={index} className={`kind-${event.kind}`}><span className="o-timeline-date">{shortDate(event.date)}</span><i/><div><strong>{event.label}</strong></div></li>)}</ol>
        </Card>
      </div>
    </div>
  </div>;
}

function useParameterChoice(data: ComponentHealth, preferred: number) {
  const [index, setIndex] = useState(preferred);
  return [Math.min(index, data.sensors.length - 1), setIndex] as const;
}

/** Chart 1: the leading parameter as deviation from its condition-normalised baseline (σ). */
function SigmaChart({ data, ranges }: { data: ComponentHealth; ranges: [string, string][] }) {
  const lead = useMemo(() => {
    const name = data.advisory?.contributing_parameters[0]?.name;
    const found = data.sensors.findIndex(sensor => sensor.name === name);
    return found >= 0 ? found : 0;
  }, [data]);
  const [index, setIndex] = useParameterChoice(data, lead);
  const sensor = data.sensors[index];
  const firstAlert = ranges.find(([start]) => data.dates.includes(start))?.[0];
  return <Card title={`${sensor.name} (σ)`} subtitle="Deviation from the expected value after removing ambient and load effects. Flat at 0 when healthy; red from the first sustained anomaly."
    actions={<select className="o-input" aria-label="Parameter" value={index} onChange={event => setIndex(Number(event.target.value))}>{data.sensors.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}</select>}>
    <OpsChart label={`${sensor.name} normalised deviation`} height={210} deps={[data, index, ranges]} build={p => ({
      grid: { left: 40, right: 14, top: 24, bottom: 24 }, tooltip: { ...tooltip(p), valueFormatter: (v: unknown) => typeof v === "number" ? `${v.toFixed(2)} σ` : "—" },
      xAxis: { type: "category", data: data.dates, boundaryGap: false, ...baseAxes(p), axisLabel: { color: p.muted, fontSize: 10.5, fontFamily: MONO, formatter: (v: string) => shortDate(v) } },
      yAxis: { type: "value", scale: true, ...baseAxes(p) },
      series: [{ name: "Observed", type: "line", showSymbol: false, connectNulls: true, data: sensor.normalised, lineStyle: { width: 1.6, color: p.accent },
        markLine: { symbol: "none", silent: true, data: [{ yAxis: 0, lineStyle: { color: p.neutral, type: "solid", width: 1.2 }, label: { formatter: "expected 0σ", color: p.muted, fontSize: 10, fontFamily: MONO } }, { yAxis: 3, lineStyle: { color: "#EF4444", type: "dashed", opacity: .5 }, label: { formatter: "3σ", color: p.muted, fontSize: 10 } }] },
        markArea: firstAlert ? { silent: true, itemStyle: { color: withAlpha(p.critical, 0.08) }, data: [[{ xAxis: firstAlert, name: "Isolation Forest anomaly" }, { xAxis: data.dates.at(-1) }]], label: { color: p.critical, fontSize: 10, fontFamily: MONO } } : undefined }],
    })}/>
  </Card>;
}

/** Chart 2: a parameter in source units with ambient temperature overlaid, to separate weather from wear. */
function RawAmbientChart({ data }: { data: ComponentHealth }) {
  const preferred = Math.max(0, data.sensors.findIndex(sensor => sensor.unit === "°C"));
  const [index, setIndex] = useParameterChoice(data, preferred);
  const sensor = data.sensors[index];
  return <Card title={`${sensor.name} (${sensor.unit}) vs ambient`} subtitle="Recorded value (white) with ambient temperature (grey, right axis). A rise that ambient does not explain points to wear, not weather."
    actions={<select className="o-input" aria-label="Parameter" value={index} onChange={event => setIndex(Number(event.target.value))}>{data.sensors.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}</select>}>
    <OpsChart label={`${sensor.name} with ambient overlay`} height={200} deps={[data, index]} build={p => ({
      grid: { left: 48, right: 44, top: 14, bottom: 24 }, tooltip: tooltip(p),
      xAxis: { type: "category", data: data.dates, boundaryGap: false, ...baseAxes(p), axisLabel: { color: p.muted, fontSize: 10.5, fontFamily: MONO, formatter: (v: string) => shortDate(v) } },
      yAxis: [{ type: "value", scale: true, name: sensor.unit, nameTextStyle: { color: p.muted, fontSize: 10 }, ...baseAxes(p) }, { type: "value", scale: true, name: "°C amb", nameTextStyle: { color: p.muted, fontSize: 10 }, ...baseAxes(p), splitLine: { show: false } }],
      series: [
        { name: sensor.name, type: "line", showSymbol: false, connectNulls: true, data: sensor.values, lineStyle: { width: 1.6, color: p.accent } },
        { name: "Ambient", type: "line", yAxisIndex: 1, showSymbol: false, connectNulls: true, data: data.ambient, lineStyle: { width: 1, color: p.neutral } },
      ],
    })}/>
  </Card>;
}

function HealthTrajectory({ data }: { data: ComponentHealth }) {
  const projection = data.projection as { crossing_p10: string; crossing_p50: string; crossing_p90: string; capped: boolean; health_index_now: number };
  const days = dayDiff(data.as_of, projection.crossing_p50);
  return <Card title="Health index trajectory" subtitle={projection.capped ? "Remaining life is at least 60 days; no threshold crossing projected" : `Projected to reach 0 at Day +${days} (RUL range ${shortDate(projection.crossing_p10)}–${shortDate(projection.crossing_p90)})`}>
    <OpsChart label="Health index with projected threshold crossing" height={210} deps={[data]} build={p => {
      const future = Array.from({ length: 60 }, (_, i) => addDays(data.as_of, i + 1));
      const dates = [...data.dates, ...future];
      const now = data.health_index.at(-1) ?? 0;
      const toCross = Math.max(1, days);
      const projected = future.map((_, i) => projection.capped ? null : Math.max(0, now - (now / toCross) * (i + 1)));
      return {
        grid: { left: 36, right: 14, top: 24, bottom: 24 }, tooltip: { ...tooltip(p), valueFormatter: (v: unknown) => typeof v === "number" ? v.toFixed(0) : "—" },
        xAxis: { type: "category", data: dates, boundaryGap: false, ...baseAxes(p), axisLabel: { color: p.muted, fontSize: 10.5, fontFamily: MONO, formatter: (v: string) => v === data.as_of ? "T0" : shortDate(v) } },
        yAxis: { type: "value", min: 0, max: 100, ...baseAxes(p) },
        series: [
          { name: "Health index", type: "line", showSymbol: false, data: [...data.health_index, ...future.map(() => null)], smooth: 0.3, lineStyle: { width: 2.4, color: p.accent }, areaStyle: areaFill(p.accent),
            markLine: { symbol: "none", silent: true, label: { formatter: "T0", color: p.muted, fontSize: 10 }, lineStyle: { color: p.grid, type: "solid" }, data: [{ xAxis: data.as_of }] },
            markArea: projection.capped ? undefined : { silent: true, itemStyle: { color: withAlpha(p.watch, 0.12), borderColor: withAlpha(p.watch, 0.5), borderWidth: 1 }, label: { show: true, formatter: "RUL range", color: p.watch, fontSize: 10, fontFamily: MONO }, data: [[{ xAxis: projection.crossing_p10 }, { xAxis: projection.crossing_p90 }]] } },
          { name: "Projection", type: "line", showSymbol: false, data: [...data.dates.map((_, i) => i === data.dates.length - 1 ? now : null), ...projected], lineStyle: { width: 2, type: "dotted", color: p.watch } },
        ],
      };
    }}/>
  </Card>;
}

function RiskHistory({ data }: { data: ComponentHealth }) {
  return <Card title="Failure risk over time" subtitle="Calibrated probability of failure within 14 and 30 days">
    <OpsChart label="Failure risk history" height={220} deps={[data]} build={p => ({
      grid: { left: 40, right: 12, top: 10, bottom: 26 }, tooltip: { ...tooltip(p), valueFormatter: (v: unknown) => typeof v === "number" ? pct(v) : "—" },
      xAxis: { type: "category", data: data.replay_dates, boundaryGap: false, ...baseAxes(p), axisLabel: { color: p.muted, fontSize: 10, formatter: (v: string) => shortDate(v) } },
      yAxis: { type: "value", min: 0, max: 1, ...baseAxes(p), axisLabel: { color: p.muted, fontSize: 10, formatter: (v: number) => pct(v) } },
      series: [
        { name: "14-day risk", type: "line", step: "end", showSymbol: false, data: data.risk14, lineStyle: { width: 2, color: p.critical }, areaStyle: { color: `${p.critical}14` },
          markLine: { symbol: "none", silent: true, lineStyle: { color: p.muted, type: "dashed" }, label: { formatter: "alert 50%", color: p.muted, fontSize: 10 }, data: [{ yAxis: 0.5 }] } },
        { name: "30-day risk", type: "line", step: "end", showSymbol: false, data: data.risk30, lineStyle: { width: 1.6, color: p.degraded, type: "dashed" } },
      ],
    })}/>
  </Card>;
}

function RulHistory({ data }: { data: ComponentHealth }) {
  return <Card title="Remaining useful life" subtitle="Median with the 10–90 % interval; values are capped at 60 days">
    <OpsChart label="Remaining useful life band over time" height={220} deps={[data]} build={p => ({
      grid: { left: 36, right: 12, top: 10, bottom: 26 }, tooltip: { ...tooltip(p), valueFormatter: (v: unknown) => typeof v === "number" ? `${v.toFixed(0)} d` : "—" },
      xAxis: { type: "category", data: data.replay_dates, boundaryGap: false, ...baseAxes(p), axisLabel: { color: p.muted, fontSize: 10, formatter: (v: string) => shortDate(v) } },
      yAxis: { type: "value", min: 0, max: 60, ...baseAxes(p) },
      series: [
        { name: "p10", type: "line", stack: "rul", showSymbol: false, data: data.rul.map(r => r.p10), lineStyle: { opacity: 0 }, tooltip: { show: false } },
        { name: "10–90 %", type: "line", stack: "rul", showSymbol: false, data: data.rul.map(r => r.p90 - r.p10), lineStyle: { opacity: 0 }, areaStyle: { color: `${p.accent2}30` }, tooltip: { show: false } },
        { name: "RUL median", type: "line", showSymbol: false, data: data.rul.map(r => r.p50), lineStyle: { width: 2, color: p.accent2 } },
      ],
    })}/>
  </Card>;
}

function AnomalyHistory({ data, ranges }: { data: ComponentHealth; ranges: [string, string][] }) {
  return <Card title="Anomaly score" subtitle="Isolation Forest percentile against healthy training behaviour; sustained = 3 consecutive flagged readings">
    <OpsChart label="Anomaly score timeline" height={220} deps={[data, ranges]} build={p => ({
      grid: { left: 40, right: 12, top: 10, bottom: 26 }, tooltip: { ...tooltip(p), valueFormatter: (v: unknown) => typeof v === "number" ? pct(v, 1) : "—" },
      xAxis: { type: "category", data: data.replay_dates, boundaryGap: false, ...baseAxes(p), axisLabel: { color: p.muted, fontSize: 10, formatter: (v: string) => shortDate(v) } },
      yAxis: { type: "value", min: 0.5, max: 1, ...baseAxes(p), axisLabel: { color: p.muted, fontSize: 10, formatter: (v: number) => pct(v) } },
      series: [{ name: "Anomaly percentile", type: "line", showSymbol: false, data: data.anomaly, lineStyle: { width: 1.6, color: p.watch }, areaStyle: { color: `${p.watch}14` },
        markArea: { silent: true, itemStyle: { color: `${p.critical}1f` }, data: ranges.map(([start, end]) => [{ xAxis: start }, { xAxis: end }]) },
        markLine: { symbol: "none", silent: true, lineStyle: { color: p.critical, type: "dashed" }, label: { formatter: "threshold", color: p.muted, fontSize: 10 }, data: [{ yAxis: data.anomaly_threshold }] } }],
    })}/>
  </Card>;
}
