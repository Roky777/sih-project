import { useCases } from "./CaseWorkspace";
import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { CannibalizeButton } from "./Cannibalize";
import { addDays, dayDiff, useAsOf } from "./AsOf";
import {
  useAdvisories, useAircraftList, useEngine, useInventory, usePartRequests, useTasks,
  useReturnToService, useUpdatePartRequest, useUpdateWorkOrder, useWorkOrders, type Advisory, type PartRequest,
  type PlannedWorkOrder,
} from "./api";
import { ScheduleDialog } from "./AdvisoryViews";
import { availabilityLabel, longDate, num, pct, shortDate } from "./format";
import { can, partsLabel, roleById, roles, useRole, type RoleId } from "./roles";
import { Card, EmptyState, Modal, Pill, PriorityBadge, Query, useToast } from "./ui";

/** Plain-language one-liner for a finding. */
export function findingSentence(a: Advisory) {
  const life = a.rul_days.p50 >= 59.5 ? "estimated remaining life ≥60 days" : `estimated remaining life ${a.rul_days.p50.toFixed(0)} days (range ${a.rul_days.p10.toFixed(0)}–${a.rul_days.p90 >= 59.5 ? "60+" : a.rul_days.p90.toFixed(0)})`;
  return `${pct(a.risk_14d)} chance of failure in the next 14 days; ${life}.`;
}

function NotYourStep({ owner }: { owner: RoleId }) {
  const { role } = useRole();
  if (role.id === owner || role.id === "supervisor") return null;
  return <p className="o-note"><Icon name="info" size={16}/>This step belongs to the {roleById[owner].label.toLowerCase()}. You can follow progress here; actions are available to that role.</p>;
}

export function HomeRedirect() {
  const { role } = useRole();
  return <Navigate to={role.home} replace/>;
}

