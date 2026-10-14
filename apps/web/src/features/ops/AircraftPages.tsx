import { AircraftRegistrationAction, RegisteredAircraftSection, useRegisteredAircraft } from "./AircraftRegistration";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AircraftSummary } from "./AircraftSummary";
import { AircraftMaintenance } from "./AircraftMaintenance";
import { ReplaySlider } from "./ReplaySlider";
import { useOptionalAssistant } from "../assistant/AssistantProvider";
import { ExplainWithAI } from "../assistant/AssistantPanel";
import { airframeInfo as airframeOf } from "./airframeInfo";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { useAircraftDetail, useAircraftList, type AircraftDetail } from "./api";
import { availabilityLabel, longDate, num, pct, rulText, shortDate, stateRank } from "./format";
import { useRememberFocus } from "./Focus";
import { Card, EmptyState, PageHead, Pill, PriorityBadge, Query, Ring, Segmented, StateBadge, Tabs } from "./ui";

import "./aircraft-workspace.css";

const ResearchRegister = lazy(() => import("./ResearchAircraft").then(m => ({ default: m.ResearchAircraftRegister })));
const ResearchDetail = lazy(() => import("./ResearchAircraft").then(m => ({ default: m.ResearchAircraftDetail })));
const TwinShowcase = lazy(() => import("./TwinShowcase").then(module => ({ default: module.TwinShowcase })));
const AircraftBlueprint = lazy(() => import("./AircraftBlueprint").then(module => ({ default: module.AircraftBlueprint })));

function DeferredBlueprint({ data }: { data: AircraftDetail }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={host} style={visible ? undefined : { minHeight: 480 }}>
    {visible ? <Suspense fallback={<p role="status">Opening blueprint…</p>}><AircraftBlueprint data={data}/></Suspense> : <p>Aircraft blueprint · Scroll to inspect component architecture.</p>}
  </div>;
}


const hiTone = (hi: number) => hi >= 80 ? "healthy" : hi >= 60 ? "watch" : hi >= 40 ? "degraded" : "critical";

