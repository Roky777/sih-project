import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../shared/api/client";
import { useActorRole } from "./roles";
import { usePartRequests } from "./api";
import { useAsOf } from "./AsOf";
import { Card, EmptyState, Query } from "./ui";

export function DeliveryWorkspace() {
  const query = usePartRequests(true);
  const [params] = useSearchParams();
  const client = useQueryClient();
  const actorRole = useActorRole();
  const { asOf } = useAsOf();
  const [received, setReceived] = useState<Record<string, string>>({});
  const receipt = useMutation({ mutationFn: ({ id, version, quantity }: { id: string; version: number; quantity: number }) => api(`/fleet-health/part-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status: "received", received_quantity: quantity, expected_version: version, note: "Recorded cumulative delivery receipt", as_of: asOf }) }), onSuccess: () => client.invalidateQueries() });
  const allowed = ["logistics", "supervisor"].includes(actorRole) && !asOf;
  return <Card title="Deliveries" subtitle="Expected, partial, received and cancelled supply; receipt never starts work automatically">
    {receipt.error && <p role="alert">{receipt.error.message} Reload the request before retrying.</p>}{receipt.isSuccess && <p role="status">Receipt saved; linked readiness and proposal inputs refreshed.</p>}
    <Query query={query}>{items => {
      const rows = items.filter(item => (!params.get("request") || item.id === params.get("request")) && (item.eta || ["ordered", "received", "cancelled"].includes(item.status)));
      return rows.length ? <div className="o-table-wrap"><table className="o-table"><thead><tr><th>Part · request</th><th>Aircraft · work</th><th>ETA</th><th>Status</th><th>Ordered / received</th><th>Record receipt</th></tr></thead><tbody>{rows.map(item => <tr key={item.id}><td>{item.part}<small><Link to={`/spares?view=requests&request=${item.id}`}>{item.id}</Link></small></td><td>{item.aircraft}<small>{item.work_order_id}</small></td><td>{item.eta ?? "Not established"}</td><td>{item.status === "ordered" && item.at_risk ? "Late / deadline conflict" : item.status}</td><td>{item.quantity} / {item.received_quantity}</td><td>{item.status === "ordered" && allowed ? <form onSubmit={e => { e.preventDefault(); receipt.mutate({ id: item.id, version: item.version, quantity: Number(received[item.id] ?? item.quantity) }); }}><label className="sr-only" htmlFor={`receipt-${item.id}`}>Cumulative received quantity for {item.id}</label><input id={`receipt-${item.id}`} className="o-input" type="number" min={item.received_quantity + 1} max={item.quantity} value={received[item.id] ?? item.quantity} onChange={e => setReceived(values => ({ ...values, [item.id]: e.target.value }))}/><button className="o-btn sm" disabled={receipt.isPending}>Save receipt</button></form> : <span>{allowed ? "No pending receipt" : "Logistics records receipts"}</span>}</td></tr>)}</tbody></table></div> : <EmptyState title="No delivery records">Expected deliveries appear when linked parts requests are ordered.</EmptyState>;
    }}</Query>
  </Card>;
}
