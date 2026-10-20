import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "../../shared/ui/Icon";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../shared/api/client";
import { useActorRole } from "./roles";
import { useAsOf } from "./AsOf";
import { longDate, num } from "./format";
import { Card, PageHead, Pill, Query } from "./ui";
import "./aircraft-registration.css";

type Installed = { id: string; serial_number: string; kind: string; position: string; installed_on: string };
type SourceRecord = { id: string; source: string; kind: string; effective_date: string; payload: { title?: string; notes?: string; due_date?: string; flight_hours?: number; cycles?: number } };
type Registration = { id: string; tail_number: string; serial_number: string; aircraft_type: string; base: string; fleet_entry_date: string; as_of: string; flight_hours: number | null; cycles: number | null; components: Installed[]; records: SourceRecord[]; limitations: string };
type RegistrationSummary = Pick<Registration, "id" | "tail_number" | "serial_number" | "aircraft_type" | "base" | "fleet_entry_date" | "as_of"> & { component_count: number };
type Registry = { items: RegistrationSummary[]; total: number; unknown_availability: number; as_of: string };
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: Record<string, unknown>, keys: string[]) => keys.every(k => typeof v[k] === "string");
const numeric = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const valid = (v: unknown): v is Registration => object(v)
  && strings(v, ["id", "tail_number", "serial_number", "aircraft_type", "base", "fleet_entry_date", "as_of", "limitations"])
  && (v.flight_hours === null || numeric(v.flight_hours)) && (v.cycles === null || numeric(v.cycles) && Number.isInteger(v.cycles))
  && Array.isArray(v.components) && v.components.every(c => object(c) && strings(c, ["id", "serial_number", "kind", "position", "installed_on"]))
  && Array.isArray(v.records) && v.records.every(r => object(r) && strings(r, ["id", "source", "kind", "effective_date"]) && object(r.payload)
    && ["title", "notes", "due_date"].every(k => r.payload && object(r.payload) && (r.payload[k] == null || typeof r.payload[k] === "string")));