export function AircraftListPage() {
  const [params] = useSearchParams();
  return params.get("dataset") === "research" ? <Suspense fallback={<p role="status">Opening research register…</p>}><ResearchRegister/></Suspense> : <FleetAircraftList/>;
}
function FleetAircraftList() {
  const registered = useRegisteredAircraft();
  const list = useAircraftList();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "table" ? "table" : "cards";
  const search = params.get("search") ?? "";
  const filter = ["all", "available", "grounded", "findings", "maintenance", "onboarding"].includes(params.get("filter") ?? "") ? params.get("filter")! : "all";
  const sort = params.get("sort") === "tail" ? "tail" : params.get("sort") === "hi" ? "hi" : "risk";
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (list.data ?? []).filter(row => (!query || `${row.id} ${row.base} ${airframeOf(row).title}`.toLowerCase().includes(query))
      && (filter === "all" || (filter === "available" ? row.availability_state === "available" : filter === "findings" ? stateRank[row.state] >= 1 : filter === "maintenance" ? row.state === "under_maintenance" : row.availability_state !== "available")))
      .sort((a, b) => sort === "tail" ? a.id.localeCompare(b.id) : sort === "hi" ? a.health_index - b.health_index : stateRank[b.state] - stateRank[a.state] || a.health_index - b.health_index);
  }, [list.data, search, filter, sort]);
  const counts = { onboarding: registered.data?.total ?? 0, available: list.data?.filter(r => r.availability_state === "available").length ?? 0, findings: list.data?.filter(r => stateRank[r.state] >= 1).length ?? 0, maintenance: list.data?.filter(r => r.state === "under_maintenance").length ?? 0, grounded: list.data?.filter(r => r.availability_state !== "available").length ?? 0, all: (list.data?.length ?? 0) + (registered.data?.total ?? 0), attention: list.data?.filter(r => stateRank[r.state] >= 1 && r.availability_state === "available").length ?? 0, down: list.data?.filter(r => r.availability_state !== "available").length ?? 0 };
  const store = (key: string, value: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set(key, value); return next; }, { replace: true });
  const openAircraft = (id: string) => navigate(`/aircraft/${id}?return=${encodeURIComponent(`/aircraft?${params}`)}`);
  return <>
    <PageHead eyebrow="Explore" title="Aircraft" description="Review fleet condition, open an aircraft, or manage records awaiting assessment." actions={<AircraftRegistrationAction/>}/>
    <div className="o-filters">
      {(["all", "available", "grounded", "findings", "maintenance", "onboarding"] as const).map(key => <button type="button" key={key} className={`o-chip${filter === key ? " on" : ""}`} aria-pressed={filter === key} onClick={() => store("filter", key)}>{key === "all" ? "All aircraft" : key === "maintenance" ? "Active maintenance" : key === "onboarding" ? "Onboarding" : key[0].toUpperCase() + key.slice(1)}<span className="o-chip-count">{counts[key]}</span></button>)}
      <label className="o-searchbox"><Icon name="search" size={15}/><span className="sr-only">Search aircraft</span><input value={search} onChange={event => store("search", event.target.value)} placeholder="Search aircraft, family or base…"/></label>
      <span className="o-spacer"/>
      {filter !== "onboarding" && <><Segmented label="Register view" value={view} onChange={value => store("view", value)} options={[["cards", "Cards"], ["table", "Table"]] as const}/>
      <Segmented label="Sort" value={sort} onChange={value => store("sort", value)} options={[["risk", "Risk"], ["hi", "Health"], ["tail", "Tail"]] as const}/></>}
    </div>
    {filter !== "onboarding" && <Query query={list} rows={8}>{() => rows.length === 0 ? <EmptyState title="No aircraft match these filters" icon="search"/> :
      view === "table" ? <div className="o-table-wrap"><table className="o-table"><thead><tr><th>Aircraft</th><th>Condition</th><th>Availability</th><th>Family · base</th><th>Open findings</th><th>Evidence</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><button className="o-link" onClick={() => openAircraft(row.id)}>{row.id}</button></td><td><StateBadge state={row.state} compact/></td><td>{availabilityLabel[row.availability_state]}</td><td>{airframeOf(row).title} · {row.base}</td><td>{row.open_advisories}</td><td>HI {num(row.health_index)}/100 · {num(row.total_flight_hours)} FH</td></tr>)}</tbody></table></div> : <div className="o-aircraft-grid">{rows.map((row, index) => <button type="button" key={row.id} className={`o-aircraft-card state-${row.state}`} style={{ animationDelay: `${Math.min(index, 20) * 18}ms` }} onClick={() => openAircraft(row.id)}>
        <div className="o-aircraft-card-top"><div><strong>{row.id}</strong><small>{airframeOf(row).title} · {row.base.replace("BASE-", "Base ")} · {num(row.total_flight_hours)} FH</small></div><Ring value={row.health_index} size={50} tone={hiTone(row.health_index)} label={`Health index ${row.health_index.toFixed(0)}`}/></div>
        <div className="o-aircraft-card-mid"><StateBadge state={row.state} compact/><Pill tone={row.availability_state === "available" ? "healthy" : "maint"}>{availabilityLabel[row.availability_state]}</Pill></div>
        <div className="o-aircraft-card-foot">{row.driver ? <span>Driver: {row.driver.replace(`${row.id}-`, "")}</span> : <span className="o-muted">No findings</span>}{row.top_priority && <span className="o-adv-count"><PriorityBadge level={row.top_priority}/>{row.open_advisories}</span>}</div>
      </button>)}</div>}
    </Query>}
    {(filter === "all" || filter === "onboarding") && <RegisteredAircraftSection only={filter === "onboarding"} search={search}/>}
  </>;
}

