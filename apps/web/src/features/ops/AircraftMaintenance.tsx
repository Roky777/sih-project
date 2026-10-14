import { Link } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { useCases, caseState } from "./CaseWorkspace";
import { useWorkOrders, type AircraftDetail } from "./api";
import { longDate, pct, rulText } from "./format";
import { statusLabel } from "./roles";
import { PriorityBadge } from "./ui";

const text = (row: Record<string, unknown>, key: string, fallback = "Not recorded") => typeof row[key] === "string" && row[key] ? String(row[key]) : fallback;
const readable = (value: string) => value.replaceAll("_", " ");

/** One aircraft worklist: each issue appears once, with its evidence and next step. */
export function AircraftMaintenance({ data }: { data: AircraftDetail }) {
  const id = String(data.aircraft.id);
  const orders = useWorkOrders(!data.replay);
  const cases = useCases({ aircraft: id }, !data.replay);
  const recorded = (data.replay ? data.work_orders : orders.data?.recorded ?? []).filter(row => (data.replay || row.aircraft === id) && row.status === "open");
  const planned = (data.replay ? [] : orders.data?.planned ?? []).filter(row => row.aircraft === id && !["completed", "cancelled"].includes(row.status));
  const work: Record<string, unknown>[] = [...recorded, ...planned];
  const workIds = new Set(work.map(row => String(row.id)));
  const activeCases = (data.replay ? [] : cases.data?.items ?? []).filter(row => row.aircraft_id === id && !["closed", "cancelled"].includes(row.state));
  const requirements = data.replay ? [] : data.tasks;
  const findings = data.advisories.filter(row => !["completed", "dismissed"].includes(row.status));
  const reviews = activeCases.filter(row => !row.links.some(link => link.kind === "mandatory_task" || (link.kind === "fleet_work" && workIds.has(String(link.id)))));
  const unmatched = findings.filter(row => !activeCases.some(item => item.component_id === row.component_id && !item.links.some(link => link.kind === "mandatory_task")));
  const loading = !data.replay && orders.isPending;
  return <section className="aircraft-maintenance-view" aria-label={`Maintenance for ${id}`}>
    <header className="aircraft-maintenance-heading"><div><h2>Maintenance for {id}</h2><p>Recorded work, engineering decisions and mandatory requirements.</p></div><Link className="o-btn sm ghost" to={`/maintenance?aircraft=${id}`}>Open work queue <Icon name="arrow" size={14}/></Link></header>
    {data.replay && <p className="o-note">Historical snapshot: current cases, proposals and task deadlines are not loaded.</p>}
    <section className={`aircraft-work-section${!loading && !orders.isError && !work.length ? " work-empty" : ""}`} aria-label="Active maintenance work"><header><h3>Active work <span>{loading || orders.isError ? "—" : work.length}</span></h3></header>
      {loading ? <p role="status">Loading aircraft work…</p> : !data.replay && orders.isError ? <p role="alert">Work records unavailable. <button className="o-link" onClick={() => void orders.refetch()}>Retry</button></p> : work.length ? <div className="aircraft-maintenance-list">{work.map(row => {
        const component = data.systems.flatMap(system => system.components).find(item => item.id === row.component_id);
        const linkedCase = activeCases.find(item => item.links.some(link => link.kind === "fleet_work" && link.id === row.id));
        return <article className="aircraft-maintenance-item" key={String(row.id)}><div className="aircraft-maintenance-item-main"><div className="aircraft-maintenance-item-title"><strong>{text(row, "title", text(row, "component_name", component?.name ?? text(row, "finding")))}</strong><span className="aircraft-work-state">{readable(text(row, "phase", text(row, "status")))}</span></div><p>{text(row, "agency_id", text(row, "agency"))} · {text(row, "id")}</p>{linkedCase?.blocker || row.delay_reason ? <p className="aircraft-work-blocker">Waiting: {linkedCase?.blocker ?? readable(String(row.delay_reason))}</p> : null}</div><Link className="o-btn sm ghost" to={data.replay ? `/aircraft/${id}?tab=history` : `/maintenance/work/${row.id}`}>{String(row.id)} <Icon name="arrow" size={14}/></Link></article>;
      })}</div> : <div className="aircraft-maintenance-empty"><Icon name="wrench" size={18}/><div><strong>No active work recorded</strong><p>Review decisions and mandatory requirements are listed separately.</p></div></div>}
    </section>
    <div className="aircraft-maintenance-grid">
      <section className="aircraft-work-section" aria-label="Findings and decisions"><header><div><h3>Findings & decisions</h3><p>One entry per issue, with its current next step.</p></div></header>
        {!data.replay && cases.isPending ? <p role="status">Loading linked cases…</p> : !data.replay && cases.isError ? <p role="alert">Case decisions unavailable. <button className="o-link" onClick={() => void cases.refetch()}>Retry</button></p> : <>
          <div className="aircraft-maintenance-list">{reviews.map(row => {
            const finding = findings.find(item => item.component_id === row.component_id);
            return <article className="aircraft-maintenance-item review" key={row.id}><div className="aircraft-maintenance-item-main"><div className="aircraft-maintenance-item-title">{finding && <PriorityBadge level={finding.priority.level}/>}<strong>{row.title}</strong><span className="aircraft-work-state">{caseState(row.state)}</span></div><p>{row.owner ?? row.owner_team ?? "Owner not assigned"}{row.deadline ? ` · Due ${longDate(row.deadline)}` : ""}</p>{finding && <div className="aircraft-review-facts"><span>14-day risk <b>{pct(finding.risk_14d, 1)}</b></span><span>Remaining life <b>{rulText(finding.rul_days)}</b></span><span>Proposed: {finding.action.label}</span></div>}{row.blocker && <p className="aircraft-work-blocker">{row.blocker}</p>}{finding && <details><summary>Assessment details</summary><p>{finding.explanation}</p><Link to={`/health/${finding.component_id}`}>Open component evidence</Link></details>}</div><Link className="o-btn sm ghost" to={`/cases/${row.id}`}>{row.next_action.label}<Icon name="arrow" size={14}/></Link></article>;
          })}{unmatched.map(row => <article className="aircraft-maintenance-item review" key={row.id}><div className="aircraft-maintenance-item-main"><div className="aircraft-maintenance-item-title"><PriorityBadge level={row.priority.level}/><strong>{row.component_name}</strong><span className="aircraft-work-state">{statusLabel[row.status] ?? readable(row.status)}</span></div><p>{row.action.label}</p><div className="aircraft-review-facts"><span>14-day risk <b>{pct(row.risk_14d, 1)}</b></span><span>Remaining life <b>{rulText(row.rul_days)}</b></span></div></div><Link className="o-btn sm ghost" to={`/health/${row.component_id}`}>Review evidence <Icon name="arrow" size={14}/></Link></article>)}</div>
          {!reviews.length && !unmatched.length && <p className="aircraft-summary-empty">No separate findings or decisions awaiting action.</p>}
        </>}
      </section>
      <section className="aircraft-work-section" aria-label="Mandatory requirements"><header><div><h3>Mandatory requirements</h3><p>Recorded deadlines remain authoritative.</p></div></header>
        {requirements.length ? <div className="aircraft-requirement-list">{requirements.map(row => <article key={String(row.id)}><span className={`aircraft-requirement-icon${row.overdue === true ? " overdue" : ""}`}><Icon name="calendar" size={17}/></span><div><strong>{String(row.task)}</strong><p>{row.overdue === true ? "Overdue · " : "Due "}{longDate(String(row.due_date))}</p><Link to={`/maintenance?aircraft=${id}`}>View requirement <Icon name="arrow" size={12}/></Link></div></article>)}</div> : <p className="aircraft-summary-empty">{data.replay ? "Current task deadlines are excluded from replay." : "No mandatory requirements recorded."}</p>}
      </section>
    </div>
  </section>;
}
