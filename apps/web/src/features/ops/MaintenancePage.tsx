import { useMemo, useState } from "react";
import { ExplainWithAI } from "../assistant/AssistantPanel";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { addDays, dayDiff, useAsOf } from "./AsOf";
import { useRescheduleWorkOrder, useSchedule, useWorkOrders, type PlannedWorkOrder, type Schedule } from "./api";
import { BayFlow } from "./BayFlow";
import { availabilityLabel, longDate, num, pct, shortDate } from "./format";
import { can, useRole } from "./roles";
import { Card, EmptyState, Kpi, Modal, Pill, Query, Segmented, useToast } from "./ui";

type Bar = { id: string; agency: string; lane: number | null; aircraft: string; label: string; kind: string; status: string; waiting_for: string | null; start: string; end: string; projected: boolean; component_id: string | null };
type Due = { id: string; aircraft: string; task: string; due_date: string; overdue: boolean; kind: string };

export function MaintenancePage() {
  const orders = useWorkOrders();
  const schedule = useSchedule();
  const k = orders.data?.kpis as { backlog: { open_work_orders: number; man_hours: number; planned_from_advisories: number }; mean_turnaround_days: number; on_time_rate: number; closed_last_120_days: number } | undefined;
  return <>
    <div className="o-kpis">
      <Kpi label="Open backlog" icon="wrench" tone="degraded" value={k?.backlog.open_work_orders ?? null} format={v => v.toFixed(0)} detail={k ? `≈ ${num(k.backlog.man_hours)} man-hours outstanding` : undefined}/>
      <Kpi label="Planned from advisories" icon="calendar" tone="maint" value={k?.backlog.planned_from_advisories ?? null} format={v => v.toFixed(0)} detail="Predictive work orders"/>
      <Kpi label="Mean turnaround" icon="clock" tone="accent" value={k?.mean_turnaround_days ?? null} format={v => `${v.toFixed(1)} d`} detail={k ? `${k.closed_last_120_days} work orders closed in 120 days` : undefined}/>
      <Kpi label="On-time rate" icon="check" tone="healthy" value={k?.on_time_rate ?? null} format={v => pct(v)} detail="Closed by the agency’s promised date"/>
    </div>
    <Card title="Bay flow · now" subtitle="Each panel is a bay; lit cells show how far its job has run. Lines lead to the aircraft in the bay; amber lines are aircraft queued for a bay or a part. Click a bay for details.">
      <Query query={schedule} rows={8}>{data => <BayFlow data={data}/>}</Query>
    </Card>
    <Card title="Bay timeline · next 14 days" subtitle="One row per bay. Blue bars are planned from advisories; supervisors can drag them to another bay or day.">
      <Query query={schedule} rows={8}>{data => <Gantt data={data}/>}</Query>
    </Card>
  </>;
}

export function WorkRegister() { return <><PlannedCard/><RecordedCard/></>; }

const WINDOW_DAYS = 15; // T0 … T+14

/** Screen 5 Gantt: bays × next 14 days. Planned jobs can be dragged to another bay or day;
 *  overlap with the same aircraft's due inspection is reported as downtime saved by bundling. */
