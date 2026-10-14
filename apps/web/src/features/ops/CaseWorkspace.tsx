import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../shared/api/client";
import type { components } from "../../shared/api/generated/schema";
import { useActorRole } from "./roles";
import { useAsOf } from "./AsOf";
import { Card, EmptyState, PageHead, Pill, Query } from "./ui";

type Case = components["schemas"]["CaseResponse"];
type CasePage = components["schemas"]["CasePage"];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const isCase = (value: unknown): value is Case => object(value) && typeof value.id === "string" && typeof value.dataset === "string" && typeof value.aircraft_id === "string" && typeof value.state === "string" && typeof value.version === "number" && object(value.next_action) && typeof value.next_action.label === "string" && typeof value.next_action.role === "string" && typeof value.next_action.to === "string" && value.next_action.to.startsWith("/") && !value.next_action.to.startsWith("//") && Array.isArray(value.links) && Array.isArray(value.work) && Array.isArray(value.proposals) && Array.isArray(value.audit);
const isCasePage = (value: unknown): value is CasePage => object(value) && Array.isArray(value.items) && value.items.every(isCase) && typeof value.total === "number";
const text = (record: Record<string, unknown>, key: string) => typeof record[key] === "string" ? record[key] as string : "Not established";
export const caseState = (state: string) => state.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());

export function useCases(scope: { aircraft?: string; component?: string; dataset?: string; offset?: number; state?: string; record?: string } = {}, enabled = true) {
  const params = new URLSearchParams({ dataset: scope.dataset ?? "operational", limit: "25", offset: String(scope.offset ?? 0) });
  if (scope.record) params.set("record", scope.record);
  if (scope.state && scope.state !== "all") params.set("state", scope.state);
  if (scope.aircraft) params.set("aircraft", scope.aircraft);
  if (scope.component) params.set("component", scope.component);
  return useQuery({ enabled, queryKey: ["cases", params.toString()], queryFn: () => api(`/cases?${params}`, undefined, isCasePage) });
}

const stateTone = (state: string) => ["blocked", "evidence_unavailable"].includes(state) ? "critical" : ["awaiting_review", "stale", "proposal_review"].includes(state) ? "watch" : ["ready", "closed"].includes(state) ? "healthy" : "maint";
export function CaseHeader({ record, compact = false, inDetail = false }: { record: Case; compact?: boolean; inDetail?: boolean }) {
  const action = compact && record.next_action.label.startsWith("Prepare") ? "Prepare plan" : record.next_action.label;
  return <section className={`case-context${compact ? " case-context-compact" : ""}`} data-tone={stateTone(record.state)} aria-label="Maintenance case context"><div>
    <div className="case-context-heading"><span className="case-tail">{record.aircraft_id}</span><Pill tone={stateTone(record.state)}>{caseState(record.state)}</Pill></div>
    <strong className="case-title">{record.title}</strong>
    <p className="case-owner">{record.owner ?? record.owner_team ?? "Owner not assigned"}<span>Due {record.deadline ?? "Not established"}</span></p>
    {record.blocker && <p className="case-blocker">{record.blocker}</p>}
    {!compact && <details className="case-evidence-refs"><summary>Case & evidence references</summary><p className="case-identities">{record.component_id ?? (record.links.some(item => item.kind === "mandatory_task") ? "Aircraft-wide inspection" : "Component not established")} · <Link to={`/cases/${record.id}`}>{record.id}</Link></p><small>{record.dataset} · evidence versions {record.evidence_versions.join(", ") || "Not established"}</small></details>}
  </div><nav><Link className="o-btn ghost" title={record.next_action.label} to={inDetail ? ["awaiting_review", "stale"].includes(record.state) ? "#case-review" : ["ready", "in_progress", "awaiting_verification"].includes(record.state) ? "#case-execution" : record.state === "closed" ? "#case-history" : "#case-planning" : `/cases/${record.id}`}>{action}</Link>{!compact && <Link className="o-link" to={record.next_action.to}>Related workspace →</Link>}</nav></section>;
}

