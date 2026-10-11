import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../shared/ui/Icon";
import { addDays, useAsOf } from "./AsOf";
import { useCreateWorkOrder, useEngine, useUpdateAdvisory, type Advisory, type PlannedWorkOrder } from "./api";
import { actionTone, factorLabel, longDate, num, pct, rulText, signed } from "./format";
import { can, partsLabel, statusLabel, useRole } from "./roles";
import { Modal, Pill, PriorityBadge, RangeBar, StateBadge, useToast } from "./ui";


export function AdvisoryCompact({ advisory: a, onOpen }: { advisory: Advisory; onOpen?: () => void }) {
  const body = <>
    <div className="o-adv-head"><PriorityBadge level={a.priority.level}/><strong>{a.aircraft} · {a.component_name}</strong><StateBadge state={a.health_state} compact/>{a.status !== "proposed" && <Pill tone={a.status}>{statusLabel[a.status]}</Pill>}</div>
    <p>{a.explanation}</p>
    <div className="o-adv-metrics"><span>Risk 14 d <b>{pct(a.risk_14d)}</b></span><span>RUL <b>{rulText(a.rul_days)}</b></span><span className={`o-tone-${actionTone[a.action.code]}`}><b>{a.action.label}</b></span><SparePill spare={a.spare}/></div>
  </>;
  return onOpen ? <button type="button" className="o-adv-card" onClick={onOpen}>{body}</button> : <Link className="o-adv-card" to={`/health/${a.component_id}`}>{body}</Link>;
}