function Gantt({ data }: { data: Schedule }) {
  const navigate = useNavigate();
  const { role } = useRole();
  const { asOf } = useAsOf();
  const orders = useWorkOrders();
  const reschedule = useRescheduleWorkOrder();
  const toast = useToast();
  const [message, setMessage] = useState<{ tone: "ok" | "info" | "error"; text: string } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hover, setHover] = useState<{ lane: string; day: number } | null>(null);
  const [editing, setEditing] = useState<PlannedWorkOrder | null>(null);
  const t0 = data.today;
  const canMove = can.schedule(role.id) && !asOf;
  const at = (iso: string) => Math.max(0, Math.min(WINDOW_DAYS, dayDiff(t0, iso)));
  const left = (iso: string) => `${(at(iso) / WINDOW_DAYS) * 100}%`;
  const width = (start: string, end: string) => `${Math.max(0.6, ((Math.min(WINDOW_DAYS, dayDiff(t0, end) + 1) - at(start)) / WINDOW_DAYS) * 100)}%`;
  const visible = (bar: Bar) => dayDiff(t0, bar.end) >= 0 && dayDiff(t0, bar.start) < WINDOW_DAYS;
  const bars = (data.bars as Bar[]).filter(visible);
  const planned = new Map((orders.data?.planned ?? []).map(w => [w.id, w]));
  const due = (data.tasks_due as Due[]).filter(task => task.kind === "inspection" && dayDiff(t0, task.due_date) < WINDOW_DAYS);
  const inspectionDays = 3;
  const agencies = data.agencies as { id: string; name: string; bays: number; lanes: number }[];
  const lanes = agencies.flatMap(agency => Array.from({ length: agency.lanes }, (_, lane) => ({ agency: agency.id, lane, label: `${agency.id.replace("AG-", "")} ${lane + 1}`, over: lane >= agency.bays })));
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(t0, i));

  const dropTo = (agency: string, day: number, workId: string) => {
    const work = planned.get(workId);
    if (!work) return;
    const start = addDays(t0, day);
    const length = Math.max(1, Math.ceil(work.duration_days));
    reschedule.mutate({ id: work.id, planned_start: start, agency_id: agency, expected_version: work.version }, {
      onSuccess: result => {
        const inspection = due.find(task => task.aircraft === work.aircraft);
        let text = `${work.aircraft} moved to ${agency.replace("AG-", "")} on ${longDate(start)}.`;
        if (inspection) {
          const insStart = inspection.overdue ? t0 : inspection.due_date;
          const overlap = Math.max(0, Math.min(dayDiff(t0, start) + length, dayDiff(t0, insStart) + inspectionDays) - Math.max(dayDiff(t0, start), dayDiff(t0, insStart)));
          const saved = Math.min(overlap, work.duration_days, inspectionDays);
          if (saved > 0) text = `Task bundled with ${work.aircraft}'s periodic inspection. Saved: ${saved.toFixed(1)} days downtime (overlapping groundings).`;
        }
        const impact = result.impact as { availability_pct_points?: number };
        if (impact.availability_pct_points !== undefined) text += ` Simulated fleet availability ${impact.availability_pct_points >= 0 ? "+" : ""}${impact.availability_pct_points.toFixed(2)} pts vs the rest of the plan.`;
        setMessage({ tone: text.startsWith("Task bundled") ? "ok" : "info", text });
      },
      onError: error => { setMessage({ tone: "error", text: error.message }); toast({ tone: "error", title: "Could not move work", body: error.message }); },
    });
  };

  return <div className="o-gantt2">
    {message && <div className={`o-gantt-msg ${message.tone}`} role="status"><Icon name={message.tone === "ok" ? "check" : message.tone === "error" ? "warning" : "info"} size={15}/>{message.text}<button type="button" className="o-icon-btn" aria-label="Dismiss" onClick={() => setMessage(null)}><Icon name="close" size={13}/></button></div>}
    <div className="o-g-row o-g-scale"><span className="o-g-label">BAY</span><div className="o-g-track">{days.map((day, i) => <span key={day} className={i === 0 ? "today" : ""} style={{ left: `${(i / WINDOW_DAYS) * 100}%`, width: `${100 / WINDOW_DAYS}%` }}>{i === 0 ? "T0" : shortDate(day)}</span>)}</div></div>
    <div className="o-g-row o-g-duerow"><span className="o-g-label">INSPECTIONS DUE</span><div className="o-g-track">
      {due.map(task => <Link key={task.id} to={`/aircraft/${task.aircraft}`} className={`o-g-due${task.overdue ? " overdue" : ""}`} style={{ left: left(task.overdue ? t0 : task.due_date), width: width(task.overdue ? t0 : task.due_date, addDays(task.overdue ? t0 : task.due_date, inspectionDays - 1)) }} title={`${task.aircraft}: ${task.task} — ${task.overdue ? "overdue" : longDate(task.due_date)}`}>{task.aircraft} INSP{task.overdue ? " · OVERDUE" : ""}</Link>)}
    </div></div>
    {lanes.map(lane => <div key={`${lane.agency}-${lane.lane}`} className={`o-g-row${lane.over ? " over" : ""}`}>
      <span className="o-g-label">{lane.label}{lane.over && <small>OVER CAPACITY</small>}</span>
      <div className={`o-g-track${hover?.lane === lane.label ? " drop" : ""}`}
        onDragOver={event => { if (!dragging) return; event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); setHover({ lane: lane.label, day: Math.max(0, Math.min(WINDOW_DAYS - 1, Math.floor(((event.clientX - box.left) / box.width) * WINDOW_DAYS))) }); }}
        onDragLeave={() => setHover(null)}
        onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); const box = event.currentTarget.getBoundingClientRect(); const day = Math.max(0, Math.min(WINDOW_DAYS - 1, Math.floor(((event.clientX - box.left) / box.width) * WINDOW_DAYS))); setHover(null); setDragging(null); dropTo(lane.agency, day, id); }}>
        {hover?.lane === lane.label && <i className="o-g-ghost" style={{ left: `${(hover.day / WINDOW_DAYS) * 100}%`, width: `${(Math.ceil(planned.get(dragging ?? "")?.duration_days ?? 1) / WINDOW_DAYS) * 100}%` }}/>}
        {bars.filter(bar => bar.agency === lane.agency && bar.lane === lane.lane).map(bar => {
          const work = planned.get(bar.id);
          const movable = canMove && work?.status === "planned";
          return <button type="button" key={bar.id} draggable={movable}
            onDragStart={event => { event.dataTransfer.setData("text/plain", bar.id); event.dataTransfer.effectAllowed = "move"; setDragging(bar.id); }}
            onDragEnd={() => { setDragging(null); setHover(null); }}
            onClick={() => movable && work ? setEditing(work) : bar.component_id ? navigate(`/health/${bar.component_id}`) : navigate(`/aircraft/${bar.aircraft}`)}
            className={`o-g-bar k-${bar.kind} s-${bar.status}${movable ? " movable" : ""}${dragging === bar.id ? " dragging" : ""}`}
            style={{ left: left(bar.start), width: width(bar.start, bar.end) }}
            title={`${bar.id} · ${bar.aircraft} · ${bar.label} · ${shortDate(bar.start)}–${shortDate(bar.end)}${movable ? " — drag to another bay or day, or click to edit" : ""}`}>
            <span>{bar.aircraft} {bar.kind === "predictive" ? bar.label.replace("Planned replacement: ", "") + " replace" : bar.label}</span>
          </button>;
        })}
      </div>
    </div>)}
    {bars.some(bar => bar.lane === null) && <div className="o-g-row waiting"><span className="o-g-label">WAITING</span><div className="o-g-track">{bars.filter(bar => bar.lane === null).map((bar, index) => <button type="button" key={bar.id} className="o-g-bar k-waiting" style={{ left: left(bar.start), width: width(bar.start, bar.end), top: 3 + (index % 2) * 13 }} onClick={() => bar.component_id ? navigate(`/health/${bar.component_id}`) : navigate(`/aircraft/${bar.aircraft}`)} title={`${bar.id} · ${bar.aircraft} waiting for ${bar.waiting_for}`}><span>{bar.aircraft} waiting · {bar.waiting_for}</span></button>)}</div></div>}
    <div className="o-legend" style={{ marginTop: 10 }}><span><i style={{ background: "var(--o-accent-2)" }}/>Planned from advisory{canMove ? " (drag to move)" : ""}</span><span><i style={{ background: "var(--o-critical)" }}/>Unscheduled repair</span><span><i style={{ background: "var(--o-text-3)" }}/>Scheduled / inspection</span><span><i className="k-waiting"/>Waiting for spare or bay</span><span><i style={{ border: "1px dashed var(--o-watch)" }}/>Inspection due</span></div>
    {editing && <RescheduleDialog work={editing} agencies={agencies} t0={t0} onClose={() => setEditing(null)} onSave={(agency, start) => { const day = dayDiff(t0, start); setEditing(null); dropTo(agency, day, editing.id); }}/>}
  </div>;
}