/* 2. Maintenance supervisor ---------------------------------------------------------------------- */
export function PlanPage() {
  const [params] = useSearchParams();
  const aircraftScope = params.get("aircraft"), componentScope = params.get("component");
  const inScope = (record: { aircraft: string; component_id?: string | null }) => (!aircraftScope || record.aircraft === aircraftScope) && (!componentScope || record.component_id === componentScope);
  const advisories = useAdvisories();
  const orders = useWorkOrders();
  const tasks = useTasks();
  const requests = usePartRequests();
  const { role } = useRole();
  const { asOf } = useAsOf();
  const [scheduling, setScheduling] = useState<Advisory | null>(null);
  const items = advisories.data ?? [];
  const cases = useCases({ aircraft: aircraftScope ?? undefined, component: componentScope ?? undefined });
  const caseFor = (component: string) => cases.data?.items.find(item => item.component_id === component);
  const toSchedule = items.filter(a => a.status === "accepted" && inScope(a));
  const unreviewedUrgent = items.filter(a => a.status === "proposed" && inScope(a) && ["P1", "P2"].includes(a.priority.level)).length;
  const due = (tasks.data?.tasks ?? []).filter(task => task.due_in_days <= 14 && (!aircraftScope || task.aircraft === aircraftScope));
  const partsByOrder = new Map((requests.data ?? []).map(r => [r.work_order_id, r]));
  const allowed = can.schedule(role.id) && !asOf;
  return <>
    <NotYourStep owner="supervisor"/>
    {unreviewedUrgent > 0 && <p className="o-note warn"><Icon name="warning" size={16}/>{unreviewedUrgent} urgent finding{unreviewedUrgent === 1 ? " is" : "s are"} still waiting for engineer review. <Link className="o-link" to={`/advisories?${new URLSearchParams({ status: "proposed", ...(aircraftScope ? { aircraft: aircraftScope } : {}), ...(componentScope ? { component: componentScope } : {}) })}`}>Open review queue</Link></p>}
    <div className="o-grid o-cols-side">
      <Card title={`Confirmed findings to schedule (${toSchedule.length})`} subtitle="Engineers confirmed these need maintenance. Prepare a tentative proposal with parts and resources, then review it for approval.">
        <Query query={advisories} rows={4}>{() => toSchedule.length === 0 ? <EmptyState title="Nothing to schedule">Confirmed findings from engineers appear here.</EmptyState> :
          <div className="o-worklist">{toSchedule.map(a => <article key={a.id} className={`o-finding p-${a.priority.level.toLowerCase()}`}>
            <div className="o-finding-main">
              <div className="o-finding-title"><PriorityBadge level={a.priority.level}/><Link to={`/health/${a.component_id}`}><strong>{a.aircraft} · {a.component_name}</strong></Link></div>
              <p><b>{a.action.label}.</b> {findingSentence(a)}</p>
              <div className="o-finding-evidence"><span>Spare {a.spare.part_number}: <b>{a.spare.available > 0 ? `${a.spare.available} in stock` : a.spare.status === "additive_print" ? "none in stock · additive print route, 1 day" : `none in stock · ${a.spare.lead_time_days}-day lead time`}</b></span><span>Planned downtime <b>{num(a.downtime.act_now_days, 1)} d</b></span><span>If it fails <b>{num(a.downtime.run_to_failure_days, 1)} d</b></span></div>
            </div>
            <div className="o-finding-actions">{allowed ? <Link className="o-btn sm" to={caseFor(a.component_id) ? `/cases/${caseFor(a.component_id)!.id}` : `/health/${a.component_id}`}>Prepare maintenance plan</Link> : <Pill tone="accent">Supervisor schedules</Pill>}</div>
          </article>)}</div>}</Query>
      </Card>
      <Card title="Mandatory tasks due in 14 days" subtitle={componentScope && !aircraftScope ? "Fleet-wide mandatory tasks remain visible. Never deferred by model output." : "Inspections and hard-time replacements. Never deferred by model output."}>
        <Query query={tasks} rows={4}>{() => due.length === 0 ? <EmptyState title="Nothing due in the next 14 days"/> :
          <ul className="o-due-list">{due.map(task => <li key={task.id} className={task.overdue ? "overdue" : task.due_in_days <= 7 ? "soon" : ""}>
            <span className="o-due-when"><strong>{task.overdue ? "Overdue" : `${task.due_in_days} d`}</strong><small>{shortDate(task.due_date)}</small></span>
            <div><Link to={`/aircraft/${task.aircraft}`} className="o-strong">{task.aircraft}</Link><p>{task.task}</p></div>
          </li>)}</ul>}</Query>
      </Card>
    </div>
    <Card title="Aircraft on the ground now" subtitle="Repairs in progress at the maintenance agencies. When a repair is signed off, return the aircraft to service — the fleet dashboard updates immediately.">
      <Query query={orders} rows={4}>{data => <GroundedTable rows={(data.recorded as RecordedRow[]).filter(r => r.status === "open" && inScope(r))} allowed={allowed}/>}</Query>
    </Card>
    <Card id="scheduled-work" title="Scheduled work" subtitle="Work orders planned from findings. Approved work starts only when ready. Execution and verification are recorded separately; remaining restrictions determine availability.">
      <Query query={orders} rows={4}>{data => data.planned.filter(w => ["planned", "approved", "in_progress", "awaiting_verification"].includes(w.status) && inScope(w)).length === 0
        ? <EmptyState title="No scheduled work yet" icon="calendar">Schedule a confirmed finding above.</EmptyState>
        : <ScheduledTable orders={data.planned.filter(w => ["planned", "approved", "in_progress", "awaiting_verification"].includes(w.status) && inScope(w))} parts={partsByOrder} allowed={allowed}/>}</Query>
    </Card>
    <details className="workspace-planning-tools"><summary>Additional planning tool · compare compatible part swaps</summary><CannibalizeButton/></details>
    {scheduling && <ScheduleDialog open onOpenChange={value => !value && setScheduling(null)} componentId={scheduling.component_id} advisory={scheduling}/>}
  </>;
}

type RecordedRow = { id: string; aircraft: string; component_id: string | null; component_name: string; finding: string; agency_id: string; status: string; phase: string; opened: string; promised: string; late: boolean };
const phaseLabel: Record<string, string> = { in_work: "In repair", awaiting_spares: "Waiting for spare", awaiting_agency: "Waiting for a bay" };