export function CaseContext({ aircraft, component, record: recordId, dataset = "operational" }: { aircraft?: string; component?: string; record?: string; dataset?: string }) {
  const query = useCases({ aircraft, component, dataset, record: recordId });
  if (query.isLoading) return <p role="status">Loading linked maintenance cases…</p>;
  if (query.error) return <p role="alert">Case links unavailable. <button className="o-link" onClick={() => void query.refetch()}>Retry</button></p>;
  const record = query.data?.items.find(item => !["closed", "cancelled"].includes(item.state)) ?? query.data?.items[0];
  return record ? <CaseHeader record={record}/> : <p className="o-note">No maintenance case is recorded for this selection. Evidence and mandatory work remain available.</p>;
}

export function CaseQueue({ dataset = "operational", scopeAircraft }: { dataset?: string; scopeAircraft?: string }) {
  const [params, setParams] = useSearchParams();
  const requestedPage = Number(params.get("casePage") ?? 0);
  const offset = (Number.isFinite(requestedPage) ? Math.max(0, Math.min(100000, Math.floor(requestedPage))) : 0) * 25;
  const filter = params.get("caseState") ?? "all";
  const setOffset = (value: number) => setParams(previous => { const next = new URLSearchParams(previous); next.set("casePage", String(value / 25)); return next; });
  const setFilter = (value: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set("caseState", value); next.delete("casePage"); return next; });
  const query = useCases({ dataset, aircraft: scopeAircraft ?? params.get("aircraft") ?? undefined, component: params.get("component") ?? undefined, offset, state: filter });
  const items = query.data?.items.filter(item => filter === "all" || item.state === filter) ?? [];
  return <Card className="case-queue" title="Maintenance cases" subtitle="Evidence, readiness and the next action for each aircraft" actions={<label>State<select className="o-input" value={filter} onChange={e => setFilter(e.target.value)}>{["all", "awaiting_review", "needs_planning", "blocked", "stale", "tentative", "proposal_review", "ready", "in_progress", "awaiting_verification", "closed"].map(value => <option key={value} value={value}>{caseState(value)}</option>)}</select></label>}>
    <Query query={query}>{() => items.length ? <div className="o-table-wrap"><table className="o-table"><thead><tr><th>Aircraft · case</th><th>Status</th><th>Owner/team</th><th>Deadline</th><th>Blocker</th><th>Next action</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><Link to={`/cases/${item.id}`} title={item.id}><strong className="case-tail">{item.aircraft_id}</strong><small>{item.title}</small></Link></td><td><Pill tone={stateTone(item.state)}>{caseState(item.state)}</Pill></td><td>{item.owner ?? item.owner_team ?? "Not assigned"}</td><td>{item.deadline ?? "Not established"}</td><td>{item.blocker ?? "None recorded"}</td><td><Link className="o-btn sm ghost" to={`/cases/${item.id}`}>{item.next_action.label}</Link></td></tr>)}</tbody></table></div> : <EmptyState title={offset > 0 ? "This page has no cases" : "No matching cases"}>{offset > 0 ? <>The queue may have changed. <button type="button" className="o-link" onClick={() => setOffset(0)}>Return to the first page</button></> : "No matching work is recorded for this dataset and filter."}</EmptyState>}</Query>
    {(offset > 0 || (query.data?.total ?? 0) > 25) && <div className="case-pagination"><button className="o-btn ghost" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</button><span>{query.data?.total ?? "—"} cases · page {offset / 25 + 1}</span><button className="o-btn ghost" disabled={offset + 25 >= (query.data?.total ?? 0)} onClick={() => setOffset(offset + 25)}>Next</button></div>}
  </Card>;
}