function RescheduleDialog({ work, agencies, t0, onClose, onSave }: { work: PlannedWorkOrder; agencies: { id: string; name: string }[]; t0: string; onClose: () => void; onSave: (agency: string, start: string) => void }) {
  const [start, setStart] = useState(work.planned_start);
  const [agency, setAgency] = useState(work.agency_id);
  return <Modal open onOpenChange={value => !value && onClose()} title={`Move ${work.id} · ${work.aircraft}`}>
    <div className="o-form-grid">
      <label className="o-field">Start<input type="date" value={start} min={t0} max={addDays(t0, WINDOW_DAYS - 1)} onChange={event => setStart(event.target.value)}/></label>
      <label className="o-field">Agency<select value={agency} onChange={event => setAgency(event.target.value)}>{agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    </div>
    <p className="o-muted o-small" style={{ marginTop: 10 }}>Same as dragging the bar on the timeline. The availability impact is re-simulated.</p>
    <div className="o-form-actions"><button type="button" className="o-btn ghost" onClick={onClose}>Cancel</button><button type="button" className="o-btn" onClick={() => onSave(agency, start)}>Move work</button></div>
  </Modal>;
}

function PlannedCard() {
  const orders = useWorkOrders();
  return <Card title="Planned work orders" subtitle="Created from advisories. Each one reserves a spare and is included in every new simulation baseline.">
    <Query query={orders} rows={4}>{data => data.planned.length === 0 ? <EmptyState title="No planned work yet" icon="calendar">Schedule an advisory from the risk queue or a component page.</EmptyState> :
      <div className="o-table-wrap"><table className="o-table">
        <thead><tr><th>Work order</th><th>Aircraft · task</th><th>Agency</th><th>Start</th><th className="num">Duration</th><th>Simulated impact (30 d)</th><th>Status</th><th/></tr></thead>
        <tbody>{data.planned.map(order => { const impact = order.impact as { availability_pct_points?: number; aircraft_days_lost?: number; spare_waits?: boolean }; return <tr key={order.id}>
          <td><span className="o-mono o-strong">{order.id}</span>{order.priority && <small>{order.priority} advisory</small>}</td>
          <td><Link className="o-strong" to={order.component_id ? `/health/${order.component_id}` : `/aircraft/${order.aircraft}`}>{order.aircraft}</Link> · {order.title}<small>{order.notes || order.part}</small>{order.component_id && <ExplainWithAI selection={{ aircraft_id: order.aircraft, component_id: order.component_id, part_number: order.part ?? undefined }} question="Compare starting this replacement now, in 7 or in 14 days." label="Compare with AI"/>}</td>
          <td>{order.agency_id}</td><td>{longDate(order.planned_start)}</td><td className="num">{order.duration_days} d</td>
          <td><span className={(impact.availability_pct_points ?? 0) >= 0 ? "o-tone-healthy" : "o-tone-critical"}>{(impact.availability_pct_points ?? 0) >= 0 ? "+" : ""}{(impact.availability_pct_points ?? 0).toFixed(2)} pts</span><small>{(impact.aircraft_days_lost ?? 0) > 0 ? "+" : ""}{(impact.aircraft_days_lost ?? 0).toFixed(1)} aircraft-days{impact.spare_waits ? " · waits for spare" : ""}</small></td>
          <td><Pill tone={order.status === "planned" ? "scheduled" : order.status === "in_progress" ? "accent" : order.status}>{order.status.replace("_", " ")}</Pill></td>
          <td><Link className="o-link" to={`/maintenance?aircraft=${encodeURIComponent(order.aircraft)}`}>Manage work</Link></td>
        </tr>; })}</tbody>
      </table></div>}</Query>
  </Card>;
}

function RecordedCard() {
  const orders = useWorkOrders();
  const [view, setView] = useState<"open" | "closed" | "late">("open");
  type Row = { id: string; aircraft: string; component_id: string | null; kind: string; agency_id: string; finding: string; status: string; phase: string; opened: string; promised: string; completed: string | null; turnaround_days: number | null; late: boolean; delay_reason: string | null; spare_wait_days: number; queue_wait_days: number };
  const rows = useMemo(() => ((orders.data?.recorded ?? []) as Row[]).filter(row => view === "open" ? row.status === "open" : view === "closed" ? row.status === "closed" : row.late), [orders.data, view]);
  return <Card title="Recorded work orders" subtitle="From the agency reports source: promised versus actual dates and the recorded delay cause"
    actions={<Segmented label="Work order view" value={view} onChange={setView} options={[["open", "Open"], ["closed", "Closed (120 d)"], ["late", "Late"]] as const}/>}>
    <Query query={orders} rows={6}>{() => rows.length === 0 ? <EmptyState title="Nothing in this view"/> : <div className="o-table-wrap o-table-scroll"><table className="o-table">
      <thead><tr><th>Work order</th><th>Aircraft · finding</th><th>Type</th><th>Agency</th><th>Opened</th><th>Promised</th><th>Completed</th><th>Delay</th></tr></thead>
      <tbody>{rows.slice(0, 80).map(row => <tr key={row.id}>
        <td className="o-mono o-strong">{row.id}</td>
        <td>{row.component_id ? <Link className="o-strong" to={`/health/${row.component_id}`}>{row.aircraft}</Link> : <Link className="o-strong" to={`/aircraft/${row.aircraft}`}>{row.aircraft}</Link>} · {row.finding}<small>{row.component_id?.replace(`${row.aircraft}-`, "") ?? "Whole aircraft"}</small></td>
        <td><Pill tone={row.kind === "unscheduled" ? "critical" : row.kind === "inspection" ? "accent" : "maint"}>{row.kind}</Pill></td>
        <td>{row.agency_id}</td><td>{shortDate(row.opened)}</td><td>{shortDate(row.promised)}</td>
        <td>{row.completed ? <>{shortDate(row.completed)}<small>{row.turnaround_days} d turnaround</small></> : <Pill tone="watch">{availabilityLabel[row.phase] ?? row.phase.replace("_", " ")}</Pill>}</td>
        <td>{row.delay_reason ? <span className={row.late ? "o-tone-critical" : ""}>{availabilityLabel[row.delay_reason] ?? row.delay_reason.replace("_", " ")}<small>{row.spare_wait_days ? `${row.spare_wait_days} d spare` : ""}{row.spare_wait_days && row.queue_wait_days ? " · " : ""}{row.queue_wait_days ? `${row.queue_wait_days} d queue` : ""}</small></span> : <span className="o-muted">—</span>}</td>
      </tr>)}</tbody>
    </table></div>}</Query>
  </Card>;
}