function GroundedTable({ rows, allowed }: { rows: RecordedRow[]; allowed: boolean }) {
  const [closing, setClosing] = useState<RecordedRow | null>(null);
  if (rows.length === 0) return <EmptyState title="No aircraft grounded by agency work"/>;
  return <><div className="o-table-wrap"><table className="o-table">
    <thead><tr><th>Aircraft · work</th><th>Agency</th><th>Since</th><th>Promised</th><th>Status</th><th/></tr></thead>
    <tbody>{rows.map(row => <tr key={row.id}>
      <td><Link className="o-strong" to={`/aircraft/${row.aircraft}`}>{row.aircraft}</Link> · {row.component_name} {row.finding}<small>{row.id}</small></td>
      <td>{row.agency_id.replace("AG-", "")}</td>
      <td>{shortDate(row.opened)}</td>
      <td>{shortDate(row.promised)}{row.late && <small className="o-tone-critical">overdue</small>}</td>
      <td><Pill tone={row.phase === "in_work" ? "critical" : row.phase === "awaiting_spares" ? "degraded" : "watch"}>{phaseLabel[row.phase] ?? row.phase}</Pill></td>
      <td>{allowed && <div className="o-row-actions"><button type="button" className="o-btn sm success" onClick={() => setClosing(row)}><Icon name="check" size={14}/>Return to service</button></div>}</td>
    </tr>)}</tbody>
  </table></div>
  {closing && <ReturnDialog row={closing} onClose={() => setClosing(null)}/>}</>;
}

function ReturnDialog({ row, onClose }: { row: RecordedRow; onClose: () => void }) {
  const close = useReturnToService();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [executed, setExecuted] = useState(false);
  return <Modal open onOpenChange={value => !value && onClose()} title={`Agency work outcome · ${row.aircraft}`}>
    <p className="o-muted o-small">Confirms the agency has finished {row.id} ({row.component_name.toLowerCase()} {row.finding}). Remaining restrictions, mandatory tasks and verification still determine demonstrator availability.</p>
    {row.phase !== "in_work" && <p className="o-warn-line"><Icon name="warning" size={14}/>The agency still reports this job as {(phaseLabel[row.phase] ?? row.phase).toLowerCase()}. Reconcile parts and agency readiness before recording execution.</p>}
    <label className="o-field" style={{ marginTop: 12 }}>Sign-off note<input value={note} maxLength={300} onChange={event => setNote(event.target.value)} placeholder="e.g. repair inspected and signed off"/></label>
    <div className="o-form-actions"><button type="button" className="o-btn ghost" onClick={onClose}>Cancel</button><button type="button" className="o-btn success" disabled={close.isPending || !note.trim() || row.phase !== "in_work"} onClick={() => close.mutate({ id: row.id, note, action: executed ? "verify" : "execute" }, {
      onSuccess: () => { if (!executed) { setExecuted(true); setNote(""); toast({ tone: "success", title: "Execution recorded", body: "Record a separate verification note to close this work." }); } else { toast({ tone: "success", title: "Agency work verified", body: "Remaining restrictions are rechecked." }); onClose(); } },
      onError: error => toast({ tone: "error", title: "Not recorded", body: error.message }),
    })}>{executed ? "Verify outcome and close work" : "Record execution completed"}</button></div>
  </Modal>;
}

function ScheduledTable({ orders, parts, allowed }: { orders: PlannedWorkOrder[]; parts: Map<string, PartRequest>; allowed: boolean }) {
  const update = useUpdateWorkOrder();
  const toast = useToast();
  const act = (order: PlannedWorkOrder, status: "in_progress" | "completed" | "cancelled") => update.mutate({ id: order.id, status, expected_version: order.version }, {
    onSuccess: () => toast({ tone: "success", title: `${order.id}: ${status === "in_progress" ? "work started" : status}` }),
    onError: error => toast({ tone: "error", title: "Update failed", body: error.message }),
  });
  return <div className="o-table-wrap"><table className="o-table">
    <thead><tr><th>Aircraft · work</th><th>Bay</th><th>Starts</th><th>Part</th><th>Status</th><th/></tr></thead>
    <tbody>{orders.map(order => { const part = parts.get(order.id); const ready = !part || ["reserved", "received"].includes(part.status); return <tr key={order.id}>
      <td><Link className="o-strong" to={order.component_id ? `/health/${order.component_id}` : `/aircraft/${order.aircraft}`}>{order.aircraft}</Link> · {order.title.replace("Planned replacement: ", "Replace ")}<small><Link to={`/maintenance/work/${order.id}`}>{order.id}</Link></small></td>
      <td>{order.agency_id.replace("AG-", "")}</td>
      <td>{longDate(order.planned_start)}<small>{order.duration_days} days</small></td>
      <td>{part ? <><Pill tone={ready ? "ok" : part.at_risk ? "short" : "contested"}>{partsLabel[part.status]}</Pill>{part.eta && <small>arrives {shortDate(part.eta)}</small>}</> : <span className="o-muted">—</span>}</td>
      <td><Pill tone={order.status === "in_progress" ? "accent" : "scheduled"}>{order.status === "in_progress" ? "In progress" : order.status === "awaiting_verification" ? "Awaiting verification" : order.status === "approved" && ready ? "Ready · approved" : order.status === "planned" ? "Tentative · not approved" : "Blocked"}</Pill></td>
      <td>{allowed && <div className="o-row-actions">{order.status === "approved" && <button type="button" className="o-btn sm ghost" disabled={!ready} title={ready ? undefined : "Waiting for logistics to secure the part"} onClick={() => act(order, "in_progress")}>Start</button>}{order.status === "in_progress" && <button type="button" className="o-btn sm success" onClick={() => act(order, "completed")}>Complete</button>}<button type="button" className="o-btn sm ghost" onClick={() => act(order, "cancelled")}>Cancel</button></div>}</td>
    </tr>; })}</tbody>
  </table></div>;
}

