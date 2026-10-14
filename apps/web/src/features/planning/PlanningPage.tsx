import { useActorRole } from "../ops/roles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, arrayOf, isJob, isPlan, type Job, type Plan } from "../../shared/api/client";
import { AsyncState } from "../../shared/ui/AsyncState";
import { Icon } from "../../shared/ui/Icon";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { Notice, PageHeader, RefreshButton, StatCard } from "../../shared/ui/WorkspaceUI";
import { JobProgress } from "../jobs/JobProgress";
import { PlanTimeline } from "./PlanTimeline";
import { PlanHistory } from "./PlanHistory";
import { PlanApproval } from "./PlanApproval";
import { PlanComparison } from "./PlanComparison";
import { ResourcePanel } from "./ResourcePanel";
export function PlanningPage({ embedded = false }: { embedded?: boolean } = {}) {
  const actorRole = useActorRole();
  const canPlan=actorRole==='planner'||actorRole==='supervisor';
  const [context]=useSearchParams();
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const query = useQuery({ queryKey: ["plans"], queryFn: () => api<Plan[]>("/plans", undefined, arrayOf(isPlan)).then(plans => plans.filter(plan => !plan.input_snapshot?.scope_component_id)) });
  const propose = useMutation({ mutationFn: () => api<Job>("/jobs/planning", { method: "POST" }, isJob), onSuccess: () => client.invalidateQueries({ queryKey: ["jobs"] }) });
  const approve = useMutation({ mutationFn: (id: string) => api<Plan>(`/plans/${id}/approve`, { method: "POST" }, isPlan), onSuccess: () => { void client.invalidateQueries({ queryKey: ["plans"] }); void client.invalidateQueries({ queryKey: ["inventory"] }); void client.invalidateQueries({queryKey:["plan-commitment"]}); } });
  const selected = query.data?.find((plan) => plan.id === selectedId) ?? query.data?.[0];
  const usable = selected && selected.assignments.length > 0 && ["optimal", "feasible"].includes(selected.solver_status);
  const proposedCount = query.data?.filter((plan) => plan.status === "proposed").length;
  const approvedCount = query.data?.filter((plan) => plan.status === "approved").length;
  return <section>
    <PageHeader level={embedded ? "section" : "page"} eyebrow="MAINTENANCE PLANNING" title="Maintenance planning" description="Generate a checked schedule, inspect its constraints and review the exact proposal before approval." actions={<><RefreshButton fetching={query.isFetching} onClick={() => void query.refetch()}/><button onClick={() => propose.mutate()} disabled={propose.isPending||!canPlan}><Icon name="calendar" size={17}/>{propose.isPending ? "Submitting…" : "Calculate maintenance schedule"}</button></>}/>
    {!canPlan&&<Notice title="Read-only planning">Planner or supervisor permission is required to calculate a proposal. Saved evidence remains available.</Notice>}
    {context.get("component")?.startsWith("trial-")&&<Notice title="Customer trial scope">This component belongs to a dedicated customer trial. <Link to={`/demo?trial=${encodeURIComponent(context.get("component")!.replace(/-engine$/, ""))}`}>Return to the trial’s evidence, schedule and work</Link>. Ordinary fleet proposals below exclude trial tasks and stock.</Notice>}
    {context.get("component")&&!context.get("component")?.startsWith("trial-")&&<Notice title="Inspection context">Selected component: {context.get("component")}. Proposals cover the configured fleet task set; this selection does not restrict the solver. <Link to={`/components/${encodeURIComponent(context.get("component")!)}`}>Return to component evidence</Link></Notice>}
    <div className="metric-grid"><StatCard label="Proposals recorded" value={query.data?.length ?? "—"} detail="Retained with input versions" icon="file"/><StatCard label="Awaiting approval" value={proposedCount ?? "—"} detail="Uncommitted proposals" icon="clock" tone="warning"/><StatCard label="Approved plans" value={approvedCount ?? "—"} detail="Current-state checks at commitment" icon="check" tone="success"/><StatCard label="Planning time unit" value={<>8<span className="value-unit">hours</span></>} detail="Per configured planning slot" icon="calendar"/></div>
    {(propose.error || approve.error) && <div className="state error" role="alert">{(propose.error || approve.error)?.message}</div>}
    {propose.isSuccess && <Notice title="Calculation queued">Your request is saved. Follow its progress in calculation activity below.</Notice>}
    <div className="planning-workflow"><span><b>01</b> Snapshot inputs</span><Icon name="chevron" size={16}/><span><b>02</b> Check schedule</span><Icon name="chevron" size={16}/><span><b>03</b> Review proposal</span><Icon name="chevron" size={16}/><span><b>04</b> Approve & reserve</span></div>
    <AsyncState loading={query.isLoading} error={query.error} empty={!query.data?.length} emptyMessage="Create your first maintenance proposal" onRetry={() => void query.refetch()}>{selected && <article className="card plan-card">
      <div className="card-heading"><div><span className="eyebrow">PROPOSAL REVIEW</span><h2>Fleet maintenance schedule</h2><p>{new Date(selected.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p></div><div className="plan-picker"><label className="sr-only" htmlFor="plan-picker">Select proposal</label><select id="plan-picker" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{query.data?.map((plan, index) => <option key={plan.id} value={plan.id}>{index===0?"Latest":"Previous"} · {plan.id} · {plan.status}</option>)}</select></div></div>
      <div className="plan-status-row"><StatusBadge status={selected.status}/><StatusBadge status={selected.solver_status}/><Link className="text-link" to="/inventory">Inspect parts inventory<Icon name="arrow" size={15}/></Link></div>
      <div className="plan-summary"><div><span>Scheduled tasks</span><strong>{selected.assignments.length}</strong></div><div><span>Last scheduled completion</span><strong>{selected.assignments.length ? `${Math.max(...selected.assignments.map((item) => item.end)) * 8} hr` : "—"}</strong></div><div><span>Schedule validation</span><strong>{usable ? "Constraint-checked" : "No usable schedule"}</strong></div></div>
      {selected.diagnostics.length > 0 && <Notice title="Schedule diagnostics" tone="warning">{selected.diagnostics.join(" ")}</Notice>}
      <PlanTimeline plan={selected}/><div className="table-scroll"><table><caption className="sr-only">Assignments in proposal {selected.id}</caption><thead><tr><th scope="col">Task record</th><th scope="col">Start</th><th scope="col">Finish</th><th scope="col">Work duration</th><th scope="col">Crew / bay</th></tr></thead><tbody>{selected.assignments.map((assignment) => <tr key={assignment.task_id}><td><div className="task-cell"><Icon name="calendar" size={17}/><strong className="mono">{assignment.task_id}</strong></div></td><td>Hour {assignment.start * 8}</td><td>Hour {assignment.end * 8}</td><td>{(assignment.end-assignment.start)*8} hours</td><td>{assignment.crew_id ?? "Not assigned"} / {assignment.bay_id ?? "Not assigned"}</td></tr>)}</tbody></table></div>
      <PlanApproval key={selected.id} plan={selected} pending={approve.isPending} onApprove={(id) => approve.mutate(id)}/>
      <details className="technical-details"><summary>Input provenance and calculation details</summary><dl className="record-details"><div><dt>Proposal identity</dt><dd className="mono">{selected.id}</dd></div><div><dt>Input snapshot</dt><dd className="mono">{selected.input_version}</dd></div><div><dt>Solver outcome</dt><dd>{selected.solver_status}</dd></div><div><dt>Scope</dt><dd>Synthetic maintenance tasks and logistics</dd></div></dl></details>
    </article>}</AsyncState>
    <ResourcePanel/>
    {selected&&<PlanHistory key={selected.id} plan={selected}/>}
    {selected&&usable&&<PlanComparison key={`comparison-${selected.id}`} planId={selected.id}/>}
    <div className="section-heading"><h2>Calculation activity</h2><span className="muted">Durable jobs · Results saved before completion</span></div><JobProgress kind="planning"/>
  </section>;
}
