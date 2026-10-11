import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { TwinShowcase } from "./TwinShowcase";
import { AircraftBlueprint } from "./AircraftBlueprint";
import { useAsOf } from "./AsOf";
import { useAircraftDetail, useAircraftList, type AircraftDetail } from "./api";
import { availabilityLabel, num, pct, rulText, shortDate, stateRank } from "./format";
import { AdvisoryCompact } from "./AdvisoryViews";
import { useRememberFocus } from "./Focus";
import { Card, EmptyState, PageHead, Pill, PriorityBadge, Query, Ring, Segmented, StateBadge, Tabs } from "./ui";

import "./aircraft-workspace.css";

const hiTone = (hi: number) => hi >= 80 ? "healthy" : hi >= 60 ? "watch" : hi >= 40 ? "degraded" : "critical";

export function AircraftListPage() {
  const list = useAircraftList();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "attention" | "down">("all");
  const [sort, setSort] = useState<"risk" | "tail" | "hi">("risk");
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (list.data ?? []).filter(row => (!query || `${row.id} ${row.base}`.toLowerCase().includes(query))
      && (filter === "all" || (filter === "attention" ? stateRank[row.state] >= 1 && row.availability_state === "available" : row.availability_state !== "available")))
      .sort((a, b) => sort === "tail" ? a.id.localeCompare(b.id) : sort === "hi" ? a.health_index - b.health_index : stateRank[b.state] - stateRank[a.state] || a.health_index - b.health_index);
  }, [list.data, search, filter, sort]);
  const counts = { all: list.data?.length ?? 0, attention: list.data?.filter(r => stateRank[r.state] >= 1 && r.availability_state === "available").length ?? 0, down: list.data?.filter(r => r.availability_state !== "available").length ?? 0 };
  return <>
    <PageHead eyebrow="Explore" title="Aircraft" description="Each aircraft shows the worst condition among its important components. Open one to see its digital twin."/>
    <div className="o-filters">
      {(["all", "attention", "down"] as const).map(key => <button type="button" key={key} className={`o-chip${filter === key ? " on" : ""}`} onClick={() => setFilter(key)}>{key === "all" ? "All aircraft" : key === "attention" ? "Flying with findings" : "In maintenance"}<span className="o-chip-count">{counts[key]}</span></button>)}
      <label className="o-searchbox"><Icon name="search" size={15}/><span className="sr-only">Search aircraft</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tail or base…"/></label>
      <span className="o-spacer"/>
      <Segmented label="Sort" value={sort} onChange={setSort} options={[["risk", "Risk"], ["hi", "Health"], ["tail", "Tail"]] as const}/>
    </div>
    <Query query={list} rows={8}>{() => rows.length === 0 ? <EmptyState title="No aircraft match these filters" icon="search"/> :
      <div className="o-aircraft-grid">{rows.map((row, index) => <button type="button" key={row.id} className={`o-aircraft-card state-${row.state}`} style={{ animationDelay: `${Math.min(index, 20) * 18}ms` }} onClick={() => navigate(`/aircraft/${row.id}`)}>
        <div className="o-aircraft-card-top"><div><strong>{row.id}</strong><small>{row.base.replace("BASE-", "Base ")} · {num(row.total_flight_hours)} FH</small></div><Ring value={row.health_index} size={50} tone={hiTone(row.health_index)} label={`Health index ${row.health_index.toFixed(0)}`}/></div>
        <div className="o-aircraft-card-mid"><StateBadge state={row.state} compact/><Pill tone={row.availability_state === "available" ? "healthy" : "maint"}>{availabilityLabel[row.availability_state]}</Pill></div>
        <div className="o-aircraft-card-foot">{row.driver ? <span>Driver: {row.driver.replace(`${row.id}-`, "")}</span> : <span className="o-muted">No findings</span>}{row.top_priority && <span className="o-adv-count"><PriorityBadge level={row.top_priority}/>{row.open_advisories}</span>}</div>
      </button>)}</div>}
    </Query>
  </>;
}

