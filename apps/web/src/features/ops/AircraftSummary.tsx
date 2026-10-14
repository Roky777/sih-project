import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useCases, caseState } from "./CaseWorkspace";
import { useWorkOrders, type AircraftDetail } from "./api";
import { availabilityLabel, longDate, num, shortDate } from "./format";
import { statusLabel } from "./roles";
import { Icon } from "../../shared/ui/Icon";
import { PriorityBadge } from "./ui";

const field = (row: Record<string, unknown> | undefined, key: string, fallback = "Not recorded") => typeof row?.[key] === "string" && row[key] ? String(row[key]) : fallback;
const readable = (value: string) => value === "Not recorded" ? value : value.replaceAll("_", " ");

/** Current work comes from the authoritative work endpoint, not an inferred finding. */
export function AircraftSummary({ data, children, onView }: { data: AircraftDetail; children: ReactNode; onView: (tab: string) => void }) {
  const id = String(data.aircraft.id);
  const cases = useCases({ aircraft: id }, !data.replay);
  const orders = useWorkOrders(!data.replay);
  const recorded = data.replay ? data.work_orders : orders.data?.recorded ?? [];
  const activeWork = recorded.filter(row => (data.replay || row.aircraft === id) && row.status === "open");
  const planned = (data.replay ? [] : orders.data?.planned ?? []).filter(row => row.aircraft === id && !["completed", "cancelled"].includes(row.status));
  const linkedCases = (data.replay ? [] : cases.data?.items ?? []).filter(row => row.aircraft_id === id && !["closed", "cancelled"].includes(row.state));
  const driverWork = activeWork.find(row => row.component_id === data.driver);
  const work = driverWork ?? activeWork[0];
  const maintenanceCase = linkedCases.find(row => (data.driver && row.component_id === data.driver) || row.links.some(link => link.kind === "fleet_work" && link.id === work?.id)) ?? (!data.driver && !work ? linkedCases[0] : undefined);
  const components = data.systems.flatMap(system => system.components.map(component => ({ ...component, system: system.name })));
  const component = components.find(row => row.id === (work?.component_id ?? data.driver));
  const findings = data.advisories.filter(row => !["completed", "dismissed"].includes(row.status));
  const due = (data.replay ? [] : data.tasks).filter(row => typeof row.due_date === "string" && (row.overdue === true || row.due_date >= data.as_of)).slice(0, 3);
  const waiting = !data.replay && orders.isPending;
  const unavailable = !data.replay && orders.isError;
  const reason = waiting ? "Loading linked work…" : unavailable ? "Linked work unavailable" : field(work, "finding");
  const blocker = maintenanceCase?.blocker ?? (work?.delay_reason ? readable(String(work.delay_reason)) : "Not recorded");
  const reference = maintenanceCase?.id ?? (work ? field(work, "id") : "Not recorded");
  const referenceHref = maintenanceCase ? `/cases/${maintenanceCase.id}` : work ? data.replay ? `/aircraft/${id}?tab=history` : `/maintenance/work/${work.id}` : null;
  const team = maintenanceCase?.owner ?? maintenanceCase?.owner_team ?? field(work, "agency_id", field(work, "agency"));
  return <div className="aircraft-summary-content">
    {children}
    <section className={`aircraft-status-summary${data.availability_state !== "available" ? " is-restricted" : ""}`} aria-label="Operational status summary">
      <header><div><span className="aircraft-section-eyebrow">Operational status</span><h2>{availabilityLabel[data.availability_state] ?? readable(data.availability_state)}</h2></div><Link className="o-btn sm ghost" to={referenceHref ?? `/maintenance?aircraft=${id}`}>View maintenance work <Icon name="arrow" size={14}/></Link></header>
      <dl className="aircraft-status-fields">
        <div><dt>Recorded reason</dt><dd>{reason}</dd></div>
        <div><dt>Affected component / system</dt><dd>{component ? <Link to={`/health/${component.id}`}>{component.name} · {component.system}</Link> : "Not recorded"}</dd></div>
        <div><dt>Case / work reference</dt><dd>{referenceHref ? <Link to={referenceHref}>{reference}</Link> : reference}</dd></div>
        <div><dt>Current blocker</dt><dd>{waiting ? "Loading linked work…" : unavailable ? "Linked work unavailable" : blocker}</dd></div>
        <div><dt>Responsible team / agency</dt><dd>{waiting ? "Loading linked work…" : team}</dd></div>
        <div><dt>Expected return</dt><dd>Not established{typeof work?.promised === "string" && <small>Agency promise: {shortDate(String(work.promised))} · not a confirmed return</small>}</dd></div>
      </dl>
      {unavailable && <p role="alert">Linked maintenance could not load. <button className="o-link" onClick={() => void orders.refetch()}>Retry</button></p>}
      {!data.replay && cases.isError && <p role="alert">Case references unavailable. <button className="o-link" onClick={() => void cases.refetch()}>Retry cases</button></p>}
    </section>
    <section className="aircraft-statistics" aria-label="Aircraft statistics"><dl>
      <div><dt>Flight hours</dt><dd>{typeof data.aircraft.total_flight_hours === "number" ? <>{num(data.aircraft.total_flight_hours, 0)} <small>h</small></> : "Unavailable"}</dd></div>
      <div><dt>Total cycles</dt><dd>{typeof data.aircraft.total_cycles === "number" ? num(data.aircraft.total_cycles, 0) : "Unavailable"}</dd></div>
      <div><dt><abbr tabIndex={0} title="Criticality-weighted aggregate component health. This score is not an aircraft clearance or availability decision.">Aggregate health index</abbr></dt><dd>{num(data.health_index, 0)} <small>/ 100</small></dd></div>
      <div><dt>Open findings</dt><dd>{findings.length}</dd></div>
    </dl><button className="o-link aircraft-inspection-link" onClick={() => onView("visual")}>Open visual inspection <Icon name="arrow" size={15}/></button></section>
    <div className="aircraft-related-grid">
      <section className="aircraft-related-section" aria-label="Findings summary"><header><h2>Findings <span>{findings.length} open</span></h2><button className="o-link" onClick={() => onView("maintenance")}>View all</button></header>
        {findings.length ? <ul>{findings.slice(0, 3).map(row => <li key={row.id}><div><PriorityBadge level={row.priority.level}/><strong>{row.component_name}</strong></div><span>{statusLabel[row.status] ?? readable(row.status)}</span><Link to={`/health/${row.component_id}`}>Review evidence <Icon name="arrow" size={13}/></Link></li>)}</ul> : <p className="aircraft-summary-empty">No open findings in this snapshot. Existing work and restrictions are shown separately.</p>}
      </section>
      <section className="aircraft-related-section" aria-label="Maintenance summary"><header><h2>Maintenance</h2><button className="o-link" onClick={() => onView("maintenance")}>View all</button></header>
        {waiting ? <p role="status">Loading aircraft maintenance…</p> : unavailable ? <p role="alert">Maintenance unavailable. <button className="o-link" onClick={() => void orders.refetch()}>Retry</button></p> : <>
          {data.replay && <p className="o-note">Historical snapshot: current proposals, cases and mandatory-task deadlines are not loaded.</p>}
          <ul>{activeWork.slice(0, 3).map(row => <li key={String(row.id)}><div><strong>{field(row, "component_name", components.find(item => item.id === row.component_id)?.name ?? field(row, "finding"))}</strong><span>{readable(field(row, "phase", "Open work"))}</span></div><span>{field(row, "agency_id", field(row, "agency"))} · {readable(field(row, "delay_reason"))}</span><Link to={data.replay ? `/aircraft/${id}?tab=history` : `/maintenance/work/${row.id}`}>{String(row.id)} <Icon name="arrow" size={13}/></Link></li>)}
          {planned.slice(0, 2).map(row => <li key={row.id}><div><strong>{row.title}</strong><span>{caseState(row.status)}</span></div><span>{row.agency_id} · {shortDate(row.planned_start)}</span><Link to={`/maintenance/work/${row.id}`}>{row.id}</Link></li>)}
          {due.map(row => <li key={String(row.id)}><div><strong>{String(row.task)}</strong><span>Mandatory{row.overdue === true ? " · Overdue" : ""} · due {longDate(String(row.due_date))}</span></div><Link to={`/maintenance?aircraft=${id}`}>View requirement</Link></li>)}
          {linkedCases.filter(row => row.blocker).slice(0, 2).map(row => <li key={row.id}><div><strong>{row.title}</strong><span>{row.blocker}</span></div><Link to={`/cases/${row.id}`}>Open case</Link></li>)}</ul>
          {!activeWork.length && !planned.length && !due.length && !linkedCases.some(row => row.blocker) && <p className="aircraft-summary-empty">No active work, upcoming mandatory tasks or case blockers are recorded for this aircraft.</p>}
        </>}
      </section>
    </div>
  </div>;
}