export function AdvisoryPanel({ advisory: a, replay, showActions = true }: { advisory: Advisory; replay: boolean; showActions?: boolean }) {
  const maxPoints = Math.max(...a.priority.factors.map(f => f.points), 0.01);
  const maxAttribution = Math.max(...a.attribution.map(item => Math.abs(item.contribution)), 0.01);
  const impactNow = Math.abs(a.availability_impact.act_now_aircraft_days), impactRtf = Math.abs(a.availability_impact.run_to_failure_expected_aircraft_days);
  return <div className="o-advisory">
    <div className="o-advisory-top">
      <div><span className="o-eyebrow">Maintenance advisory</span><h3>{a.aircraft} · {a.system_name} · {a.component_name}</h3><small className="o-mono">{a.id} · serial {a.serial}</small></div>
      <div className="o-advisory-badges"><PriorityBadge level={a.priority.level}/><Pill tone={a.status}>{statusLabel[a.status]}</Pill></div>
    </div>
    <div className={`o-action-banner tone-${actionTone[a.action.code]}`}><Icon name={a.action.code === "ground_now" ? "warning" : a.action.code === "monitor" ? "check" : "wrench"} size={18}/><div><strong>{a.action.label}</strong><span>Recommended action · priority score {a.priority.score.toFixed(2)}</span></div></div>
    <p className="o-advisory-text">{a.explanation}</p>
    {showActions && <AdvisoryActions advisory={a} replay={replay}/>}
    <dl className="o-adv-grid">
      <div><dt>Health</dt><dd><StateBadge state={a.health_state} compact/> {a.health_index.toFixed(0)}/100 <small>{signed(a.health_index - a.health_index_20d_ago, 0)} in 20 d</small></dd></div>
      <div><dt>Failure risk</dt><dd>{pct(a.risk_14d)} in 14 d <small>{pct(a.risk_30d)} in 30 d · {a.risk_band}</small></dd></div>
      <div><dt>Remaining life</dt><dd>{rulText(a.rul_days)} <RangeBar {...a.rul_days}/></dd></div>
      <div><dt>Anomaly</dt><dd>{a.anomaly_sustained ? <Pill tone="critical" icon="activity">Sustained</Pill> : "Not sustained"} <small>{pct(a.anomaly_score, 1)} percentile</small></dd></div>
    </dl>
    <details className="o-adv-details"><summary>Show model details — why it was flagged and how it was prioritised</summary>
    <div className="o-adv-section"><h4>Why it is flagged</h4>
      <div className="o-bars">{a.attribution.slice(0, 5).map(item => <div key={item.factor} className="o-bar-row"><span>{item.label}</span><span className="o-bar-track"><span className={item.contribution >= 0 ? "pos" : "neg"} style={{ width: `${(Math.abs(item.contribution) / maxAttribution) * 100}%` }}/></span><b>{signed(item.contribution, 2)}</b></div>)}</div>
      <small className="o-muted">Occlusion attribution of the risk model’s log-odds: how much each signal group moves the prediction. Describes model behaviour, not confirmed mechanical cause.</small>
      {a.contributing_parameters.length > 0 && <div className="o-param-chips">{a.contributing_parameters.map(p => <span key={p.name} className={Math.abs(p.deviation_sigma) >= 3 ? "hot" : ""}>{p.name} <b>{signed(p.deviation_sigma, 1, "σ")}</b></span>)}</div>}
    </div>
    <div className="o-adv-section"><h4>Priority breakdown <small>transparent rule, not a model</small></h4>
      <div className="o-bars">{a.priority.factors.map(f => <div key={f.name} className="o-bar-row"><span>{factorLabel[f.name] ?? f.name} <small>×{f.weight}</small></span><span className="o-bar-track"><span className="accent" style={{ width: `${(f.points / maxPoints) * 100}%` }}/></span><b>{f.points.toFixed(2)}</b></div>)}</div>
    </div>
    </details>
    <div className="o-adv-section o-adv-two">
      <div><h4>Spares check</h4>
        <div className="o-spare-box"><div><strong>{a.spare.part_number}</strong><SparePill spare={a.spare} short/></div>
          <dl className="o-kv"><dt>On hand / reserved</dt><dd>{a.spare.on_hand} / {a.spare.reserved}</dd><dt>On order</dt><dd>{a.spare.on_order}{a.spare.next_receipt ? ` · ${longDate(a.spare.next_receipt)}` : ""}</dd><dt>Lead time</dt><dd>{a.spare.status === "additive_print" ? `${a.spare.lead_time_days} day print (supplier ${a.spare.supplier_lead_time_days} days)` : `${a.spare.lead_time_days} days`}</dd><dt>Fleet demand (30 d)</dt><dd>{a.spare.fleet_demand_30d} · queue #{a.spare.queue_position}</dd></dl>
          {a.spare.lead_time_exceeds_rul && <p className="o-warn-line"><Icon name="warning" size={14}/>Lead time exceeds the RUL lower bound</p>}
          {a.spare.note && <p className="o-muted o-small">{a.spare.note}</p>}
        </div>
      </div>
      <div><h4>Availability impact</h4>
        <div className="o-impact">
          <div><span>Replace now</span><b>−{num(impactNow, 1)}</b><small>aircraft-days (planned {num(a.downtime.act_now_days, 1)} d incl. waits)</small><i style={{ width: `${Math.min(100, impactNow / Math.max(impactNow, impactRtf, 0.1) * 100)}%` }} className="now"/></div>
          <div><span>Run to failure</span><b>−{num(impactRtf, 1)}</b><small>expected aircraft-days ({num(a.downtime.run_to_failure_days, 1)} d if it fails × {pct(a.risk_30d)} 30-day risk)</small><i style={{ width: `${Math.min(100, impactRtf / Math.max(impactNow, impactRtf, 0.1) * 100)}%` }} className="rtf"/></div>
        </div>
      </div>
    </div>
    <div className={`o-confidence c-${a.confidence.level}`}><Icon name="info" size={16}/><div><strong>Confidence: {a.confidence.level}</strong><ul>{a.confidence.notes.map(note => <li key={note}>{note}</li>)}</ul></div></div>
  </div>;
}

