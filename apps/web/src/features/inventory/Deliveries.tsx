import { useActorRole } from "../ops/roles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { api, arrayOf, isPartArrival, type InventoryPart, type PartArrival } from "../../shared/api/client";
import { AsyncState } from "../../shared/ui/AsyncState";
import { Notice } from "../../shared/ui/WorkspaceUI";

export function Deliveries({ parts }: { parts: InventoryPart[] }) {
  const cache = useQueryClient();
  const actorRole = useActorRole();
  const canEdit = actorRole === "logistics" || actorRole === "supervisor";
  const command = useRef<{ key: string; id: string } | null>(null);
  const [partId, setPartId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [slot, setSlot] = useState(0);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<PartArrival | null>(null);
  const [outcomeReason, setOutcomeReason] = useState("");
  const query = useQuery({ queryKey: ["arrivals"], queryFn: () => api<PartArrival[]>("/inventory/arrivals", undefined, arrayOf(isPartArrival)) });
  async function refresh() {
    await Promise.all([cache.invalidateQueries({ queryKey: ["arrivals"] }), cache.invalidateQueries({ queryKey: ["inventory"] }), cache.invalidateQueries({ queryKey: ["plans"] })]);
  }
  const create = useMutation({ mutationFn: async () => {
    const part = parts.find((item) => item.id === partId);
    if (!part) throw new Error("Select an inventory part before scheduling a delivery.");
    const key = JSON.stringify({ partId, quantity, slot, reason });
    if (command.current?.key !== key) command.current = { key, id: `delivery-${crypto.randomUUID()}` };
    return api<PartArrival>("/inventory/arrivals", { method: "POST", body: JSON.stringify({ id: command.current.id, part_id: part.id, quantity, arrival_slot: slot, expected_part_version: part.version, reason }) }, isPartArrival);
  }, onSuccess: async () => { command.current = null; setReason(""); await refresh(); } });
  const outcome = useMutation({ mutationFn: async (action: "receive" | "cancel") => {
    if (!review) throw new Error("Select a delivery to review.");
    return api<PartArrival>(`/inventory/arrivals/${encodeURIComponent(review.id)}/outcome`, { method: "POST", body: JSON.stringify({ action, expected_version: review.version, reason: outcomeReason }) }, isPartArrival);
  }, onSuccess: async () => { setReview(null); setOutcomeReason(""); await refresh(); } });
  function submit(event: FormEvent) { event.preventDefault(); create.mutate(); }
  return <article className="card deliveries-card"><div className="card-heading"><div><h2>Expected deliveries</h2><p>Arrival slots use the current 14-slot demonstration horizon, with 8 hours per slot.</p></div><span className="source-tag">Synthetic logistics</span></div>
    <Notice title="Expected stock is a planning assumption">Proposals can wait for an expected delivery. Approval requires received stock and a current proposal. Recording receipt credits inventory once.</Notice>
    <AsyncState loading={query.isLoading} error={query.error} empty={!query.data?.length} emptyMessage="No deliveries recorded" onRetry={() => void query.refetch()}><div className="table-scroll"><table><caption className="sr-only">Expected and received deliveries</caption><thead><tr><th>Part</th><th>Quantity</th><th>Arrival</th><th>Status</th><th>Reason</th>{canEdit && <th>Review</th>}</tr></thead><tbody>{query.data?.map((item) => <tr key={item.id}><td>{parts.find((part) => part.id === item.part_id)?.name ?? item.part_id}<small className="table-subtitle mono">{item.id} · v{item.version}</small></td><td>{item.quantity}</td><td>Slot {item.arrival_slot}<small className="table-subtitle">{item.arrival_slot * 8} hours from horizon start</small></td><td>{item.status}</td><td>{item.reason}</td>{canEdit && <td>{item.status === "expected" && <button className="secondary" onClick={() => { setReview(item); setOutcomeReason(""); outcome.reset(); }}>Review delivery</button>}</td>}</tr>)}</tbody></table></div></AsyncState>
    {canEdit && <form className="delivery-form" onSubmit={submit}><h3>Record an expected delivery</h3><div className="delivery-fields"><label>Part<select required value={partId} onChange={(event) => setPartId(event.target.value)}><option value="">Select a part</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.name}</option>)}</select></label><label>Quantity<input type="number" required min={1} max={1000000} step={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}/></label><label>Arrival slot<input type="number" required min={0} max={13} step={1} value={slot} onChange={(event) => setSlot(Number(event.target.value))}/></label><label>Reason<input required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)}/></label></div>{create.error && <p role="alert" className="form-error">{create.error.message}</p>}<button disabled={create.isPending || !parts.length}>{create.isPending ? "Recording…" : "Record expected delivery"}</button></form>}
    {review && <form className="delivery-form" onSubmit={(event) => { event.preventDefault(); outcome.mutate("receive"); }}><h3>Review delivery {review.id}</h3><p>Confirming receipt adds {review.quantity} units of {parts.find((part) => part.id === review.part_id)?.name ?? review.part_id} to stock. Existing proposals will need regeneration.</p><label>Outcome reason<input required maxLength={1000} value={outcomeReason} onChange={(event) => setOutcomeReason(event.target.value)}/></label>{outcome.error && <p role="alert" className="form-error">{outcome.error.message}</p>}<div className="dialog-actions"><button type="button" className="secondary" disabled={outcome.isPending} onClick={() => setReview(null)}>Keep reviewing</button><button type="button" className="secondary" disabled={outcome.isPending || !outcomeReason.trim()} onClick={() => outcome.mutate("cancel")}>Cancel expected delivery</button><button disabled={outcome.isPending}>Confirm received stock</button></div></form>}
  </article>;
}