const validRegistry = (v: unknown): v is Registry => object(v) && Array.isArray(v.items) && v.items.every(r => object(r) && strings(r, ["id", "tail_number", "serial_number", "aircraft_type", "base", "fleet_entry_date", "as_of"]) && numeric(r.component_count)) && numeric(v.total) && numeric(v.unknown_availability) && typeof v.as_of === "string";
export function useRegisteredAircraft(offset = 0, search = "") {
  const { asOf } = useAsOf();
  return useQuery({ queryKey: ["aircraft-registry", asOf, offset, search], queryFn: () => api(`/aircraft-registry?limit=25&offset=${offset}&q=${encodeURIComponent(search)}${asOf ? `&as_of=${asOf}` : ""}`, undefined, validRegistry) });
}
function useCanRegister() {
  const role = useActorRole(); const { asOf } = useAsOf();
  return !asOf && ["engineer", "planner", "supervisor", "administrator"].includes(role ?? "");
}
export function RegistrationCoverage() {
  const registry = useRegisteredAircraft();
  if (registry.isError) return <p role="alert" className="o-note">Aircraft onboarding records unavailable. <button className="o-link" onClick={() => void registry.refetch()}>Retry</button></p>;
  if (!registry.data?.total) return null;
  return <aside className="registration-coverage" aria-label="Fleet coverage"><div><strong>{registry.data.total} registered aircraft awaiting assessment</strong><details><summary>How fleet coverage is counted</summary><p>User-entered records as of {longDate(registry.data.as_of)} have unknown availability. They are excluded from the monitored demonstration fleet's availability denominator and forecast.</p></details></div><Link className="o-link" to="/aircraft?filter=onboarding">Review onboarding →</Link></aside>;
}
export function AircraftRegistrationAction() {
  const canWrite = useCanRegister();
  return <Dialog.Root><Dialog.Trigger asChild><button type="button" className="o-btn" disabled={!canWrite} title={!canWrite ? "Requires an authorised registration role outside historical replay" : undefined}>Add aircraft</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="o-overlay"/><Dialog.Content className="registration-dialog" aria-describedby="registration-dialog-description"><header><div><Dialog.Title>Add aircraft</Dialog.Title><Dialog.Description id="registration-dialog-description">Create an identity, then connect components and source records.</Dialog.Description></div><Dialog.Close asChild><button type="button" className="o-btn ghost" aria-label="Close registration"><Icon name="close" size={18}/></button></Dialog.Close></header><AircraftRegistrationForm/></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function RegisteredAircraftSection({ only = false, search = "" }: { only?: boolean; search?: string }) {
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [search]);
  const registry = useRegisteredAircraft(offset, search);
  const rows = registry.data?.items ?? [];
  if (!only && registry.isSuccess && !registry.data.total) return null;
  return <section className="registered-aircraft-section" aria-label="Aircraft onboarding">
    <header><div><h2>{only ? "Aircraft onboarding" : "Awaiting assessment"}{registry.data && <small> {registry.data.total}</small>}</h2><p>User-entered aircraft · Complete components and source records before assessment.</p></div></header>
    {registry.isError && <p role="alert">Could not load registered aircraft. <button className="o-link" onClick={() => void registry.refetch()}>Retry</button></p>}
    {registry.isPending && <p role="status">Loading registrations…</p>}
    {rows.length ? <div className="o-table-wrap"><table className="o-table"><thead><tr><th>Aircraft</th><th>Family / base</th><th>Fleet entry</th><th>Evidence</th><th>Next step</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><Link className="o-link" to={`/aircraft/registered/${row.id}`}>{row.tail_number}</Link><small className="registration-secondary">Serial {row.serial_number}</small></td><td>{row.aircraft_type}<small className="registration-secondary">{row.base}</small></td><td>{longDate(row.fleet_entry_date)}</td><td><Pill tone="neutral">Not assessed</Pill><small className="registration-secondary">Availability unknown · {row.component_count} {row.component_count === 1 ? "component" : "components"}</small></td><td><Link className="o-link" to={`/aircraft/registered/${row.id}`}>Complete onboarding →</Link></td></tr>)}</tbody></table></div> : !registry.isPending && !registry.isError && <p className="o-note">{search ? "No registered aircraft match this search." : "No aircraft awaiting onboarding. Use Add aircraft to register one."}</p>}
    {registry.data && registry.data.total > 25 && <nav className="registration-import-actions" aria-label="Registered aircraft pages"><button className="o-btn ghost" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 25))}>Previous</button><span>{offset + 1}–{Math.min(offset + 25, registry.data.total)} of {registry.data.total}</span><button className="o-btn ghost" disabled={offset + 25 >= registry.data.total} onClick={() => setOffset(value => value + 25)}>Next</button></nav>}
  </section>;
}

