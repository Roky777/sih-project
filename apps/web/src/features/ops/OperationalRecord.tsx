import { Link, useParams } from "react-router-dom";
import { CaseContext, caseState } from "./CaseWorkspace";
import { usePartRequests, useWorkOrders } from "./api";
import { Card, EmptyState, PageHead, Pill, Query } from "./ui";

export function WorkOrderDetail() {
  const { workId = "" } = useParams();
  const query = useWorkOrders();
  return <div className="o-screen"><PageHead title="Work order" description={`${workId} · Execution, commitments and verification`}/><CaseContext record={workId}/>
    <Query query={query}>{data => { const work = data.planned.find(item => item.id === workId); const recorded = data.recorded.find(item => item.id === workId); if (!work && !recorded) return <EmptyState title="Work order unavailable"><Link to="/maintenance">Return to work queue</Link></EmptyState>;
      return <Card title={work?.title ?? String(recorded?.finding ?? "Recorded agency work")}><dl className="o-kv"><dt>Aircraft</dt><dd><Link to={`/aircraft/${String(work?.aircraft ?? recorded?.aircraft ?? "Unavailable")}`}>{String(work?.aircraft ?? recorded?.aircraft ?? "Unavailable")}</Link></dd><dt>Status</dt><dd><Pill tone={["completed", "closed"].includes(String(work?.status ?? recorded?.phase)) ? "healthy" : "watch"}>{caseState(String(work?.status ?? recorded?.phase ?? "Unavailable"))}</Pill></dd><dt>Agency</dt><dd>{String(work?.agency_id ?? recorded?.agency_id ?? "Not established")}</dd><dt>Window</dt><dd>{String(work?.planned_start ?? recorded?.opened ?? "Unavailable")} · {work?.duration_days ? `${work.duration_days} days` : "Duration not established"}</dd><dt>Part</dt><dd>{String(work?.part ?? recorded?.part ?? "No part requirement recorded")}</dd><dt>Notes</dt><dd>{work?.notes ?? "Recorded agency finding"}</dd></dl><Link className="o-btn ghost" to={`/spares?view=requests&aircraft=${String(work?.aircraft ?? recorded?.aircraft ?? "Unavailable")}`}>Linked supply</Link></Card>;
    }}</Query></div>;
}
export function PartsRequestDetail() {
  const { requestId = "" } = useParams();
  const query = usePartRequests(true);
  return <div className="o-screen"><PageHead title="Parts request" description={`${requestId} · Recorded quantity and linked maintenance`}/><CaseContext record={requestId}/><Query query={query}>{rows => {
    const request = rows.find(item => item.id === requestId);
    return request ? <Card title={request.part}><dl className="o-kv"><dt>Aircraft</dt><dd><Link className="o-link" to={`/aircraft/${request.aircraft}`}>{request.aircraft}</Link></dd><dt>Work</dt><dd><Link to={`/maintenance/work/${request.work_order_id}`}>{request.work_order_id}</Link></dd><dt>Needed by</dt><dd>{request.needed_by}</dd><dt>Required / received</dt><dd>{request.quantity} / {request.received_quantity}</dd><dt>Available usable stock</dt><dd>{request.available_now}</dd><dt>ETA</dt><dd>{request.eta ?? "Not established"}</dd><dt>Status</dt><dd><Pill tone={request.status === "reserved" || request.status === "received" ? "healthy" : "watch"}>{caseState(request.status)}</Pill></dd><dt>Owner</dt><dd>{request.updated_by ?? "Logistics team"}</dd></dl><Link className="o-btn" to={`/spares?view=requests&request=${requestId}&aircraft=${request.aircraft}`}>Manage request</Link>{["ordered", "partially_received"].includes(request.status) && <Link className="o-btn ghost" to={`/spares?view=deliveries&request=${requestId}`}>Record delivery</Link>}</Card> : <EmptyState title="Parts request unavailable"><Link to="/spares?view=requests">Return to requests</Link></EmptyState>;
  }}</Query></div>;
}