/* 3. Logistics ----------------------------------------------------------------------------------- */
export function PartsPage() {
  const [params] = useSearchParams();
  const aircraftScope = params.get("aircraft"), componentScope = params.get("component");
  const requests = usePartRequests();
  const inventory = useInventory();
  const engine = useEngine();
  const { role } = useRole();
  const { asOf } = useAsOf();
  const [ordering, setOrdering] = useState<PartRequest | null>(null);
  const update = useUpdatePartRequest();
  const toast = useToast();
  const today = engine.data?.replay_to ?? "";
  const rows = useMemo(() => [...(requests.data ?? [])].filter(r => (!aircraftScope || r.aircraft === aircraftScope) && (!componentScope || r.component_id === componentScope)).sort((a, b) => Number(b.at_risk) - Number(a.at_risk) || Number(b.status === "open") - Number(a.status === "open") || a.needed_by.localeCompare(b.needed_by)), [requests.data, aircraftScope, componentScope]);
  const shortfalls = (inventory.data ?? []).filter(item => ["short", "at_risk"].includes(item.status));
  const allowed = can.secureParts(role.id) && !asOf;
  const act = (request: PartRequest, status: "reserved" | "received" | "cancelled") => update.mutate({ id: request.id, status, expected_version: request.version }, {
    onSuccess: () => toast({ tone: "success", title: `${request.part}: ${partsLabel[status].toLowerCase()}` }),
    onError: error => toast({ tone: "error", title: "Not recorded", body: error.message }),
  });
  return <>
    <NotYourStep owner="logistics"/>
    <Card title="Parts needed for scheduled work" subtitle="Created automatically when a supervisor schedules work. Red = cannot arrive by the needed-by date.">
      <Query query={requests} rows={4}>{() => rows.length === 0 ? <EmptyState title="No parts requests" icon="box">Requests appear when supervisors schedule work.</EmptyState> :
        <div className="o-table-wrap"><table className="o-table">
          <thead><tr><th>Needed by</th><th>For</th><th>Part</th><th>Status</th><th>Supply</th><th/></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id} className={r.at_risk ? "o-row-risk" : ""}>
            <td><strong>{longDate(r.needed_by)}</strong><small>{today ? `in ${dayDiff(today, r.needed_by)} days` : ""}</small></td>
            <td><Link className="o-strong" to={r.component_id ? `/health/${r.component_id}` : `/aircraft/${r.aircraft}`}>{r.aircraft}</Link> · {r.component_name}<small><Link to={`/maintenance/work/${r.work_order_id}`}>{r.work_order_id}</Link> · <Link to={`/spares/requests/${r.id}`}>{r.id}</Link></small></td>
            <td><Link className="o-link o-mono o-strong" to={`/spares?view=inventory&part=${encodeURIComponent(r.part)}`}>{r.part}</Link><small>× {r.quantity}</small></td>
            <td><Pill tone={["reserved", "received"].includes(r.status) ? "ok" : r.at_risk ? "short" : "contested"}>{partsLabel[r.status]}</Pill>{r.eta && <small>ETA {shortDate(r.eta)}{r.at_risk ? " — late" : ""}</small>}</td>
            <td><small className="o-plain">{r.available_now} usable in stock · {r.lead_time_days}-day lead time</small><small className="o-plain">New order arrives ~{shortDate(r.earliest_order_arrival)}</small></td>
            <td>{allowed && <div className="o-row-actions">
              {r.status === "open" && r.available_now > 0 && <button type="button" className="o-btn sm" onClick={() => act(r, "reserved")}>Reserve from stock</button>}
              {r.status === "open" && <button type="button" className={`o-btn sm${r.available_now > 0 ? " ghost" : ""}`} onClick={() => setOrdering(r)}>Order</button>}
              {r.status === "ordered" && <Link className="o-btn sm ghost" to={`/spares?view=deliveries&request=${r.id}`}>Record receipt</Link>}
              {["open", "ordered", "reserved"].includes(r.status) && <button type="button" className="o-btn sm ghost" disabled={update.isPending} onClick={() => act(r, "cancelled")}>Cancel request</button>}
            </div>}</td>
          </tr>)}</tbody>
        </table></div>}</Query>
    </Card>
    <Card title="Running short in the next 30 days" subtitle="Forecast from predicted failures and scheduled replacements across the fleet, before any work is scheduled.">
      <Query query={inventory} rows={3}>{() => shortfalls.length === 0 ? <EmptyState title="No forecast shortfalls"/> :
        <ul className="o-shortfalls">{shortfalls.map(item => <li key={item.part_number}>
          <Pill tone={item.status}>{item.status === "short" ? "Short" : "At risk"}</Pill>
          <div><strong><span className="o-mono">{item.part_number}</span> · {item.description}</strong><p>About {num(item.demand["30"].expected, 1)} needed in 30 days, {item.available} usable in stock{item.on_order ? `, ${item.on_order} on order` : ""}. Lead time {item.lead_time_days} days · {pct(item.demand["30"].shortfall_probability)} chance of running out.</p></div>
        </li>)}</ul>}</Query>
    </Card>
    {ordering && <OrderDialog request={ordering} onClose={() => setOrdering(null)}/>}
  </>;
}

