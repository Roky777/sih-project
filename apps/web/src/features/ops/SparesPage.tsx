import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { useAdvisories, useDemand, useInventory, type Advisory, type InventoryItem } from "./api";
import { longDate, num, pct } from "./format";
import { GLASS_CSS, MONO, OpsChart, baseAxes, tooltip } from "./OpsChart";
import { Card, Drawer, Kpi, Pill, Query, Segmented } from "./ui";
import "./inventory-position.css";

const statusLabel = { ok: "OK", at_risk: "At risk", short: "Short", print: "Print route" } as const;

export function SparesPage() {
  const [params, setParams] = useSearchParams();
  const selectedPart = params.get("part");
  const inventory = useInventory();
  const advisories = useAdvisories();
  const [part, setPartState] = useState<string | null>(selectedPart);
  useEffect(() => { setPartState(selectedPart); }, [selectedPart]);
  const setPart = (value: string | null) => { setPartState(value); setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set("part", value); else next.delete("part"); return next; }, { replace: true }); };
  const [filter, setFilter] = useState<"all" | "risk">("all");
  const items = inventory.data ?? [];
  const rows = filter === "all" ? items : items.filter(item => item.status !== "ok");
  const flagged = (advisories.data ?? []).filter(a => !["completed", "dismissed"].includes(a.status));
  return <>

    <div className="o-kpis">
      <Kpi label="Parts short" icon="warning" tone="critical" value={items.length ? items.filter(i => i.status === "short").length : null} format={v => v.toFixed(0)} detail="No usable stock for expected demand"/>
      <Kpi label="Covered by print" icon="printer" tone="accent" value={items.length ? items.filter(i => i.status === "print").length : null} format={v => v.toFixed(0)} detail="Project Forge: printable parts reach the bay in 1 day"/>
      <Kpi label="Parts at risk" icon="box" tone="watch" value={items.length ? items.filter(i => i.status === "at_risk").length : null} format={v => v.toFixed(0)} detail="Shortfall probability ≥ 25 % in 30 d"/>
      <Kpi label="Expected demand (30 d)" icon="trend" tone="accent" value={items.length ? items.reduce((sum, i) => sum + (i.demand["30"]?.expected ?? 0), 0) : null} format={v => v.toFixed(1)} detail={items.length ? `vs ${items.reduce((sum, i) => sum + (i.demand["30"]?.baseline_moving_average ?? 0), 0).toFixed(1)} from the moving-average baseline` : undefined}/>
      <Kpi label="Lead time beyond RUL" icon="clock" tone="degraded" value={advisories.data ? flagged.filter(a => a.spare.lead_time_exceeds_rul).length : null} format={v => v.toFixed(0)} detail="Advisories that cannot wait for a new order"/>
    </div>
    <div className="o-grid o-cols-main">
      <Card title="Demand vs stock (30 days)" subtitle="Grey: predicted demand from ML failure probabilities plus scheduled replacements. Blue: usable stock. Red, pulsing: demand exceeds stock.">
        <Query query={inventory} rows={6}>{data => <OpsChart label="Predicted 30-day demand against current stock by part" height={300} deps={[data]} onClick={params => setPart(data[params.dataIndex]?.part_number ?? null)} build={p => {
          const demand = data.map(i => Number(i.demand["30"].expected.toFixed(2)));
          const stock = data.map(i => i.available);
          return {
            grid: { left: 36, right: 12, top: 18, bottom: 64 },
            tooltip: { ...tooltip(p), axisPointer: { type: "shadow" } },
            legend: { top: 0, right: 0, textStyle: { color: p.muted, fontSize: 11 }, itemWidth: 10, itemHeight: 10, data: ["Predicted demand (30 d)", "Current stock (usable)"] },
            xAxis: { type: "category", data: data.map(i => i.part_number), ...baseAxes(p), axisLabel: { color: p.muted, fontSize: 10, fontFamily: MONO, rotate: 45 } },
            yAxis: { type: "value", name: "units", nameTextStyle: { color: p.muted, fontSize: 10 }, ...baseAxes(p) },
            series: [
              { name: "Predicted demand (30 d)", type: "bar", barGap: "10%", barWidth: "34%", itemStyle: { color: p.bar }, data: demand.map((value, i) => ({ value, itemStyle: { color: value > stock[i] ? p.critical : p.bar, borderRadius: [6, 6, 6, 6] } })) },
              { name: "Current stock (usable)", type: "bar", barWidth: "34%", data: stock, itemStyle: { color: p.accent, borderRadius: [6, 6, 6, 6] } },
              { name: "Demand exceeds stock", type: "effectScatter", symbolSize: 9, rippleEffect: { scale: 3, brushType: "stroke", period: 2 }, itemStyle: { color: p.critical }, tooltip: { show: false },
                data: demand.map((value, i) => value > stock[i] ? [data[i].part_number, value] : null).filter(Boolean) },
            ],
          };
        }}/>}</Query>
      </Card>
      <Card title="Lead time vs RUL" subtitle="Each dot is an open advisory. Red, above the diagonal: lead time exceeds the RUL lower bound (critical supply threat).">
        <Query query={advisories} rows={6}>{() => <LeadTimeScatter items={flagged}/>}</Query>
      </Card>
    </div>
    <Card className="inventory-position" title="Inventory position" subtitle="Select a part to inspect demand and the components driving it" actions={<Segmented label="Filter parts" value={filter} onChange={setFilter} options={[["all", "All parts"], ["risk", "Short or at risk"]] as const}/>}>
      <Query query={inventory} rows={8}>{() => <><p className="inventory-scroll-hint">Scroll across for supply, demand and waiting components.</p><div className="o-table-wrap"><table className="o-table">
        <thead><tr><th>Part</th><th>Status</th><th className="num">On hand</th><th className="num">Reserved</th><th className="num">On order</th><th>Next receipt</th><th className="num">Lead time</th><th>Demand · 30 d<small>P10–P90 · baseline</small></th><th>Shortfall risk</th><th>Waiting components</th></tr></thead>
        <tbody>{rows.map((item: InventoryItem) => <tr key={item.part_number} className={`clickable${item.status !== "ok" ? ` o-row-flag ${item.status}` : ""}`} onClick={() => setPart(item.part_number)}>
          <td><button type="button" className="o-link o-mono" aria-label={`Inspect part ${item.part_number}`} onClick={event => { event.stopPropagation(); setPart(item.part_number); }}>{item.part_number}</button><small className="inventory-description">{item.description}</small><small className="inventory-metadata">Criticality {item.criticality}{item.repairable ? " · Repairable" : ""}</small></td>
          <td><Pill tone={item.status === "print" ? "accent" : item.status}>{statusLabel[item.status]}</Pill>{item.status === "print" && <small className="inventory-print-note">Additive supply</small>}</td>
          <td className="num o-strong">{item.on_hand}</td><td className="num">{item.reserved}</td><td className="num">{item.on_order}</td>
          <td>{item.next_receipt ? <>{longDate(item.next_receipt)}<small>in {item.next_receipt_in_days} d</small></> : <span className="o-muted">—</span>}</td>
          <td className="num">{item.additive_printable ? <><span className="o-forge-lead">1 d print</span><small>{item.lead_time_days} d supplier</small></> : `${item.lead_time_days} d`}</td>
          <td><span className="o-strong">{num(item.demand["30"].expected, 1)}</span> <small>({item.demand["30"].p10}–{item.demand["30"].p90}) · baseline {num(item.demand["30"].baseline_moving_average, 1)}</small></td>
          <td><div className="inventory-risk"><span className="o-meter"><span className={item.demand["30"].shortfall_probability >= 0.6 ? "o-bg-critical" : item.demand["30"].shortfall_probability >= 0.25 ? "o-bg-watch" : "o-bg-healthy"} style={{ width: `${Math.max(3, item.demand["30"].shortfall_probability * 100)}%` }}/></span><span>{pct(item.demand["30"].shortfall_probability)}</span></div></td>
          <td><div className="inventory-waiting">{item.competing_components.length ? item.competing_components.slice(0, 3).map(id => <span key={id} className="o-tag" title={id}>{id.slice(3, 6)}</span>) : <span className="o-muted">—</span>}</div>{item.competing_components.length > 3 && <small>+{item.competing_components.length - 3} more</small>}</td>
        </tr>)}</tbody>
      </table>{!rows.length && <p className="inventory-empty">{filter === "risk" ? "No parts are short, at risk or covered by a print route in this snapshot." : "No inventory records in this snapshot."}</p>}</div></>}</Query>
    </Card>
    <PartDrawer part={part} onClose={() => setPart(null)} item={items.find(i => i.part_number === part)}/>
  </>;
}