export function AircraftDetailPage() {
  const { aircraftId = "" } = useParams();
  const { asOf } = useAsOf();
  const detail = useAircraftDetail(aircraftId);
  useRememberFocus("aircraft", aircraftId);
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") ?? "twin") as "twin" | "components" | "history" | "advisories";
  const currentTab = ["twin", "components", "history", "advisories"].includes(tab) ? tab : "twin";
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollTarget) return;
    document.getElementById(scrollTarget)?.scrollIntoView({ block: "start", behavior: "instant" });
    setScrollTarget(null);
  }, [currentTab, scrollTarget]);
  const chooseTab = (value: string, target = "aircraft-workspace") => {
    setParams(previous => { const next = new URLSearchParams(previous); next.set("tab", value); return next; }, { replace: true });
    setScrollTarget(target);
  };
  return <Query query={detail} rows={10}>{data => <div className="o-screen aircraft-detail-screen">
    {detail.isPlaceholderData && <p role="status">Loading {aircraftId}… Previous aircraft records remain visible until its response arrives.</p>}
    {detail.isError && <p role="alert">Could not update this aircraft. <button type="button" onClick={() => void detail.refetch()}>Retry</button></p>}
    <TwinShowcase data={data} onExploreBlueprint={() => chooseTab("twin")}/>
    <section className="aircraft-detail-workspace" id="aircraft-workspace" aria-label="Aircraft inspection workspace">
      <header className="aircraft-workspace-head">
        <div><span className="bp-eyebrow">AIRCRAFT / INSPECTION & RECORDS</span><h2>Inspection workspace</h2><p>{String(data.aircraft.id)} · {shortDate(data.as_of)}{data.replay ? " · Historical snapshot" : " · Latest snapshot"}</p></div>
        <div className="aircraft-workspace-context"><StateBadge state={data.state} compact/><Pill tone={data.availability_state === "available" ? "healthy" : "maint"}>{availabilityLabel[data.availability_state]}</Pill><span>{data.systems.length} systems · {data.systems.reduce((count, system) => count + system.components.length, 0)} components</span></div>
      </header>
      <nav className="aircraft-workspace-nav" aria-label="Aircraft workspace sections">
        <Tabs value={currentTab} onChange={value => chooseTab(value)} tabs={[["twin", "Blueprint", "aircraft"], ["components", "Components", "list"], ["history", "History", "history"], ["advisories", `Advisories (${data.advisories.length})`, "warning"]] as const}/>
      </nav>
      <div className={`aircraft-workspace-body pane-${currentTab}`} role="tabpanel" aria-label={currentTab === "twin" ? "Aircraft blueprint" : currentTab === "components" ? "Component records" : currentTab === "history" ? "Aircraft history" : "Aircraft advisories"}>
        {currentTab === "twin" && <AircraftBlueprint key={`${aircraftId}-${asOf}-${String(data.aircraft.id)}-${data.as_of}`} data={data}/>}
        {currentTab === "components" && <TwinTab data={data}/>}
        {currentTab === "history" && <HistoryTab data={data}/>}
        {currentTab === "advisories" && <><div className="aircraft-pane-intro"><h3>Maintenance advisories</h3><p>Recorded findings and recommended actions for {String(data.aircraft.id)}.</p></div>{data.advisories.length ? <div className="o-adv-stack">{data.advisories.map(a => <AdvisoryCompact key={a.id} advisory={a}/>)}</div> : <EmptyState title="No advisories for this aircraft"/>}</>}
      </div>
    </section>
  </div>}</Query>;
}

function TwinTab({ data }: { data: AircraftDetail }) {
  const [params, setParams] = useSearchParams();
  const ordered = [...data.systems].sort((a, b) => stateRank[b.state] - stateRank[a.state] || a.health_index - b.health_index);
  const selectedCode = params.get("system") ?? ordered[0]?.code ?? null;
  const [expanded, setExpanded] = useState<string[]>(() => selectedCode ? [selectedCode] : []);
  const choose = (code: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set("system", code); return next; }, { replace: true });
  const toggle = (code: string) => { choose(code); setExpanded(list => list.includes(code) ? list.filter(c => c !== code) : [...list, code]); };
  const advisories = new Map(data.advisories.map(a => [a.component_id, a]));
  return <div id="twin-system-details" className="aircraft-component-records">
    <Card title="System and component records" subtitle="Criticality-weighted system health. Expand a system for each component's HI, risk and remaining life.">
      <p className="aircraft-table-hint">Swipe the table to view health, remaining life and evidence.</p>
      <div className="o-table-wrap"><table className="o-table o-tree">
        <thead><tr><th>System / component</th><th className="num">HI</th><th>State</th><th className="num">Risk 14d</th><th className="num">RUL</th><th>Advisory</th><th/></tr></thead>
        <tbody>{ordered.flatMap(system => {
          const isOpen = expanded.includes(system.code);
          const head = <tr key={system.code} className={`o-tree-system${selectedCode === system.code ? " selected" : ""}`} onClick={() => toggle(system.code)}>
            <td className="o-sans"><button type="button" className="aircraft-system-toggle" aria-expanded={isOpen} onClick={event => { event.stopPropagation(); toggle(system.code); }}><Icon name="chevron" size={12} style={{ transform: isOpen ? "rotate(90deg)" : undefined }}/><strong>{system.name}</strong><span className="o-muted">{system.components.length} components</span></button></td>
            <td className={`num o-tone-${hiTone(system.health_index)}`}>{system.health_index.toFixed(0)}</td>
            <td><StateBadge state={system.state} compact/></td><td/><td/><td/><td/>
          </tr>;
          const rows = isOpen ? [...system.components].sort((a, b) => stateRank[b.state] - stateRank[a.state] || a.hi - b.hi).map(component => {
            const advisory = advisories.get(component.id);
            return <tr key={component.id} className="o-tree-component">
              <td className="o-sans"><span className={`o-tone-${hiTone(component.hi)}`}>{component.name} (HI: {component.hi.toFixed(0)})</span><small>{component.serial} · criticality {component.criticality}</small></td>
              <td className={`num o-tone-${hiTone(component.hi)}`}>{component.hi.toFixed(0)}</td>
              <td><StateBadge state={component.state} compact/></td>
              <td className="num">{pct(component.risk14)}</td>
              <td className="num">{rulText(component.rul).split(" (")[0]}</td>
              <td>{advisory ? <PriorityBadge level={advisory.priority.level}/> : <span className="o-muted">—</span>}</td>
              <td className="num"><Link className="o-btn sm ghost" to={`/health/${component.id}`}>View evidence</Link></td>
            </tr>;
          }) : [];
          return [head, ...rows];
        })}</tbody>
      </table></div>
    </Card>
  </div>;
}