function AircraftRegistrationForm() {
  const cache = useQueryClient(); const navigate = useNavigate();
  const mutation = useMutation({ mutationFn: (body: object) => api<{ id: string }>("/aircraft-registry", { method: "POST", body: JSON.stringify(body) }), onSuccess: async row => { await cache.invalidateQueries({ queryKey: ["aircraft-registry"] }); navigate(`/aircraft/registered/${row.id}`); } });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); mutation.mutate(Object.fromEntries(form)); }
  return <form className="registration-form" onSubmit={submit}><h3>Register an aircraft</h3><p>Registration creates a record, not a health score or operational clearance.</p><div className="registration-fields">
    <label>Tail / registration number<input name="tail_number" required minLength={2} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9-]+" placeholder="VT-EXAMPLE"/></label>
    <label>Airframe serial number<input name="serial_number" required maxLength={80}/></label>
    <label>Aircraft type<input name="aircraft_type" required minLength={2} maxLength={100} placeholder="Manufacturer and model"/></label>
    <label>Base<input name="base" required maxLength={80}/></label>
    <label>Fleet entry date<input type="date" name="fleet_entry_date" required/></label>
  </div>{mutation.isError && <p role="alert">{mutation.error.message}</p>}<button className="o-btn" disabled={mutation.isPending}>{mutation.isPending ? "Registering…" : "Save aircraft"}</button></form>;
}
export function RegisteredAircraftDetail() {
  const { registrationId = "" } = useParams(); const { asOf } = useAsOf(); const canWrite = useCanRegister(); const cache = useQueryClient();
  const endpoint = `/aircraft-registry/${encodeURIComponent(registrationId)}`;
  const query = useQuery({ queryKey: ["registered-aircraft", registrationId, asOf], queryFn: () => api(`${endpoint}${asOf ? `?as_of=${asOf}` : ""}`, undefined, valid) });
  const refresh = async () => { await cache.invalidateQueries({ queryKey: ["registered-aircraft", registrationId] }); await cache.invalidateQueries({ queryKey: ["aircraft-registry"] }); };
  const install = useMutation({ mutationFn: (body: object) => api(`${endpoint}/components`, { method: "POST", body: JSON.stringify(body) }), onSuccess: refresh });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); install.mutate(Object.fromEntries(new FormData(event.currentTarget))); }
  return <><Link className="o-link" to="/aircraft?filter=onboarding">← Aircraft register</Link><Query query={query} rows={5}>{row => <>
    <PageHead eyebrow="Aircraft onboarding · User-entered records" title={row.tail_number} description={`${row.aircraft_type} · ${row.base} · Serial ${row.serial_number}`}/>
    <div className="registration-status"><Pill tone="neutral">Not assessed</Pill><span>Availability unknown</span><span>Fleet entry {longDate(row.fleet_entry_date)}</span><span>Records through {longDate(row.as_of)}</span></div>
    <p className="o-note">{row.limitations}</p>
    <div className="registration-usage"><div><strong>{row.flight_hours === null ? "Not recorded" : `${num(row.flight_hours)} h`}</strong><span>Recorded flight hours</span></div><div><strong>{row.cycles === null ? "Not recorded" : num(row.cycles)}</strong><span>Recorded cycles</span></div></div>
    <Card title="Installed components" subtitle="These identities link source records; no prediction model is qualified by registration.">
      {row.components.length ? <div className="o-table-wrap"><table className="o-table"><thead><tr><th>Component</th><th>Serial</th><th>Position</th><th>Installed</th></tr></thead><tbody>{row.components.map(c => <tr key={c.id}><td>{c.kind}<small className="registration-secondary">{c.id}</small></td><td>{c.serial_number}</td><td>{c.position}</td><td>{longDate(c.installed_on)}</td></tr>)}</tbody></table></div> : <p>No installed components recorded.</p>}
      {canWrite && <details className="registration-component-form"><summary>Add installed component</summary><form className="registration-form" onSubmit={submit}><div className="registration-fields"><label>Component type<input name="kind" required minLength={2} maxLength={80}/></label><label>Serial number<input name="serial_number" required maxLength={80}/></label><label>Installation position<input name="position" required maxLength={80} placeholder="Engine 1"/></label><label>Installed on<input name="installed_on" type="date" required/></label></div>{install.isError && <p role="alert">{install.error.message}</p>}{install.isSuccess && <p role="status">Component registered.</p>}<button className="o-btn" disabled={install.isPending}>{install.isPending ? "Saving…" : "Save component"}</button></form></details>}
    </Card>
    <AircraftRecordsImport key={endpoint} endpoint={endpoint} canWrite={canWrite} refresh={refresh}/>
    <Card title="Source records and mandatory requirements" subtitle="Immutable source history. Requirements remain visible without model predictions; execution must use a validated maintenance workflow.">{row.records.length ? <ul className="registration-source-list">{row.records.map(r => <li key={r.id}><div><strong>{r.kind === "usage" ? `Usage: ${r.payload.flight_hours} h / ${r.payload.cycles} cycles` : r.payload.title}</strong><span>{r.kind.replaceAll("_", " ")}{r.payload.due_date ? ` · Due ${longDate(r.payload.due_date)}` : ""}</span>{r.payload.notes && <p>{r.payload.notes}</p>}</div><small>{longDate(r.effective_date)} · {r.source}</small></li>)}</ul> : <p>No usage, technical history or mandatory requirements have been imported.</p>}</Card>
  </>}</Query></>;
}
function AircraftRecordsImport({ endpoint, canWrite, refresh }: { endpoint: string; canWrite: boolean; refresh: () => Promise<void> }) {
  const [source, setSource] = useState(""); const [text, setText] = useState(""); const [fileError, setFileError] = useState("");
  const [validatedInput, setValidatedInput] = useState<string | null>(null);
  const fileRead = useRef(0);
  const inputRevision = useRef(0);
  const inputIdentity = JSON.stringify([source, text]);
  const previewed = validatedInput === inputIdentity;
  const mutation = useMutation({ mutationFn: async (input: { source: string; text: string; preview: boolean; revision: number }) => {
    const records: unknown = JSON.parse(input.text); if (!Array.isArray(records)) throw new Error("The file must contain a JSON array of records.");
    return api<{ accepted: number; duplicates: number; preview: boolean }>(`${endpoint}/records`, { method: "POST", body: JSON.stringify({ source: input.source, records, preview: input.preview }) });
  }, onSuccess: async (result, input) => { if (input.revision === inputRevision.current) setValidatedInput(result.preview ? JSON.stringify([input.source, input.text]) : null); if (!result.preview) await refresh(); } });
  const resultMatchesInput = mutation.variables && JSON.stringify([mutation.variables.source, mutation.variables.text]) === inputIdentity;
  const reset = () => { inputRevision.current += 1; setValidatedInput(null); mutation.reset(); };
  const template = () => { const body = JSON.stringify([{ kind: "usage", effective_date: "2026-10-14", flight_hours: 1250, cycles: 600 }, { kind: "maintenance_requirement", effective_date: "2026-10-14", title: "Recorded inspection requirement", due_date: "2026-11-14", notes: "Replace sample values with actual source records." }], null, 2); const url = URL.createObjectURL(new Blob([body], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "AeroCare-aircraft-records-template.json"; a.click(); URL.revokeObjectURL(url); };
  return <Card title="Import source records" subtitle="Supported JSON template · Validate before saving · Atomic import with duplicate detection"><div className="registration-form"><button className="o-link" onClick={template}>Download record template</button><label>Source / document reference<input value={source} maxLength={120} onChange={e => { setSource(e.target.value); reset(); }} disabled={!canWrite} placeholder="Technical log revision or source system"/></label><label>Upload JSON records<input type="file" accept=".json,application/json" disabled={!canWrite} onChange={async e => { reset(); setFileError(""); setText(""); const read = ++fileRead.current; const file = e.target.files?.[0]; if (!file) return; if (file.size > 500000) { setFileError("Choose a JSON file under 500 KB."); setText(""); return; } try { const content = await file.text(); if (read === fileRead.current) setText(content); } catch { if (read === fileRead.current) setFileError("The file could not be read. Choose it again."); } }}/></label>{fileError && <p role="alert">{fileError}</p>}{text && <details><summary>Inspect imported content</summary><pre className="registration-preview">{text}</pre></details>}{mutation.isError && <p role="alert">{mutation.error.message}</p>}{mutation.data && resultMatchesInput && <p role="status">{mutation.data.preview ? "Preview" : "Saved"}: {mutation.data.accepted} records; {mutation.data.duplicates} duplicates skipped. No predictions inferred.</p>}<div className="registration-import-actions"><button className="o-btn ghost" disabled={!canWrite || !text || !source.trim() || mutation.isPending} onClick={() => mutation.mutate({ source, text, preview: true, revision: inputRevision.current })}>Validate import</button><button className="o-btn" disabled={!canWrite || !previewed || mutation.isPending} onClick={() => mutation.mutate({ source, text, preview: false, revision: inputRevision.current })}>{mutation.isPending ? "Processing…" : "Save validated records"}</button></div></div></Card>;
}