export function CaseDetailPage() {
  const { caseId = "" } = useParams();
  const query = useQuery({ queryKey: ["case", caseId], queryFn: () => api(`/cases/${encodeURIComponent(caseId)}`, undefined, isCase) });
  const client = useQueryClient();
  const actorRole = useActorRole();
  const { asOf } = useAsOf();
  const [decision, setDecision] = useState<"maintenance_required" | "monitor" | "dismiss" | "investigate">("maintenance_required");
  const [reason, setReason] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState("");
  const command = useMutation({ mutationFn: ({ path, body }: { path: string; body?: unknown }) => api(path, { method: "POST", body: JSON.stringify(body ?? {}) }), onSuccess: async () => { setSaved("Saved. Linked records and the next responsible role have been refreshed."); await client.invalidateQueries(); } });
  const reviewAllowed = ["engineer", "supervisor"].includes(actorRole);
  const planAllowed = ["planner", "supervisor"].includes(actorRole);
  const supervisor = actorRole === "supervisor";
  return <div className="o-screen case-detail-screen"><PageHead title="Maintenance case" description={`${caseId} · Evidence, planning and verified execution`}/>
    {saved && <p role="status" className="o-note">{saved}</p>}{command.error && <p role="alert" className="o-note warn">{command.error.message} Reload or recalculate the current proposal before retrying.</p>}
    <Query query={query}>{record => {
      const operational = record.dataset.startsWith("operational:");
      const replay = operational && !!asOf;
      const mandatory = record.links.some(item => item.kind === "mandatory_task");
      const planningReady = ["needs_planning", "tentative", "proposal_review", "blocked"].includes(record.state);
      return <><CaseHeader inDetail record={record}/><div className="case-record-grid">
        <Card id="case-review" title={mandatory ? "Mandatory requirement" : "Engineer decision"} subtitle={mandatory ? "The recorded maintenance deadline remains authoritative" : "Review this exact evidence version before preparing maintenance"}>
          {record.review && <p>Last decision: {caseState(String(record.review.decision))} · {String(record.review.reason || "No additional reason")} · {String(record.review.actor ?? "Reviewer not established")}{record.review.follow_up ? ` · Follow-up ${String(record.review.follow_up)}` : ""}</p>}
          {mandatory ? <p className="o-note">This is mandatory maintenance. It cannot be dismissed or monitored as a predictive finding; prepare a plan using its recorded deadline.</p> : reviewAllowed && !replay ? <form className="case-review-form" onSubmit={e => { e.preventDefault(); command.mutate({ path: `/cases/${record.id}/review`, body: { decision, reason, follow_up: decision === "monitor" ? followUp : null, expected_version: record.version, as_of: operational ? asOf : null } }); }}>
            <label>Decision<select className="o-input" value={decision} onChange={e => setDecision(e.target.value as typeof decision)}><option value="maintenance_required">Maintenance required</option><option value="monitor">Monitor</option><option value="dismiss">Dismiss</option><option value="investigate">Investigate further</option></select></label>
            <label>Reason<textarea className="o-input" required={decision !== "maintenance_required"} value={reason} onChange={e => setReason(e.target.value)} maxLength={1000}/></label>
            {decision === "monitor" && <label>Follow-up date<input className="o-input" type="date" required value={followUp} onChange={e => setFollowUp(e.target.value)}/></label>}
            <button className="o-btn" disabled={command.isPending}>Save engineering decision</button></form> : <p>{replay ? "Historical records are read only." : "Maintenance engineer or supervisor records this decision."}</p>}
        </Card>
        <Card id="case-planning" title="Planning and approval" subtitle="Expected deliveries support tentative planning; approval requires current stock and resources">
          {operational && planAllowed && !replay ? <button className="o-btn" disabled={command.isPending || !planningReady} onClick={() => command.mutate({ path: `/cases/${record.id}/proposal` })}>Prepare / recalculate proposal</button> : <Link className="o-btn ghost" to={operational ? "/maintenance" : `/maintenance?dataset=research&view=bays&case=${record.id}&component=${record.component_id}`}>Open dataset planning</Link>}
          {operational && !planningReady && <p className="o-muted">{["awaiting_review", "stale"].includes(record.state) ? "Complete the engineering review of current evidence before preparing a plan." : record.state === "evidence_unavailable" ? "Resolve the unavailable evidence before preparing a plan." : "Use the case’s current action; no new proposal is needed at this step."}</p>}
          {record.proposals.map(proposal => <article key={String(proposal.id)}><p><strong>{text(proposal, "id")}</strong> · {text(proposal, "solver_status")} · {text(proposal, "status")}</p><p>Objective: minimise latest completion; this is a scheduling surrogate.</p>{Array.isArray(proposal.diagnostics) && proposal.diagnostics.map((d, i) => <p key={i}>{String(d)}</p>)}
            {Array.isArray(proposal.assignments) && proposal.assignments.length > 0 && <div className="o-table-wrap"><table className="o-table"><thead><tr><th>Work</th><th>Day window</th><th>Crew</th><th>Bay</th></tr></thead><tbody>{proposal.assignments.filter(object).map((assignment, index) => <tr key={index}><td>{String(assignment.task_id)}</td><td>{String(assignment.start)}–{String(assignment.end)} days from dataset date</td><td>{String(assignment.crew_id ?? "Not established")}</td><td>{String(assignment.bay_id ?? "Not established")}</td></tr>)}</tbody></table></div>}
            {proposal.status === "proposed" && (supervisor && !replay ? <button className="o-btn" disabled={command.isPending} onClick={() => command.mutate({ path: `/cases/proposals/${proposal.id}/approval`, body: { input_version: proposal.input_version, as_of: asOf } })}>Approve this exact proposal</button> : <p>Supervisor review is required.</p>)}
          </article>)}
        </Card>
      </div><Card id="case-execution" title="Execution and verification" subtitle="Completing execution records work; verification checks the outcome separately">
        <label className="o-field">Outcome / verification note<textarea className="o-input" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000}/></label>
        {record.work.length ? record.work.map(work => <article key={String(work.id)}><p><strong>{text(work, "id")}</strong> · {caseState(String(work.status))}</p>
          {supervisor && !replay && ["approved", "in_progress", "awaiting_verification"].includes(String(work.status)) && <button className="o-btn" disabled={command.isPending || !notes.trim()} onClick={() => {
            const state = String(work.status);
            const path = operational ? state === "awaiting_verification" ? `/cases/work/${work.id}/verification` : `/fleet-health/work-orders/${work.id}` : `/work/${work.id}/outcome`;
            if (operational && state !== "awaiting_verification") command.mutate({ path: `/cases/${record.id}/work/${work.id}/outcome`, body: { action: state === "approved" ? "start" : "complete", expected_version: work.version, notes, as_of: asOf } });
            else command.mutate({ path, body: operational ? { expected_version: work.version, notes, as_of: asOf } : { action: state === "approved" ? "start" : state === "in_progress" ? "complete" : "verify", expected_version: work.version, notes } });
          }}>{work.status === "approved" ? "Start work" : work.status === "in_progress" ? "Record execution completed" : "Record verification"}</button>}
          {!supervisor && <p>Maintenance supervisor records execution and verification.</p>}
        </article>) : <p>No work order linked yet.</p>}
      </Card><Card id="case-history" title="Related records and case history"><nav className="workspace-research-links">{record.links.map((item, i) => <Link key={i} to={item.kind === "fleet_work" ? `/maintenance/work/${item.id}` : item.kind === "fleet_request" ? `/spares/requests/${item.id}` : item.kind === "finding" || item.kind === "fleet_assessment" ? `/health/${record.component_id}?case=${record.id}` : item.kind === "assessment" ? `/components/${record.component_id}?case=${record.id}` : `/maintenance?${new URLSearchParams({ case: record.id, ...(operational ? {} : { dataset: "research" }) })}`}>{caseState(String(item.kind))} · {text(item, "id")}</Link>)}</nav><details><summary>Audit history ({record.audit.length})</summary><ol>{record.audit.map((event, i) => <li key={i}>{text(event, "at")} · {text(event, "actor")} · {text(event, "event")}<pre>{JSON.stringify(event.references, null, 2)}</pre></li>)}</ol></details></Card></>;
    }}</Query>
  </div>;
}

export function CurrentCaseControls() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const route = useParams();
  const caseId = params.get("case");
  if (caseId) return <Link className="o-btn ghost" to={`/cases/${caseId}`}>Return to case {caseId}</Link>;
  const component = route.componentId ?? params.get("component") ?? undefined;
  const aircraft = route.aircraftId ?? params.get("aircraft") ?? undefined;
  if (!component && !aircraft) return null;
  return <CaseContext aircraft={aircraft} component={component} dataset={location.pathname.startsWith("/components/") || params.get("dataset") === "research" ? component?.startsWith("trial-") ? `trial:${component.replace(/-engine$/, "")}` : "engine-research" : "operational"}/>;
}