function HistoryTab({ data }: { data: AircraftDetail }) {
  const strip = data.availability_90d as { date: string; state: string }[];
  return <div className="o-grid o-cols-main">
    <Card title="Maintenance and fault timeline" subtitle="Work orders, findings and functional failures from technical records">
      {!data.timeline.length && <p className="aircraft-empty-line"><Icon name="history" size={16}/>No timeline events recorded in this snapshot.</p>}
      <ol className="o-timeline">{(data.timeline as { date: string; kind: string; label: string; component_id: string | null; reference: string }[]).map((event, index) => <li key={`${event.reference}-${index}`} className={`kind-${event.kind}`}>
        <span className="o-timeline-date">{shortDate(event.date)}</span><i/>
        <div><strong>{event.label}</strong><small>{event.reference}{event.component_id ? <> · <Link to={`/health/${event.component_id}`}>{event.component_id.replace(`${data.aircraft.id}-`, "")}</Link></> : null}</small></div>
      </li>)}</ol>
    </Card>
    <div className="o-stack">
      <Card title="Availability, last 90 days" subtitle="One cell per day">
        {!strip.length && <p className="aircraft-empty-line"><Icon name="calendar" size={16}/>Availability history unavailable in this snapshot.</p>}
        <div className="o-daystrip">{strip.map(day => <span key={day.date} className={`d-${day.state}`} title={`${shortDate(day.date)}: ${availabilityLabel[day.state]}`}/>)}</div>
        <div className="o-legend" style={{ marginTop: 10 }}>{["available", "unscheduled_repair", "awaiting_spares", "awaiting_agency", "scheduled_maintenance"].map(state => <span key={state}><i className={`d-${state}`}/>{availabilityLabel[state]}</span>)}</div>
      </Card>
      <Card title="Mandatory tasks" subtitle="Inspections and hard-time replacements">
        {!data.tasks.length && <p className="aircraft-empty-line"><Icon name="check" size={16}/>No mandatory tasks recorded in this snapshot.</p>}
        {(data.tasks as { id: string; task: string; due_in_days: number; overdue: boolean; due_date: string }[]).map(task => <div key={task.id} className={`o-task-row${task.overdue ? " overdue" : ""}`}><Icon name={task.overdue ? "warning" : "calendar"} size={16}/><div><strong>{task.task}</strong><small>{task.overdue ? "Overdue" : `Due in ${task.due_in_days} days`} · {shortDate(task.due_date)}</small></div></div>)}
      </Card>
      <Card title="Recent work orders">
        {!data.work_orders.length && <p className="aircraft-empty-line"><Icon name="wrench" size={16}/>No work orders recorded in this snapshot.</p>}
        {(data.work_orders as { id: string; finding: string; opened: string; status: string; delay_reason: string | null; agency: string }[]).slice(0, 8).map(order => <div key={order.id} className="o-task-row"><Icon name="wrench" size={16}/><div><strong>{order.id} · {order.finding}</strong><small>{shortDate(order.opened)} · {order.agency} · {order.status}{order.delay_reason ? ` · ${availabilityLabel[order.delay_reason] ?? order.delay_reason.replace("_", " ")}` : ""}</small></div></div>)}
      </Card>
    </div>
  </div>;
}