export function AircraftDetailPage() {
  const [params] = useSearchParams();
  return params.get("dataset") === "research" ? <Suspense fallback={<p role="status">Opening research aircraft…</p>}><ResearchDetail/></Suspense> : <FleetAircraftDetail/>;
}
function FleetAircraftDetail() {
  const { aircraftId = "" } = useParams();
  const detail = useAircraftDetail(aircraftId);
  const assistant = useOptionalAssistant();
  const pinned = assistant?.pinned;
  const followPage = assistant?.followPage;
  useEffect(() => {
    if (pinned && ((pinned.aircraft_id && pinned.aircraft_id !== aircraftId) || (pinned.component_id?.startsWith("AC-") && !pinned.component_id.startsWith(`${aircraftId}-`)))) followPage?.();
  }, [aircraftId, pinned, followPage]);
  useRememberFocus("aircraft", aircraftId);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? (params.has("system") ? "components" : "summary");
  const currentTab = tab === "twin" ? "summary" : tab === "blueprint" ? "visual" : tab === "advisories" ? "maintenance" : ["summary", "components", "maintenance", "history", "visual"].includes(tab) ? tab : "summary";
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollTarget) return;
    document.getElementById(scrollTarget)?.scrollIntoView({ block: "start", behavior: "instant" });
    setScrollTarget(null);
  }, [currentTab, scrollTarget]);
  const chooseTab = (value: string, target = "aircraft-workspace") => {
    setParams(previous => { const next = new URLSearchParams(previous); next.set("tab", value); return next; });
    setScrollTarget(target);
  };
  return <Query query={detail} rows={10}>{data => data.aircraft.id !== aircraftId ? <section className="aircraft-overview-loading" role="status">Loading {aircraftId} records…</section> : <div className="o-screen aircraft-detail-screen">
    {detail.isPlaceholderData && <p role="status">Loading {aircraftId}… Previous aircraft records remain visible until its response arrives.</p>}
    {detail.isError && <p role="alert">Could not update this aircraft. <button type="button" onClick={() => void detail.refetch()}>Retry</button></p>}
    <section className="aircraft-detail-workspace" id="aircraft-workspace" tabIndex={-1} aria-label="Aircraft inspection workspace">
      <header className="aircraft-workspace-head">
        <div className="aircraft-record-identity"><Link className="aircraft-back-link" to={params.get("return")?.startsWith("/aircraft?") ? params.get("return")! : "/aircraft"}><Icon name="arrow" size={15} style={{ transform: "rotate(180deg)" }}/> Back to aircraft register</Link><h1>{String(data.aircraft.id)}<span>{airframeOf({ id: data.aircraft.id, type: data.aircraft.type }).title}</span></h1><p>{String(data.aircraft.base)} · {longDate(data.as_of)}{data.replay ? " · Historical snapshot" : " · Latest recorded snapshot"}</p></div>
        <div className="aircraft-workspace-context"><StateBadge state={data.state} compact/><Pill tone={data.availability_state === "available" ? "healthy" : "maint"}>{availabilityLabel[data.availability_state]}</Pill><ExplainWithAI selection={{ aircraft_id: String(data.aircraft.id) }} question="Show the evidence behind this aircraft's alert."/></div>
      </header>
      <nav className="aircraft-workspace-nav" aria-label="Aircraft workspace sections">
        <Tabs value={currentTab} onChange={value => chooseTab(value)} tabs={[["summary", "Summary", "aircraft"], ["components", "Components", "list"], ["maintenance", "Maintenance", "wrench"], ["history", "History", "history"], ["visual", "Visual inspection", "aircraft"]] as const}/>
      </nav>
      <div className={`aircraft-workspace-body pane-${currentTab}`} role="tabpanel" aria-label={currentTab === "visual" ? "Visual inspection" : currentTab === "components" ? "Component records" : currentTab === "history" ? "Aircraft history" : currentTab === "maintenance" ? "Aircraft maintenance" : "Aircraft summary"}>
        {currentTab === "summary" && <AircraftSummary key={`${aircraftId}-${data.as_of}`} data={data} onView={chooseTab}>
          <Suspense fallback={<section className="aircraft-overview-loading" role="status">Preparing interactive aircraft model…</section>}><TwinShowcase key={`${aircraftId}-${data.as_of}`} data={data} onExploreBlueprint={() => chooseTab("visual")}/></Suspense>
        </AircraftSummary>}
        {currentTab === "visual" && <>
          <Segmented label="Visual inspection tools" value={params.get("inspection") === "airframe" ? "airframe" : "blueprint"} onChange={value => setParams(previous => { const next = new URLSearchParams(previous); next.set("tab", "visual"); next.set("inspection", value); return next; })} options={[["airframe", "Aircraft model"], ["blueprint", "Blueprint & assemblies"]] as const}/>
          {params.get("inspection") === "airframe" ? <Suspense fallback={<p role="status">Preparing aircraft model…</p>}><TwinShowcase key={aircraftId} large data={data} onExploreBlueprint={() => setParams(previous => { const next = new URLSearchParams(previous); next.set("inspection", "blueprint"); return next; })}/></Suspense> : <div id="aircraft-blueprint-placeholder"><DeferredBlueprint key={`${aircraftId}-${data.as_of}`} data={data}/></div>}
        </>}
        {currentTab === "components" && <TwinTab data={data}/>}
        {currentTab === "history" && <><Card title="History / replay" subtitle="Enter a historical date explicitly; mutations are unavailable during replay"><ReplaySlider/></Card><HistoryTab data={data}/></>}
        {currentTab === "maintenance" && <AircraftMaintenance key={`${aircraftId}-${data.as_of}`} data={data}/>}
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
    <Card title="System and component records" subtitle={`${data.systems.length} systems · ${data.systems.reduce((count, system) => count + system.components.length, 0)} components. Expand a system for health, risk and remaining life.`}>
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

