import { HeadingReplay } from "./ReplaySlider";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { useAsOf } from "./AsOf";
import { useAdvisories, type Advisory } from "./api";
import { AdvisoryPanel, ScheduleDialog } from "./AdvisoryViews";
import { FlowStrip } from "./FlowStrip";
import { WorkspaceScope } from "./OperationsWorkspaces";
import { num, pct } from "./format";
import { can, statusLabel, useRole } from "./roles";
import { Card, Drawer, EmptyState, Pill, PriorityBadge, Query } from "./ui";

type SortKey = "priority" | "risk" | "rul" | "downtime" | "aircraft";
const filters = {
  priority: ["P1", "P2", "P3", "P4"],
  spare: ["available", "contested", "short", "additive_print"],
  status: ["proposed", "accepted", "scheduled", "dismissed", "completed"],
} as const;

export function AdvisoriesPage() {
  const [params] = useSearchParams();
  const componentScope = params.get("component");
  const aircraftScope = params.get("aircraft");
  const statusScope = params.get("status");
  const advisories = useAdvisories();
  const { asOf } = useAsOf();
  const { role } = useRole();
  const navigate = useNavigate();
  const [priority, setPriority] = useState<string[]>([]);
  const [spare, setSpare] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>(statusScope && filters.status.some(value => value === statusScope) ? [statusScope] : ["proposed", "accepted", "scheduled"]);
  useEffect(() => { setStatus(statusScope && filters.status.some(value => value === statusScope) ? [statusScope] : ["proposed", "accepted", "scheduled"]); }, [statusScope]);
  const [system, setSystem] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "priority", desc: false });
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<Advisory | null>(null);
  const [scheduling, setScheduling] = useState<Advisory | null>(null);
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
  const toggle = (list: string[], set: (value: string[]) => void, value: string) => set(list.includes(value) ? list.filter(item => item !== value) : [...list, value]);
  const header = (key: SortKey, label: string) => <button type="button" className="o-th-sort" onClick={() => setSort(current => ({ key, desc: current.key === key ? !current.desc : false }))}>{label}{sort.key === key && <Icon name="chevron" size={12} style={{ transform: `rotate(${sort.desc ? -90 : 90}deg)` }}/>}</button>;
  const selectedItems = items.filter(a => selected.includes(a.id));
  const counts = (key: "priority" | "spare" | "status", value: string) => items.filter(a => (key === "priority" ? a.priority.level : key === "spare" ? a.spare.status : a.status) === value).length;
  const single = (list: string[], set: (value: string[]) => void) => (value: string) => set(value ? [value] : []);
  const spareIcon = (a: Advisory) => a.spare.status === "available" ? <span className="o-spare-ok" title="Spare in stock">✔</span>
    : a.spare.status === "additive_print" ? <span className="o-spare-print" title="Project Forge: printed in 1 day"><Icon name="printer" size={13}/></span>
    : a.spare.status === "contested" ? <span className="o-spare-warn" title="Spare contested by other aircraft">!</span> : <span className="o-spare-bad" title="No spare in stock">✖</span>;
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
        <button type="button" className="o-btn sm" disabled={Boolean(asOf) || !can.schedule(role.id) || selectedItems.length !== 1 || selectedItems[0]?.status !== "accepted"} onClick={() => setScheduling(selectedItems[0])}><Icon name="calendar" size={14}/>Schedule confirmed finding</button>
        <button type="button" className="o-btn sm ghost" onClick={() => navigate(`/simulator?kind=early_replacement&components=${selected.map(id => items.find(a => a.id === id)?.component_id).filter(Boolean).join(",")}`)}><Icon name="sliders" size={14}/>Simulate early replacement</button>
        <button type="button" className="o-link" onClick={() => setSelected([])}>Clear</button></div>}
      <Query query={advisories} rows={10}>{() => rows.length === 0 ? <EmptyState title="No advisories match these filters" icon="filter">Clear a filter to see more of the queue.</EmptyState> :
        <div className="o-table-wrap"><table className="o-table dense o-grid-table">
          <thead><tr><th><input type="checkbox" aria-label="Select all" checked={selected.length > 0 && selected.length === rows.length} onChange={event => setSelected(event.target.checked ? rows.map(r => r.id) : [])}/></th>
            <th>{header("aircraft", "Aircraft")}</th><th>System</th><th>Component</th><th>{header("priority", "Priority")}</th><th className="num">{header("risk", "Risk (14d)")}</th><th className="num">{header("rul", "RUL")}</th><th className="center">Spares</th><th className="num">{header("downtime", "Exp. downtime")}</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{rows.map(a => <tr key={a.id} className={`clickable${selected.includes(a.id) ? " selected" : ""}`} onClick={() => setOpen(a)}>
            <td onClick={event => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${a.component_id}`} checked={selected.includes(a.id)} onChange={() => toggle(selected, setSelected, a.id)}/></td>
            <td className="o-strong">{a.aircraft}</td><td className="o-sans">{a.system_name}</td><td className="o-sans">{a.component_name}</td>
            <td><PriorityBadge level={a.priority.level}/></td>
            <td className={`num ${a.risk_14d >= 0.7 ? "o-tone-critical" : a.risk_14d >= 0.35 ? "o-tone-watch" : ""}`}>{pct(a.risk_14d)}</td>
            <td className="num">{a.rul_days.p50 >= 59.5 ? "≥60d" : `${a.rul_days.p50.toFixed(0)}d`}</td>
            <td className="center">{spareIcon(a)}</td>
            <td className="num">{num(a.downtime.act_now_days, 1)}d</td>
            <td><Pill tone={a.status}>{statusLabel[a.status]}</Pill></td>
            <td onClick={event => event.stopPropagation()}>{!asOf && can.schedule(role.id) && a.status === "accepted"
              ? <button type="button" className="o-btn sm o-row-cta" onClick={() => setScheduling(a)}>SCHEDULE</button>
              : <button type="button" className="o-btn sm ghost o-row-cta" aria-label={`${a.status === "proposed" ? "Review" : "View"} ${a.aircraft} ${a.component_name}`} onClick={() => setOpen(a)}>{a.status === "proposed" ? "REVIEW" : "VIEW"}</button>}</td>
          </tr>)}</tbody>
        </table></div>}</Query>
    </Card>
    <Drawer open={Boolean(open)} onOpenChange={value => !value && setOpen(null)} title={open ? `${open.aircraft} · ${open.component_name}` : ""} subtitle={open ? `${open.system_name} · ${open.component_id}` : undefined} width={620}>
      {open && <>{(() => { const live = items.find(a => a.id === open.id) ?? open; return <AdvisoryPanel advisory={live} replay={Boolean(asOf)}/>; })()}
        <button type="button" className="o-btn ghost" style={{ marginTop: 14 }} onClick={() => navigate(`/health/${open.component_id}`)}><Icon name="activity" size={15}/>Open sensor evidence</button></>}
    </Drawer>
    {scheduling && <ScheduleDialog open onOpenChange={value => { if (!value) { setScheduling(null); setSelected([]); } }} componentId={scheduling.component_id} advisory={scheduling}/>}
  </div>;
}