function OrderDialog({ request, onClose }: { request: PartRequest; onClose: () => void }) {
  const update = useUpdatePartRequest();
  const toast = useToast();
  const [eta, setEta] = useState(request.earliest_order_arrival);
  const [note, setNote] = useState("");
  const late = eta > request.needed_by;
  return <Modal open onOpenChange={value => !value && onClose()} title={`Order ${request.part} for ${request.aircraft}`}>
    <form onSubmit={event => { event.preventDefault(); update.mutate({ id: request.id, status: "ordered", eta, note, expected_version: request.version }, {
      onSuccess: () => { toast({ tone: "success", title: "Order recorded", body: `ETA ${longDate(eta)}. The availability forecast now includes this receipt.` }); onClose(); },
      onError: error => toast({ tone: "error", title: "Order not recorded", body: error.message }),
    }); }}>
      <div className="o-form-grid">
        <label className="o-field">Expected arrival<input type="date" required value={eta} onChange={event => setEta(event.target.value)}/><small>{request.additive_printable ? <>Project Forge: printable part, print route gives {longDate(request.earliest_order_arrival)}</> : <>Standard lead time gives {longDate(request.earliest_order_arrival)}</>}</small></label>
        <label className="o-field">Note<input value={note} maxLength={300} onChange={event => setNote(event.target.value)} placeholder="e.g. expedited from depot"/></label>
      </div>
      {late && <p className="o-warn-line"><Icon name="warning" size={14}/>Arrives after the work is due to start ({longDate(request.needed_by)}). Tell the supervisor so the job can be moved.</p>}
      <div className="o-form-actions"><button type="button" className="o-btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="o-btn" disabled={update.isPending}>Record order</button></div>
    </form>
  </Modal>;
}

