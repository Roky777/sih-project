import { useActorRole } from "../ops/roles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, arrayOf, isAlert, type Alert } from "../../shared/api/client";
import { AsyncState } from "../../shared/ui/AsyncState";
import { Icon } from "../../shared/ui/Icon";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { Notice, PageHeader, RefreshButton, StatCard } from "../../shared/ui/WorkspaceUI";
const titles: Record<string,string> = { data_unavailable: "Component evidence needs review", critical: "Critical life estimate", warning: "Life estimate requires attention", normal: "Assessment within policy limits" };
export function AlertsPage() {
  const actorRole = useActorRole();
  const canReview=actorRole==='engineer'||actorRole==='supervisor';
  const client = useQueryClient();
  const [filter, setFilter] = useState<"all"|"pending"|"reviewed">("all");
  const query = useQuery({ queryKey:["alerts"], queryFn: () => api<Alert[]>("/alerts", undefined, arrayOf(isAlert)) });
  const acknowledge = useMutation({ mutationFn: (id:string) => api<Alert>(`/alerts/${id}/acknowledgements`, { method:"POST", headers:{ "X-Demo-Role":"engineer", "X-Demo-User":"demo-engineer" } }, isAlert), onSuccess: () => client.invalidateQueries({ queryKey:["alerts"] }) });
  const open = query.data?.filter((alert) => !alert.acknowledgements.length).length;
  const reviewedCount = query.data?.filter((alert) => alert.acknowledgements.length > 0).length;
  const visible = query.data?.filter((alert) => filter === "all" || (filter === "pending" ? !alert.acknowledgements.length : alert.acknowledgements.length > 0));
  return <section><PageHeader eyebrow="TECHNICAL REVIEW" title="Alerts & review" description="Understand why attention is requested, inspect the evidence and record a technical review." actions={<RefreshButton fetching={query.isFetching} onClick={() => void query.refetch()}/>}/>
    <div className="metric-grid three"><StatCard label="Awaiting review" value={open ?? "—"} detail="Alerts without an acknowledgement" icon="bell" tone="warning"/><StatCard label="Review recorded" value={reviewedCount ?? "—"} detail="Acknowledged by a technical reviewer" icon="check" tone="success"/><StatCard label="Evidence unavailable" value={query.data?.filter((alert) => alert.state === "data_unavailable").length ?? "—"} detail="Quality status requiring attention" icon="file"/></div>
    <Notice title="Review and resolution are separate">Acknowledgement records that an alert has been seen. It does not resolve deterioration or mark maintenance work complete.</Notice>
    {!canReview&&<Notice title="Review permission">Engineer or supervisor permission is required to record a technical review.</Notice>}
    <div className="section-heading"><h2>Alert inbox</h2><div className="segmented-control" aria-label="Filter alerts">{([['all','All alerts'],['pending','Awaiting review'],['reviewed','Reviewed']] as const).map(([value,label]) => <button key={value} className={filter===value?"selected":""} aria-pressed={filter===value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
    {acknowledge.error && <div className="state error" role="alert">{acknowledge.error.message}</div>}
    <AsyncState loading={query.isLoading} error={query.error} empty={!visible?.length} emptyMessage="No alerts in this view" onRetry={() => void query.refetch()}><div className="attention-list">{visible?.map((alert) => { const reviewed = alert.acknowledgements.length > 0; return <article className="attention-card" key={alert.id}><span className="attention-icon"><Icon name={alert.state === "normal" ? "check" : "warning"} size={23}/></span><div className="attention-body"><div className="attention-meta"><span className="mono">{alert.component_id}</span><StatusBadge status={alert.state}/></div><h2>{titles[alert.state] ?? "Component alert"}</h2><p>{alert.reason}</p><div className="attention-footer"><div><span>Policy version</span><strong>{alert.policy_version}</strong></div><div><span>Assessment</span><strong className="mono">{alert.assessment_id ?? "Unavailable"}</strong></div><div><span>Review status</span><strong>{reviewed ? "Review recorded" : "Awaiting review"}</strong></div></div>{reviewed && <div className="review-history">{alert.acknowledgements.map((item) => <span key={item.actor}><Icon name="check" size={14}/>{item.actor}<time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString([], { dateStyle:"medium", timeStyle:"short" })}</time></span>)}</div>}</div><div className="attention-actions"><Link className="button secondary" to={`/components/${encodeURIComponent(alert.component_id)}`}>View evidence<Icon name="arrow" size={15}/></Link><button onClick={() => acknowledge.mutate(alert.id)} disabled={acknowledge.isPending || reviewed || !canReview}>{reviewed ? "Review recorded" : acknowledge.isPending && acknowledge.variables === alert.id ? "Recording…" : "Record technical review"}</button></div></article>; })}</div></AsyncState>
  </section>;
}
