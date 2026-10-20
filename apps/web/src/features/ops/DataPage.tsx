import { useActorRole } from "./roles";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import { useAsOf } from "./AsOf";
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "../../shared/ui/Icon";
import { useAcknowledgeAlert, useAlerts, useEngine, useIngest, useSources, useRequestEngineRun, type IngestBatch } from "./api";
import { longDate, num } from "./format";
import { Card, EmptyState, PageHead, Pill, Query, Ring, Segmented, useToast } from "./ui";

type Source = { id: string; name: string; owner: string; format: string; identifier_example: string; timestamp_format: string; raw_records: number; duplicates_removed: number; identifiers_remapped: number; rejected_unmappable: number; missing_values: number; accepted_records: number; quality_score: number; stuck_values_flagged?: number; spikes_clipped?: number; linked_to_work_orders?: number; issues_linked_to_work_orders?: number; late_against_promise?: number; unmapped_identifiers?: string[] };
const sourceIcon: Record<string, IconName> = { health_monitoring: "activity", technical_records: "file", spares_inventory: "box", agency_reports: "wrench" };

export function DataPage() {
  const sources = useSources();
  return <>
    <PageHead eyebrow="Account" title="Data & integrations" description="Where the data comes from: four separate systems joined into one record per aircraft, component and part."/>
    <Card title="Live telemetry demonstration" subtitle="Replay timestamped simulated engine cycles through validation, assessment and a data-connected aircraft view." actions={<Link className="o-btn ghost" to="/telemetry">Open live replay →</Link>}><p className="o-small o-muted">A labeled replay adapter; real aircraft interfaces require separate qualification.</p></Card>
    <IngestionProgress/>
    <Query query={sources} rows={8}>{data => {
      const integration = data.integration as { window: { from: string; to: string; days: number }; defects_injected: string; unified_model: Record<string, number>; sources: Source[] };
      return <>
        <div className="o-unified">{Object.entries(integration.unified_model).map(([key, value]) => <div key={key}><b>{num(value)}</b><span>{key.replace(/_/g, " ")}</span></div>)}</div>
        <div className="o-flow" aria-hidden="true"><span>4 source systems</span><Icon name="arrow" size={16}/><span>validate · map IDs · normalise time · de-duplicate · flag quality</span><Icon name="arrow" size={16}/><span>unified fleet model</span><Icon name="arrow" size={16}/><span>features · models · twin</span></div>
        <div className="o-grid o-cols-2">{integration.sources.map(source => <SourceCard key={source.id} source={source}/>)}</div>
        <p className="o-muted o-small" style={{ marginTop: 10 }}>Window {longDate(integration.window.from)} – {longDate(integration.window.to)} ({integration.window.days} days). {integration.defects_injected}.</p>
        <div className="o-grid o-cols-main">
          <IngestCard/>
          <Card title="Ingestion batches" subtitle={`${num(data.ingested_readings)} readings stored in the integration staging table`}>
            {data.batches.length === 0 ? <EmptyState title="No batches yet" icon="database">Submit readings with the tester to exercise validation.</EmptyState> :
              <ul className="o-batch-list">{data.batches.map((batch: IngestBatch) => <li key={batch.id}><span className="o-mono o-strong">{batch.id}</span><small>{batch.source} · {batch.actor} · {longDate(batch.created_at)}</small><span><Pill tone="ok">{batch.accepted} accepted</Pill> <Pill tone={batch.rejected ? "short" : "neutral"}>{batch.rejected} rejected</Pill></span></li>)}</ul>}
          </Card>
        </div>
      </>;
    }}</Query>
  </>;
}