function LeadTimeScatter({ items }: { items: Advisory[] }) {
  const navigate = useNavigate();
  return <OpsChart label="Lead time against remaining-life lower bound" height={300} deps={[items]} onClick={params => { const item = items[params.dataIndex]; if (item) navigate(`/health/${item.component_id}`); }} build={p => ({
    grid: { left: 44, right: 16, top: 16, bottom: 40 },
    tooltip: { trigger: "item", backgroundColor: p.glass, borderColor: "rgba(255,255,255,.55)", extraCssText: GLASS_CSS, textStyle: { color: p.text, fontSize: 12 }, formatter: (params: unknown) => { const item = items[(params as { dataIndex: number }).dataIndex]; return item ? `<b>${item.aircraft} ${item.component_name}</b><br/>${item.spare.part_number} · lead ${item.spare.lead_time_days} d<br/>RUL p10 ${item.rul_days.p10.toFixed(0)} d · risk ${pct(item.risk_14d)}<br/>spare ${item.spare.status}` : ""; } },
    xAxis: { type: "value", name: "RUL p10 (days)", nameLocation: "middle", nameGap: 26, nameTextStyle: { color: p.muted }, min: 0, max: 60, ...baseAxes(p) },
    yAxis: { type: "value", name: "Lead time (days)", nameTextStyle: { color: p.muted }, min: 0, ...baseAxes(p) },
    series: [{
      type: "scatter", data: items.map(item => [item.rul_days.p10, item.spare.lead_time_days, item.risk_14d]),
      symbolSize: (value: number[]) => 8 + value[2] * 22,
      itemStyle: { color: (params: { dataIndex: number }) => { const item = items[params.dataIndex]; return item && item.spare.lead_time_days > item.rul_days.p10 ? p.critical : p.accent; }, opacity: 0.85, borderColor: p.surface, borderWidth: 1.5 },
      markLine: { symbol: "none", silent: true, lineStyle: { color: p.muted, type: "dashed" }, label: { formatter: "lead time = RUL", position: "insideEnd", color: p.muted, fontSize: 10 }, data: [[{ coord: [0, 0] }, { coord: [60, 60] }]] },
      markArea: { silent: true, itemStyle: { color: `${p.critical}0d` }, data: [[{ coord: [0, 0] }, { coord: [60, 100] }]] },
    }],
  })}/>;
}