/* 4. Fleet manager ------------------------------------------------------------------------------- */
export function FleetGroundingDetails() {
  const orders = useWorkOrders();
  const aircraft = useAircraftList();
  const navigate = useNavigate();
  type Recorded = { id: string; aircraft: string; finding: string; phase: string; promised: string; opened: string; component_id: string | null; component_name: string };
  const down = useMemo(() => {
    const byAircraft = new Map<string, Recorded>();
    for (const row of (orders.data?.recorded ?? []) as Recorded[]) if ((row as { status?: string }).status === "open" && !byAircraft.has(row.aircraft)) byAircraft.set(row.aircraft, row);
    for (const work of orders.data?.planned ?? []) if (work.status === "in_progress" && !byAircraft.has(work.aircraft)) {
      byAircraft.set(work.aircraft, { id: work.id, aircraft: work.aircraft, finding: "planned replacement", phase: "planned_work", promised: addDays(work.planned_start, Math.ceil(work.duration_days)), opened: work.planned_start, component_id: work.component_id, component_name: work.title.replace("Planned replacement: ", "") });
    }
    return [...byAircraft.values()];
  }, [orders.data]);
  const atRisk = (aircraft.data ?? []).filter(row => row.availability_state === "available" && (row.top_priority === "P1" || row.top_priority === "P2"));
  return <div id="grounded" className="o-screen">
    <div className="o-grid o-cols-2">
      <Card title="Why aircraft are on the ground" subtitle="Agency repairs and planned maintenance in progress. Updated as supervisors start and close work.">
        <Query query={orders} rows={4}>{() => down.length === 0 ? <EmptyState title="No grounding work recorded"/> :
          <ul className="o-down-list">{down.map(row => <li key={row.id}>
            <Link to={`/aircraft/${row.aircraft}`} className="o-strong">{row.aircraft}</Link>
            <div><p>{row.component_name} · {row.finding}</p><small>since {shortDate(row.opened)} · expected back {shortDate(row.promised)}</small></div>
            <Pill tone={row.phase === "awaiting_spares" ? "degraded" : row.phase === "awaiting_agency" ? "watch" : row.phase === "planned_work" ? "maint" : "critical"}>{row.phase === "in_work" ? "In repair" : row.phase === "planned_work" ? "Planned maintenance" : availabilityLabel[row.phase] ?? row.phase}</Pill>
          </li>)}</ul>}</Query>
      </Card>
      <Card title="Aircraft flying with urgent findings" subtitle="Available today, but a P1/P2 finding could ground them">
        <Query query={aircraft} rows={4}>{() => atRisk.length === 0 ? <EmptyState title="No urgent findings on available aircraft"/> :
          <ul className="o-down-list">{atRisk.slice(0, 8).map(row => <li key={row.id} className="clickable" onClick={() => navigate(`/aircraft/${row.id}`)}>
            <Link to={`/aircraft/${row.id}`} className="o-strong">{row.id}</Link>
            <div><p>{row.open_advisories} open finding{row.open_advisories === 1 ? "" : "s"}{row.driver ? ` · worst: ${row.driver.replace(`${row.id}-`, "")}` : ""}</p><small>health index {row.health_index.toFixed(0)}</small></div>
            <PriorityBadge level={row.top_priority ?? "P4"}/>
          </li>)}{atRisk.length > 8 && <li className="o-more"><Link className="o-link" to="/aircraft">All {atRisk.length} aircraft<Icon name="arrow" size={13}/></Link></li>}</ul>}</Query>
      </Card>
    </div>
  </div>;
}

/* Welcome: choose a role ------------------------------------------------------------------------- */
export function WelcomePage() {
  const { setRole, canSwitch, role } = useRole();
  const navigate = useNavigate();
  return <div className="o-welcome">
    <header>
      <span className="o-eyebrow">PS 26249 · Predictive maintenance & fleet availability</span>
      <h1>From a finding to recorded maintenance</h1>
      <p>Inspect the synthetic fleet, review a finding and its evidence, schedule confirmed work, then secure its parts and follow the recorded outcome. Each team uses the same connected workspace.</p>
    </header>
    <ol className="o-welcome-flow">
      <li><span>0</span><div><strong>The system flags a component</strong><small>Sensor trends, failure risk and remaining life</small></div></li>
      {roles.map((r, index) => <li key={r.id}><span>{index + 1}</span><div><strong>{r.id === "engineer" ? "Engineer reviews the evidence" : r.id === "supervisor" ? "Supervisor schedules the work" : r.id === "logistics" ? "Logistics secures the part" : "Fleet manager sees availability"}</strong><small>{r.label}</small></div></li>)}
    </ol>
    <h2>{canSwitch ? "Choose your team’s starting point" : `You are signed in as ${role.label.toLowerCase()}`}</h2>
    <div className="o-role-cards">{roles.map(r => <button type="button" key={r.id} className={`o-role-card${role.id === r.id ? " on" : ""}`} disabled={!canSwitch && role.id !== r.id} onClick={() => { setRole(r.id); navigate(r.home); }}>
      <span className="o-role-icon"><Icon name={r.icon} size={22}/></span>
      <strong>{r.label}</strong>
      <em>“{r.question}”</em>
      <ul>{r.does.map(item => <li key={item}>{item}</li>)}</ul>
      <span className="o-role-go">Start as {r.short.toLowerCase()}<Icon name="arrow" size={15}/></span>
    </button>)}</div>
    <p className="o-muted o-small">Fleet data is synthetic. Demo roles change the available actions; signed-in accounts retain their server permissions. Engine research uses its own records and is grouped under Research.</p>
  </div>;
}