function SourceCard({ source: s }: { source: Source }) {
  const tone = s.quality_score >= 95 ? "healthy" : s.quality_score >= 85 ? "watch" : "degraded";
  const rows: [string, number | undefined][] = [["Raw records", s.raw_records], ["Duplicates removed", s.duplicates_removed], ["Identifiers remapped", s.identifiers_remapped], ["Rejected (unmappable)", s.rejected_unmappable], ["Missing values", s.missing_values], ["Stuck values flagged", s.stuck_values_flagged], ["Spikes clipped", s.spikes_clipped], ["Failures linked to work orders", s.linked_to_work_orders], ["Issues linked to work orders", s.issues_linked_to_work_orders], ["Late against promise", s.late_against_promise], ["Accepted", s.accepted_records]];
  return <Card className="o-source">
    <div className="o-source-head"><span className="o-source-icon"><Icon name={sourceIcon[s.id] ?? "database"} size={20}/></span><div><h3>{s.name}</h3><p>{s.owner} · {s.format}</p></div><Ring value={s.quality_score} size={58} tone={tone} label={`Quality score ${s.quality_score}`}/></div>
    <dl className="o-kv">{rows.filter(([, value]) => value !== undefined).map(([label, value]) => <Fragment key={label}><dt>{label}</dt><dd>{num(value)}</dd></Fragment>)}</dl>
    <div className="o-source-foot"><span>ID example <code>{s.identifier_example}</code></span><span>{s.timestamp_format}</span>{s.unmapped_identifiers && s.unmapped_identifiers.length > 0 && <span className="o-tone-critical">Unmappable: {s.unmapped_identifiers.join(", ")}</span>}</div>
  </Card>;
}

const sample = JSON.stringify({ source: "health_monitoring", readings: [
  { component_id: "AC-017-HYD-PMP", date: "2026-09-30", parameter: "Outlet pressure", unit: "psi", mean: 2902.5, min: 2860, max: 2950, std: 21.4 },
  { component_id: "AC-017-HYD-PMP", date: "2026-09-30", parameter: "Fluid temperature", unit: "°C", mean: 71.2 },
  { component_id: "AC-099-HYD-PMP", date: "2026-09-30", parameter: "Outlet pressure", unit: "psi", mean: 3000 },
  { component_id: "AC-008-ELE-GEN", date: "2026-09-29", parameter: "Voltage ripple", unit: "V", mean: 999 },
] }, null, 2);

function IngestCard() {
  const ingest = useIngest();
  const actorRole = useActorRole();
  const engine = useEngine();
  const toast = useToast();
  const [text, setText] = useState(sample);
  const [error, setError] = useState("");
  const [result, setResult] = useState<IngestBatch | null>(null);
  const allowed = ["planner", "supervisor", "administrator"].includes(actorRole ?? "");
  const submit = () => {
    setError("");
    let body: { source?: string; readings?: unknown[] };
    try { body = JSON.parse(text); } catch { setError("Body is not valid JSON."); return; }
    if (!body || typeof body !== "object" || !Array.isArray(body.readings)) { setError("Expected an object with a \"readings\" array."); return; }
    ingest.mutate({ source: body.source ?? "health_monitoring", readings: body.readings }, { onSuccess: data => { setResult(data); toast({ tone: data.rejected ? "info" : "success", title: `${data.accepted} accepted, ${data.rejected} rejected` }); }, onError: err => setError(err.message) });
  };
  return <Card title="Ingestion API tester" subtitle={`POST /api/fleet-health/ingest/sensor-readings — stands in for a post-flight health-monitoring download. Accepted window ends ${longDate(engine.data?.replay_to)}.`}>
    <label className="o-field"><span className="sr-only">Request body</span><textarea value={text} spellCheck={false} onChange={event => setText(event.target.value)} rows={12}/></label>
    {error && <p className="o-warn-line" role="alert"><Icon name="warning" size={14}/>{error}</p>}
    <div className="o-form-actions" style={{ justifyContent: "space-between" }}><button type="button" className="o-link" onClick={() => { setText(sample); setResult(null); setError(""); }}>Reset sample</button><button type="button" className="o-btn" disabled={!allowed || ingest.isPending} onClick={submit}><Icon name="database" size={15}/>{ingest.isPending ? "Validating…" : "Validate & ingest"}</button></div>
    {result && <div className="o-ingest-result">
      <div><Pill tone="ok">{result.accepted} accepted</Pill> <Pill tone={result.rejected ? "short" : "neutral"}>{result.rejected} rejected</Pill> <span className="o-mono o-small">{result.id}</span></div>
      {result.errors.length > 0 && <table className="o-table o-table-mini"><thead><tr><th>Row</th><th>Field</th><th>Problem</th></tr></thead><tbody>{(result.errors as { row: number; field: string; message: string }[]).map((err, index) => <tr key={index}><td className="num">{err.row}</td><td className="o-mono">{err.field}</td><td>{err.message}</td></tr>)}</tbody></table>}
      <p className="o-muted o-small">Accepted observations retain their batch and quality flags. Supported models queue immutable assessments; processing and recovery states appear above.</p>
    </div>}
    {!allowed && <p className="o-muted o-small">Planners and supervisors can ingest readings.</p>}
  </Card>;
}