function PartDrawer({ part, onClose, item }: { part: string | null; onClose: () => void; item?: InventoryItem }) {
  const [horizon, setHorizon] = useState<"30" | "60" | "90">("30");
  const demand = useDemand(part, Number(horizon));
  const series = useMemo(() => item ? (["30", "60", "90"] as const).map(h => item.demand[h]) : [], [item]);
  return <Drawer open={Boolean(part)} onOpenChange={value => !value && onClose()} title={part ?? ""} subtitle={item ? `${item.description} · ${item.lead_time_days}-day lead time · reorder level ${item.reorder_level}` : undefined}>
    {item && <>
      <div className="o-kpis o-kpis-compact">
        <article className="o-kpi o-kpi-mini"><span className="o-kpi-label">Usable stock</span><strong className="o-kpi-value">{item.available}</strong><span className="o-kpi-detail">{item.on_hand} on hand · {item.reserved} reserved</span></article>
        <article className="o-kpi o-kpi-mini"><span className="o-kpi-label">On order</span><strong className="o-kpi-value">{item.on_order}</strong><span className="o-kpi-detail">{item.next_receipt ? `next ${longDate(item.next_receipt)}` : "none"}</span></article>
      </div>
      <div className="o-mini-head" style={{ marginTop: 18 }}><strong>Demand forecast</strong><Segmented label="Horizon" value={horizon} onChange={setHorizon} options={[["30", "30 d"], ["60", "60 d"], ["90", "90 d"]] as const}/></div>
      <Query query={demand} rows={4}>{d => <>
        <dl className="o-kv" style={{ marginTop: 10 }}>
          <dt>Expected demand</dt><dd>{num(d.expected, 2)} (P10–P90 {d.p10}–{d.p90})</dd>
          <dt>From predicted failures</dt><dd>{num(d.predicted_failure_demand, 2)}</dd>
          <dt>Scheduled / planned</dt><dd>{d.scheduled_demand}</dd>
          <dt>Moving-average baseline</dt><dd>{num(d.baseline_moving_average, 2)}</dd>
          <dt>Supply within horizon</dt><dd>{d.supply_within_horizon}</dd>
          <dt>Shortfall probability</dt><dd className={d.shortfall_probability >= 0.5 ? "o-tone-critical" : ""}>{pct(d.shortfall_probability)}</dd>
        </dl>
        <p className="o-muted o-small" style={{ marginTop: 8 }}>{d.method}.</p>
        <h4 className="o-sub">Components driving demand</h4>
        {d.contributors.length ? <ul className="o-contrib">{(d.contributors as { component_id: string; probability: number }[]).map(c => <li key={c.component_id}><Link to={`/health/${c.component_id}`}>{c.component_id}</Link><span className="o-meter"><span className="o-bg-degraded" style={{ width: `${c.probability * 100}%` }}/></span><b>{pct(c.probability)}</b></li>)}</ul> : <p className="o-muted">No component has a ≥ 5 % failure probability in this horizon.</p>}
      </>}</Query>
      <h4 className="o-sub">Demand by horizon</h4>
      <OpsChart label="Expected demand by horizon" height={170} deps={[series]} build={p => ({
        grid: { left: 30, right: 10, top: 10, bottom: 24 }, tooltip: tooltip(p),
        xAxis: { type: "category", data: ["30 d", "60 d", "90 d"], ...baseAxes(p) }, yAxis: { type: "value", ...baseAxes(p) },
        series: [{ name: "Predictive", type: "bar", barWidth: "40%", data: series.map(s => Number(s.expected.toFixed(2))), itemStyle: { color: p.accent, borderRadius: [4, 4, 0, 0] } },
          { name: "Baseline", type: "line", data: series.map(s => Number(s.baseline_moving_average.toFixed(2))), lineStyle: { color: p.muted, type: "dashed" }, itemStyle: { color: p.muted } }],
      })}/>
      <Link className="o-btn ghost" style={{ marginTop: 14 }} to={`/simulator?kind=spare_unavailable&part=${part}`}><Icon name="sliders" size={15}/>Simulate this part unavailable</Link>
    </>}
  </Drawer>;
}
