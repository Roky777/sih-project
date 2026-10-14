import { HeadingReplay } from "./ReplaySlider";
import { lazy, Suspense, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { useAsOf } from "./AsOf";
import { useAdvisories, type Advisory } from "./api";
import { AdvisoryPanel } from "./AdvisoryViews";
import { FlowStrip } from "./FlowStrip";
import { WorkspaceScope } from "./OperationsWorkspaces";
import { num, pct } from "./format";
import { can, statusLabel, useRole } from "./roles";
import { Card, Drawer, EmptyState, Pill, PriorityBadge, Query } from "./ui";

const ResearchFindings = lazy(() => import("../alerts/AlertsPage").then(m => ({ default: m.AlertsPage })));

type SortKey = "priority" | "risk" | "rul" | "downtime" | "aircraft";
const filters = {
  priority: ["P1", "P2", "P3", "P4"],
  spare: ["available", "contested", "short", "additive_print"],
  status: ["proposed", "accepted", "scheduled", "dismissed", "completed"],
} as const;

export function AdvisoriesPage() {
  const [params] = useSearchParams();
  return params.get("dataset") === "research" ? <Suspense fallback={<p role="status">Opening engine review…</p>}><p className="dataset-context">Engine research review · independent of fleet replay</p><ResearchFindings/></Suspense> : <FleetFindings/>;
}
function FleetFindings() {
  const [params, setParams] = useSearchParams();
  const store = (key: string, value: string) => setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); next.delete("page"); return next; });
  const componentScope = params.get("component");
  const aircraftScope = params.get("aircraft");
  const statusScope = params.get("status");
  const { role } = useRole();
  const advisories = useAdvisories();
  const { asOf } = useAsOf();
  const navigate = useNavigate();
  const priority = (params.get("priority") ?? "").split(",").filter(Boolean);
  const setPriority = (values: string[]) => store("priority", values.join(","));
  const spare = (params.get("spare") ?? "").split(",").filter(Boolean);
  const setSpare = (values: string[]) => store("spare", values.join(","));
  const status = statusScope ? statusScope.split(",").filter(value => filters.status.some(key => key === value)) : role.id === "engineer" ? ["proposed"] : ["proposed", "accepted", "scheduled"];
  const setStatus = (values: string[]) => store("status", values.length ? values.join(",") : "all");
  const system = params.get("system") ?? "", search = params.get("q") ?? "";
  const setSystem = (value: string) => store("system", value), setSearch = (value: string) => store("q", value);
  const sort: { key: SortKey; desc: boolean } = { key: ["priority", "risk", "rul", "downtime", "aircraft"].includes(params.get("sort") ?? "") ? params.get("sort") as SortKey : "priority", desc: params.get("direction") === "desc" };
  const setSort = (update: (current: typeof sort) => typeof sort) => { const next = update(sort); setParams(previous => { const value = new URLSearchParams(previous); value.set("sort", next.key); value.set("direction", next.desc ? "desc" : "asc"); value.delete("page"); return value; }); };
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<Advisory | null>(null);
  const items = advisories.data ?? [];
  const systems = [...new Set(items.map(a => a.system_name))].sort();
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const order = { P1: 0, P2: 1, P3: 2, P4: 3 };
    const value = (a: Advisory) => sort.key === "priority" ? order[a.priority.level] * 10 - a.priority.score : sort.key === "risk" ? -a.risk_14d : sort.key === "rul" ? a.rul_days.p50 : sort.key === "downtime" ? -a.downtime.act_now_days : 0;
    return items.filter(a => (!componentScope || a.component_id === componentScope) && (!aircraftScope || a.aircraft === aircraftScope) && (!priority.length || priority.includes(a.priority.level)) && (!spare.length || spare.includes(a.spare.status)) && (!status.length || status.includes(a.status))
      && (!system || a.system_name === system) && (!query || `${a.aircraft} ${a.component_name} ${a.component_id}`.toLowerCase().includes(query)))
      .sort((a, b) => sort.key === "aircraft" ? a.aircraft.localeCompare(b.aircraft) * (sort.desc ? -1 : 1) : (value(a) - value(b)) * (sort.desc ? -1 : 1));
  }, [items, priority, spare, status, system, search, sort, componentScope, aircraftScope]);
  const requestedPage = Number(params.get("page") ?? 0);
  const page = Math.min(Math.max(0, Math.ceil(rows.length / 25) - 1), Number.isFinite(requestedPage) ? Math.max(0, Math.floor(requestedPage)) : 0);
  const shown = rows.slice(page * 25, (page + 1) * 25);
  const movePage = (value: number) => setParams(previous => { const next = new URLSearchParams(previous); next.set("page", String(value)); return next; });
  const toggle = (list: string[], set: (value: string[]) => void, value: string) => set(list.includes(value) ? list.filter(item => item !== value) : [...list, value]);
  const header = (key: SortKey, label: string) => <button type="button" className="o-th-sort" onClick={() => setSort(current => ({ key, desc: current.key === key ? !current.desc : false }))}>{label}{sort.key === key && <Icon name="chevron" size={12} style={{ transform: `rotate(${sort.desc ? -90 : 90}deg)` }}/>}</button>;
  const selectedItems = items.filter(a => selected.includes(a.id));
  const counts = (key: "priority" | "spare" | "status", value: string) => items.filter(a => (key === "priority" ? a.priority.level : key === "spare" ? a.spare.status : a.status) === value).length;
  const single = (list: string[], set: (value: string[]) => void) => (value: string) => set(value ? [value] : []);
  const spareIcon = (a: Advisory) => <Pill tone={a.spare.status === "available" ? "healthy" : a.spare.status === "short" ? "critical" : "watch"}>{a.spare.status === "available" ? "In stock" : a.spare.status === "additive_print" ? "Print assumption" : a.spare.status === "contested" ? "Competing demand" : "Part short"}</Pill>;
  return <div className="o-screen">
    <div className="o-screen-head"><h1>Findings & evidence</h1><span>Risk queue · {rows.length} of {items.length} advisories{asOf ? " · REPLAY (read only)" : ""}</span><HeadingReplay/></div>
    <FlowStrip compact/>
    <WorkspaceScope/>
    <Card>
      <div className="o-control-bar">
        <label>Priority<select className="o-input" value={priority[0] ?? ""} onChange={event => single(priority, setPriority)(event.target.value)}><option value="">All</option>{filters.priority.map(level => <option key={level} value={level}>{level} ({counts("priority", level)})</option>)}</select></label>
        <label>System<select className="o-input" value={system} onChange={event => setSystem(event.target.value)}><option value="">All systems</option>{systems.map(name => <option key={name}>{name}</option>)}</select></label>
        <label>Spares status<select className="o-input" value={spare[0] ?? ""} onChange={event => single(spare, setSpare)(event.target.value)}><option value="">All</option>{filters.spare.map(value => <option key={value} value={value}>{value} ({counts("spare", value)})</option>)}</select></label>
        <label>Status<select aria-label="Status" className="o-input" value={status.length === 3 ? "open" : status[0] ?? ""} onChange={event => setStatus(event.target.value === "open" ? ["proposed", "accepted", "scheduled"] : event.target.value ? [event.target.value] : [])}><option value="open">Open (needs review → scheduled)</option><option value="">All</option>{filters.status.map(value => <option key={value} value={value}>{statusLabel[value]} ({counts("status", value)})</option>)}</select></label>
        <label className="o-control-search">Tail number<span className="o-searchbox"><Icon name="search" size={14}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="AC-017"/></span></label>
      </div>
      {selected.length > 0 && <div className="o-bulkbar"><strong>{selected.length} selected</strong>
        <button type="button" className="o-btn sm" disabled={Boolean(asOf) || !can.schedule(role.id) || selectedItems.length !== 1 || selectedItems[0]?.status !== "accepted"} onClick={() => navigate(`/maintenance?component=${selectedItems[0].component_id}&aircraft=${selectedItems[0].aircraft}`)}><Icon name="calendar" size={14}/>Prepare confirmed finding</button>
        <button type="button" className="o-btn sm ghost" onClick={() => navigate(`/simulator?kind=early_replacement&components=${selected.map(id => items.find(a => a.id === id)?.component_id).filter(Boolean).join(",")}`)}><Icon name="sliders" size={14}/>Simulate early replacement</button>
        <button type="button" className="o-link" onClick={() => setSelected([])}>Clear</button></div>}
      <Query query={advisories} rows={10}>{() => rows.length === 0 ? <EmptyState title="No advisories match these filters" icon="filter">Clear a filter to see more of the queue.</EmptyState> :
        <div className="o-table-wrap"><table className="o-table dense o-grid-table">
          <thead><tr><th><input type="checkbox" aria-label="Select all" checked={selected.length > 0 && selected.length === rows.length} onChange={event => setSelected(event.target.checked ? rows.map(r => r.id) : [])}/></th>
            <th>{header("aircraft", "Aircraft")}</th><th>System</th><th>Component</th><th>{header("priority", "Priority")}</th><th className="num">{header("risk", "Risk (14d)")}</th><th className="num">{header("rul", "RUL")}</th><th className="center">Spares</th><th className="num">{header("downtime", "Exp. downtime")}</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{shown.map(a => <tr key={a.id} className={`clickable${selected.includes(a.id) ? " selected" : ""}`} onClick={() => setOpen(a)}>
            <td onClick={event => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${a.component_id}`} checked={selected.includes(a.id)} onChange={() => toggle(selected, setSelected, a.id)}/></td>
            <td className="o-strong">{a.aircraft}</td><td className="o-sans">{a.system_name}</td><td className="o-sans">{a.component_name}</td>
            <td><PriorityBadge level={a.priority.level}/></td>
            <td className={`num ${a.risk_14d >= 0.7 ? "o-tone-critical" : a.risk_14d >= 0.35 ? "o-tone-watch" : ""}`}>{pct(a.risk_14d)}</td>
            <td className="num">{a.rul_days.p50 >= 59.5 ? "≥60d" : `${a.rul_days.p50.toFixed(0)}d`}</td>
            <td className="center">{spareIcon(a)}</td>
            <td className="num">{num(a.downtime.act_now_days, 1)}d</td>
            <td><Pill tone={a.status}>{statusLabel[a.status]}</Pill></td>
            <td onClick={event => event.stopPropagation()}>{!asOf && can.schedule(role.id) && a.status === "accepted"
              ? <button type="button" className="o-btn sm o-row-cta" onClick={() => navigate(`/maintenance?component=${a.component_id}&aircraft=${a.aircraft}`)}>PLAN</button>
              : <button type="button" className="o-btn sm ghost o-row-cta" aria-label={`${a.status === "proposed" ? "Review" : "View"} ${a.aircraft} ${a.component_name}`} onClick={() => setOpen(a)}>{a.status === "proposed" ? "REVIEW" : "VIEW"}</button>}</td>
          </tr>)}</tbody>
        </table></div>}</Query>
      <div className="case-pagination"><button className="o-btn ghost" disabled={!page} onClick={() => movePage(page - 1)}>Previous</button><span>{rows.length} findings · page {page + 1}</span><button className="o-btn ghost" disabled={(page + 1) * 25 >= rows.length} onClick={() => movePage(page + 1)}>Next</button></div>
    </Card>
    <Drawer open={Boolean(open)} onOpenChange={value => !value && setOpen(null)} title={open ? `${open.aircraft} · ${open.component_name}` : ""} subtitle={open ? `${open.system_name} · ${open.component_id}` : undefined} width={620}>
      {open && <>{(() => { const live = items.find(a => a.id === open.id) ?? open; return <AdvisoryPanel advisory={live} replay={Boolean(asOf)}/>; })()}
        <button type="button" className="o-btn ghost" style={{ marginTop: 14 }} onClick={() => navigate(`/health/${open.component_id}`)}><Icon name="activity" size={15}/>Open sensor evidence</button></>}
    </Drawer>
  </div>;
}