/** Screen 3 advisory card (UI spec §3): the decision-critical facts and two large actions. */
export function AdvisoryCommandCard({ advisory: a, replay }: { advisory: Advisory; replay: boolean }) {
  const { role } = useRole();
  const update = useUpdateAdvisory();
  const toast = useToast();
  const [dismissOpen, setDismissOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const level = a.priority.level;
  const sigma = new Map(a.contributing_parameters.map(p => [p.name, p.deviation_sigma]));
  const drivers = a.attribution.slice(0, 5);
  const maxDriver = Math.max(...drivers.map(d => Math.abs(d.contribution)), 0.01);
  const riskTone = a.risk_14d >= 0.7 ? "crit" : a.risk_14d >= 0.15 ? "warn" : "ok";
  const forge = a.spare.status === "additive_print";
  const spareOk = forge || (a.spare.available >= 1 && a.spare.status !== "short");
  const open = !["completed", "dismissed"].includes(a.status);
  const engineer = can.review(role.id) && !can.schedule(role.id);
  const supervisor = can.schedule(role.id);
  return <section className={`o-command p-${level.toLowerCase()}`} aria-label={`${level} maintenance advisory`}>
    <header><span>{level} MAINTENANCE ADVISORY</span><Pill tone={a.status}>{statusLabel[a.status]}</Pill></header>
    <p className="o-command-target">{a.aircraft} · {a.system_name} · {a.component_name}</p>
    <div className="o-command-action"><Icon name={a.action.code === "ground_now" ? "warning" : "wrench"} size={15}/>{a.action.label}</div>
    <div className="o-command-metric"><span>14-Day Failure Risk:</span><b className={`t-${riskTone}`}>{pct(a.risk_14d)}</b>
      <span className="o-command-bar"><i className={`t-${riskTone}`} style={{ width: `${Math.max(2, a.risk_14d * 100)}%` }}/></span></div>
    <div className="o-command-metric"><span>RUL:</span><b>{a.rul_days.p50 >= 59.5 ? "≥ 60 Days" : `~${a.rul_days.p50.toFixed(0)} Days`}</b><small>(Range {a.rul_days.p10.toFixed(0)}–{a.rul_days.p90 >= 59.5 ? "60+" : a.rul_days.p90.toFixed(0)})</small></div>
    <div className="o-command-section">
      <h4>Risk drivers <small>occlusion attribution of the risk model (SHAP substitute)</small></h4>
      {drivers.map(d => { const s = sigma.get(d.label); return <div key={d.factor} className="o-driver">
        <span>{d.label}{s !== undefined ? ` (${s > 0 ? "+" : ""}${s.toFixed(1)}σ)` : ""}</span>
        <span className="o-driver-track"><i className={d.contribution >= 0 ? "up" : "down"} style={{ width: `${(Math.abs(d.contribution) / maxDriver) * 100}%` }}/></span>
        <b>{d.contribution >= 0 ? "+" : ""}{d.contribution.toFixed(2)}</b>
      </div>; })}
    </div>
    <div className="o-command-section">
      <h4>Spare status</h4>
      <p className="o-command-spare"><span className={spareOk ? "t-ok" : "t-crit"}><Icon name={spareOk ? "check" : "close"} size={15}/></span>P/N <b>{a.spare.part_number}</b> — {a.spare.available > 0 ? `${a.spare.available} in stock` : "none in stock"}{a.spare.reserved ? ` (${a.spare.reserved} reserved)` : ""} · lead time {a.spare.lead_time_days} d</p>
      {forge && <p className="o-forge-tag"><Icon name="printer" size={14}/>[ ADDITIVE PRINT ROUTE · 1 DAY ] supplier lead time {a.spare.supplier_lead_time_days} d bypassed</p>}
      {a.spare.fleet_shortfall && <p className="o-command-warn"><Icon name="warning" size={14}/>Warning: fleet-level shortfall projected{a.spare.shortfall_in_days !== null && a.spare.shortfall_in_days !== undefined ? ` in ${a.spare.shortfall_in_days} days` : ""} — {a.spare.fleet_demand_30d} components may need this part.</p>}
      {a.spare.lead_time_exceeds_rul && <p className="o-command-warn"><Icon name="warning" size={14}/>A new order cannot arrive before the RUL lower bound.</p>}
    </div>
    {replay ? <p className="o-note"><Icon name="history" size={16}/>Replaying a past date: decisions are recorded only at the latest date.</p>
      : open && (engineer || supervisor) ? <div className="o-command-buttons">
        <button type="button" className="o-big-btn ghost" onClick={() => setDismissOpen(true)}>DISMISS</button>
        {supervisor && a.status === "accepted"
          ? <button type="button" className="o-big-btn" onClick={() => setScheduleOpen(true)}>SCHEDULE ({a.downtime.act_now_days.toFixed(1)} Days Downtime)</button>
          : (engineer || supervisor) && a.status === "proposed"
            ? <button type="button" className="o-big-btn" disabled={update.isPending} onClick={() => update.mutate({ id: a.id, status: "accepted", expected_status: a.status }, {
              onSuccess: () => toast({ tone: "success", title: "Finding confirmed", body: "Sent to the maintenance supervisor for scheduling." }),
              onError: error => toast({ tone: "error", title: "Not recorded", body: error.message }),
            })}>CONFIRM FINDING</button>
            : <button type="button" className="o-big-btn" disabled>{statusLabel[a.status].toUpperCase()}</button>}
      </div>
        : <p className="o-note"><Icon name="shield" size={16}/>{open ? "Engineers confirm or dismiss findings; supervisors schedule the work." : `This finding is ${statusLabel[a.status].toLowerCase()}.`}</p>}
    {a.work_order_id && ["scheduled", "completed"].includes(a.status) && <Link className="o-link" to="/maintenance#scheduled-work">Work order {a.work_order_id}{a.parts_status ? ` · ${partsLabel[a.parts_status].toLowerCase()}` : ""}<Icon name="arrow" size={13}/></Link>}
    <details className="o-adv-details"><summary>Full advisory — explanation, priority breakdown, availability impact, confidence</summary>
      <AdvisoryPanel advisory={a} replay={replay} showActions={false}/>
    </details>
    <DismissDialog advisory={a} open={dismissOpen} onOpenChange={setDismissOpen}/>
    <ScheduleDialog open={scheduleOpen} onOpenChange={setScheduleOpen} componentId={a.component_id} advisory={a}/>
  </section>;
}

export function DismissDialog({ advisory: a, open, onOpenChange }: { advisory: Advisory; open: boolean; onOpenChange: (open: boolean) => void }) {
  const update = useUpdateAdvisory();
  const toast = useToast();
  const [reason, setReason] = useState("");
  return <Modal open={open} onOpenChange={onOpenChange} title={`Dismiss finding · ${a.aircraft} ${a.component_name}`}>
    <p className="o-muted o-small">The reason is kept with the finding and used to monitor model quality.</p>
    <label className="o-field" style={{ marginTop: 12 }}>Reason<select value={reason} onChange={event => setReason(event.target.value)}><option value="">Choose a reason…</option><option>Inspected — no defect found</option><option>Sensor fault suspected</option><option>Already covered by scheduled work</option><option>Operational constraint — will re-evaluate</option></select></label>
    <div className="o-form-actions"><button type="button" className="o-btn ghost" onClick={() => onOpenChange(false)}>Cancel</button><button type="button" className="o-btn danger" disabled={!reason || update.isPending} onClick={() => update.mutate({ id: a.id, status: "dismissed", reason, expected_status: a.status }, {
      onSuccess: () => { toast({ tone: "success", title: "Finding dismissed" }); onOpenChange(false); },
      onError: error => toast({ tone: "error", title: "Not recorded", body: error.message }),
    })}>Dismiss finding</button></div>
  </Modal>;
}

/** Actions follow the decision flow: engineers confirm or dismiss, supervisors schedule. */
export function AdvisoryActions({ advisory: a, replay }: { advisory: Advisory; replay: boolean }) {
  const { role } = useRole();
  const update = useUpdateAdvisory();
  const toast = useToast();
  const [dismissOpen, setDismissOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  if (replay) return <p className="o-note"><Icon name="history" size={16}/>Replaying a past date: decisions can only be recorded at the latest engine date.</p>;
  const review = can.review(role.id), schedule = can.schedule(role.id);
  const next = a.status === "proposed" ? "An engineer reviews the evidence and confirms or dismisses this finding."
    : a.status === "accepted" ? "Confirmed. The maintenance supervisor schedules the work next."
      : a.status === "scheduled" ? (a.parts_status === "open" || a.parts_status === "ordered" ? "Scheduled. Logistics is securing the part." : "Scheduled with the part secured.")
        : a.status === "dismissed" ? "Dismissed. It can be reopened if new evidence appears." : "Work completed.";
  return <div className="o-adv-actions">
    <p className="o-next-step"><Icon name="info" size={15}/>{next}</p>
    {review && a.status === "proposed" && <button type="button" className="o-btn" disabled={update.isPending} onClick={() => update.mutate({ id: a.id, status: "accepted", expected_status: a.status }, {
      onSuccess: () => toast({ tone: "success", title: "Finding confirmed", body: "Sent to the maintenance supervisor for scheduling." }),
      onError: error => toast({ tone: "error", title: "Not recorded", body: error.message }),
    })}><Icon name="check" size={15}/>Confirm finding</button>}
    {schedule && a.status === "accepted" && <button type="button" className="o-btn" onClick={() => setScheduleOpen(true)}><Icon name="calendar" size={15}/>Schedule work</button>}
    {review && ["proposed", "accepted", "scheduled"].includes(a.status) && <button type="button" className="o-btn ghost" onClick={() => setDismissOpen(true)}><Icon name="close" size={15}/>Dismiss</button>}
    {review && a.status === "dismissed" && <button type="button" className="o-btn ghost" onClick={() => update.mutate({ id: a.id, status: "proposed", expected_status: a.status })}><Icon name="refresh" size={15}/>Reopen</button>}
    {a.work_order_id && <Link className="o-link" to="/maintenance#scheduled-work">Work order {a.work_order_id}{a.parts_status ? ` · ${partsLabel[a.parts_status].toLowerCase()}` : ""}<Icon name="arrow" size={13}/></Link>}
    {a.status_actor && <span className="o-muted o-small">Last decision by {a.status_actor}{a.status_reason ? `: “${a.status_reason}”` : ""}</span>}
    <DismissDialog advisory={a} open={dismissOpen} onOpenChange={setDismissOpen}/>
    <ScheduleDialog open={scheduleOpen} onOpenChange={setScheduleOpen} componentId={a.component_id} advisory={a}/>
  </div>;
}

export function ScheduleDialog({ open, onOpenChange, componentId, advisory }: { open: boolean; onOpenChange: (open: boolean) => void; componentId: string; advisory?: Advisory }) {
  const engine = useEngine();
  const { asOf } = useAsOf();
  const latest = engine.data?.replay_to ?? asOf ?? "";
  const suggested = advisory?.action.within_days !== null && advisory?.action.within_days !== undefined ? Math.max(0, Math.min(advisory.action.within_days - 1, 3)) : 2;
  const [start, setStart] = useState("");
  const [agency, setAgency] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<PlannedWorkOrder | null>(null);
  const create = useCreateWorkOrder();
  const toast = useToast();
  const startValue = start || (latest ? addDays(latest, suggested) : "");
  const close = (value: boolean) => { onOpenChange(value); if (!value) { setResult(null); setStart(""); setNotes(""); } };
  const impact = result?.impact as { availability_pct_points?: number; aircraft_days_lost?: number; spare_waits?: boolean; runs?: number } | undefined;
  return <Modal open={open} onOpenChange={close} title={result ? "Work order planned" : `Schedule maintenance · ${componentId}`} width={560}>
    {result ? <div className="o-scheduled">
      <div className="o-scheduled-head"><span className="o-empty-icon"><Icon name="check" size={20}/></span><div><strong>{result.id}</strong><p>{result.title} · {result.agency_id} · starts {longDate(result.planned_start)} · {result.duration_days} days</p></div></div>
      {impact && <div className="o-impact-preview"><div><span>Fleet availability (30 d)</span><b className={(impact.availability_pct_points ?? 0) >= 0 ? "o-tone-healthy" : "o-tone-critical"}>{signed(impact.availability_pct_points ?? 0, 2, " pts")}</b></div><div><span>Aircraft-days lost</span><b className={(impact.aircraft_days_lost ?? 0) <= 0 ? "o-tone-healthy" : "o-tone-critical"}>{signed(impact.aircraft_days_lost ?? 0, 1)}</b></div></div>}
      <p className="o-muted o-small">Preview from {impact?.runs ?? 200} Monte Carlo runs against the current plan, on synthetic data. A worse result can be real: an early replacement may consume the only spare another aircraft needs. Open the simulator for the per-aircraft breakdown.</p>
      {impact?.spare_waits && <p className="o-warn-line"><Icon name="warning" size={14}/>No unreserved spare on hand — this work will wait for a receipt.</p>}
      <div className="o-form-actions"><Link className="o-btn ghost" to={`/simulator?kind=schedule_maintenance&component=${componentId}`} onClick={() => close(false)}>Compare in simulator</Link><Link className="o-btn" to={`/maintenance?aircraft=${encodeURIComponent(result.aircraft)}#scheduled-work`} onClick={() => close(false)}>Open work board</Link></div>
    </div> : <form onSubmit={event => { event.preventDefault(); create.mutate({ component_id: componentId, advisory_id: advisory?.id ?? null, agency_id: agency || null, planned_start: startValue, notes }, {
      onSuccess: data => { setResult(data); toast({ tone: "success", title: "Work order planned", body: `${data.id} for ${data.aircraft}` }); },
      onError: error => toast({ tone: "error", title: "Could not plan work", body: error.message }),
    }); }}>
      <div className="o-form-grid">
        <label className="o-field">Planned start<input type="date" required value={startValue} min={latest} max={latest ? addDays(latest, 59) : undefined} onChange={event => setStart(event.target.value)}/><small>{advisory?.action.within_days !== null && advisory?.action.within_days !== undefined ? `Advisory: within ${advisory.action.within_days} days` : "Within the next 60 days"}</small></label>
        <label className="o-field">Agency<select value={agency} onChange={event => setAgency(event.target.value)}><option value="">Default for this component</option><option value="AG-LINE">Line maintenance unit</option><option value="AG-BASE">Base repair workshop</option><option value="AG-DEPOT">Depot overhaul agency</option></select><small>Bay capacity is checked in the timeline</small></label>
      </div>
      <label className="o-field" style={{ marginTop: 14 }}>Notes<input value={notes} maxLength={500} onChange={event => setNotes(event.target.value)} placeholder="e.g. bundle with the periodic inspection"/></label>
      {advisory && <p className="o-note" style={{ marginTop: 14 }}><Icon name="info" size={16}/>Spare {advisory.spare.part_number}: {advisory.spare.available} available, lead time {advisory.spare.lead_time_days} days. Planning reserves one unit; the availability impact is simulated after you confirm.</p>}
      <div className="o-form-actions"><button type="button" className="o-btn ghost" onClick={() => close(false)}>Cancel</button><button type="submit" className="o-btn" disabled={create.isPending || !startValue}>{create.isPending ? "Simulating impact…" : "Plan work order"}</button></div>
    </form>}
  </Modal>;
}

/** Spare status chip; Project Forge parts read as a print route rather than a shortage. */
export function SparePill({ spare, short = false }: { spare: Advisory["spare"]; short?: boolean }) {
  if (spare.status === "additive_print") return <Pill tone="accent" icon="printer">{short ? "" : `${spare.part_number}: `}print route · 1 d</Pill>;
  return <Pill tone={spare.status}>{short ? "" : `${spare.part_number}: `}{spare.status}</Pill>;
}