export function NotificationsPage() {
  const alerts = useAlerts();
  const acknowledge = useAcknowledgeAlert();
  const toast = useToast();
  const actorRole = useActorRole();
  const [view, setView] = useState<"open" | "all">("open");
  const icons: Record<string, IconName> = { failure_risk: "activity", spare_vs_rul: "box", overdue_inspection: "calendar", backlog: "wrench" };
  return <>
    <PageHead eyebrow="Explore" title="Alerts" description="Warnings that need someone to look: high failure risk, a part that cannot arrive in time, an overdue inspection or too much backlog."
      actions={<Segmented label="Alert view" value={view} onChange={setView} options={[["open", "Unacknowledged"], ["all", "All"]] as const}/>}/>
    <Query query={alerts} rows={6}>{items => { const shown = items.filter(alert => view === "all" || !alert.acknowledged_by); return shown.length === 0 ? <EmptyState title="Nothing needs acknowledgement" icon="check">New alerts appear after each engine run.</EmptyState> :
      <div className="o-alert-grid">{shown.map(alert => <article key={alert.key} className={`o-alert-card ${alert.severity}${alert.acknowledged_by ? " acked" : ""}`}>
        <span className="o-alert-icon"><Icon name={icons[alert.type] ?? "bell"} size={18}/></span>
        <div><div className="o-alert-meta"><Pill tone={alert.severity === "critical" ? "critical" : "watch"}>{alert.severity}</Pill><span>{alert.type.replace(/_/g, " ")}</span><span>{longDate(alert.created_on)}</span></div>
          <h3>{alert.title}</h3><p>{alert.message}</p>
          <div className="o-alert-actions">{alert.component_id && <Link className="o-link" to={`/health/${alert.component_id}`}>Open component<Icon name="arrow" size={13}/></Link>}{alert.aircraft && !alert.component_id && <Link className="o-link" to={`/aircraft/${alert.aircraft}`}>Open aircraft<Icon name="arrow" size={13}/></Link>}
            {alert.acknowledged_by ? <span className="o-muted o-small">Acknowledged by {alert.acknowledged_by}</span> : actorRole !== "viewer" && <button type="button" className="o-btn sm ghost" onClick={() => acknowledge.mutate(alert.key, { onSuccess: () => toast({ tone: "success", title: "Alert acknowledged" }), onError: error => toast({ tone: "error", title: "Could not acknowledge", body: error.message }) })}><Icon name="check" size={13}/>Acknowledge</button>}</div>
        </div>
      </article>)}</div>; }}</Query>
    <p className="o-muted o-small" style={{ marginTop: 14 }}>Alerts are shown in-app only. Email and SMS notification are future scope.</p>
  </>;
}

function IngestionProgress() {
  const query = useQuery({ queryKey: ["ingestion-processes"], queryFn: () => api<{ id: string; component_id: string; dataset: string; state: string; detail: string; job_id: string | null }[]>("/ingestion/processes"), refetchInterval: q => q.state.data?.some(row => ["queued", "assessing"].includes(row.state)) ? 3000 : false });
  const rebuild = useRequestEngineRun();
  const actor = useActorRole();
  const { asOf } = useAsOf();
  return <Card title="Observation → assessment processing" subtitle="Immutable batches, model identity and dataset-specific jobs; unavailable evidence is never replaced with a prediction">
    <Query query={query}>{rows => rows.length ? <div className="o-table-wrap"><table className="o-table"><thead><tr><th>Component</th><th>Dataset</th><th>State</th><th>Processing / recovery</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.component_id}<small>{row.job_id ?? "No job queued"}</small></td><td>{row.dataset}</td><td>{row.state.replaceAll("_", " ")}</td><td>{row.detail}</td></tr>)}</tbody></table></div> : <p>No observation assessment jobs have been submitted.</p>}</Query>
    {actor === "supervisor" && !asOf && <details><summary>Install ingestion support in a new synthetic engine bundle</summary><p>Older bundles keep their saved results. A new run saves fitted feature context required for subsequent readings.</p><button className="o-btn ghost" disabled={rebuild.isPending} onClick={() => rebuild.mutate(42)}>Build new synthetic bundle</button>{rebuild.error && <p role="alert">{rebuild.error.message}</p>}</details>}
  </Card>;
}
