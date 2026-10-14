import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../shared/api/client";
import { useActorRole } from "./roles";
import { Card, Query } from "./ui";

type Capacity = { id: string; crew_capacity: number; bay_capacity: number; capabilities: string[]; version: number; provenance: string };
const valid = (value: unknown): value is Capacity[] => Array.isArray(value) && value.every(item => item && typeof item.id === "string" && typeof item.crew_capacity === "number" && typeof item.bay_capacity === "number" && typeof item.version === "number" && Array.isArray(item.capabilities) && item.capabilities.every((key: unknown) => typeof key === "string"));
export function CapacitySettings() {
  const query = useQuery({ queryKey: ["fleet-capacity"], queryFn: () => api("/workspace/capacity", undefined, valid) });
  const client = useQueryClient();
  const role = useActorRole();
  const allowed = ["supervisor", "administrator"].includes(role);
  const setup = useMutation({ mutationFn: () => api("/workspace/capacity/initialize", { method: "POST" }, valid), onSuccess: () => client.invalidateQueries() });
  return <Card title="Operational resource assumptions" subtitle="Synthetic crew and bay capacity; this configuration does not establish real aircraft qualifications">
    {setup.error && <p role="alert">{setup.error.message}</p>}
    <Query query={query}>{items => items.length ? items.map(item => <CapacityForm key={`${item.id}-${item.version}`} item={item} allowed={allowed}/>) : <><p>No operational resource capacity has been configured. Plans cannot be committed without explicit resources.</p>{allowed && <button className="o-btn" disabled={setup.isPending} onClick={() => setup.mutate()}>Use documented synthetic catalogue capacities</button>}</>}</Query>
  </Card>;
}
function CapacityForm({ item, allowed }: { item: Capacity; allowed: boolean }) {
  const [crew, setCrew] = useState(item.crew_capacity), [bays, setBays] = useState(item.bay_capacity);
  const [skills, setSkills] = useState(item.capabilities.join(", ")), [reason, setReason] = useState("");
  const client = useQueryClient();
  const save = useMutation({ mutationFn: () => api(`/workspace/capacity/${item.id}`, { method: "PATCH", body: JSON.stringify({ crew_capacity: crew, bay_capacity: bays, capabilities: skills.split(",").map(value => value.trim()).filter(Boolean), expected_version: item.version, reason }) }, valid), onSuccess: () => client.invalidateQueries() });
  return <form className="case-review-form" onSubmit={event => { event.preventDefault(); save.mutate(); }}><h3>{item.id}</h3><p>{item.provenance} · version {item.version}</p>
    <div className="o-grid o-cols-2"><label>Crew units<input className="o-input" type="number" min={0} max={20} disabled={!allowed} value={crew} onChange={event => setCrew(Number(event.target.value))}/></label><label>Bay units<input className="o-input" type="number" min={0} max={20} disabled={!allowed} value={bays} onChange={event => setBays(Number(event.target.value))}/></label></div>
    <label>Eligible component codes<input className="o-input" value={skills} disabled={!allowed} onChange={event => setSkills(event.target.value)}/></label>
    {allowed && <><label>Reason for change<input className="o-input" required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}/></label><button className="o-btn" disabled={save.isPending || !reason.trim()}>Save current capacity version</button></>}
    {save.error && <p role="alert">{save.error.message}</p>}
    <p className="o-muted">Existing commitments stay protected. Changes invalidate unapproved proposal inputs.</p>
  </form>;
}
