import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, arrayOf, isFleetItem } from "../../shared/api/client";
import { CaseQueue } from "./CaseWorkspace";
import { Card, EmptyState, PageHead, Query, Segmented, Tabs } from "./ui";

const Spatial = lazy(() => import("../inspection/InspectionPage").then(m => ({ default: m.InspectionPage })));

export function ResearchAircraftRegister() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "table" ? "table" : "cards";
  const search = params.get("search") ?? "";
  const query = useQuery({ queryKey: ["fleet"], queryFn: () => api("/fleet", undefined, arrayOf(isFleetItem)) });
  const rows = query.data?.filter(row => `${row.tail_number} ${row.id} ${row.label}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const change = (key: string, value: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set(key, value); return next; }, { replace: true });
  if (params.get("view") === "visual") return <Suspense fallback={<p role="status">Opening illustrative engine inspection…</p>}><Spatial/></Suspense>;
  return <div className="o-screen"><PageHead title="Aircraft" eyebrow="Engine research" description="Verified research mappings; engine evidence and logistics remain separate from the operational fleet"/>
    <div className="o-filters"><label className="o-field">Search records<input className="o-input" value={search} onChange={e => change("search", e.target.value)} placeholder="Aircraft ID or label"/></label><Segmented label="Register view" value={view} onChange={value => change("view", value)} options={[["cards", "Cards"], ["table", "Table"]] as const}/></div>
    <Query query={query}>{() => !rows.length ? <EmptyState title="No matching research aircraft"/> : view === "table" ? <div className="o-table-wrap"><table className="o-table"><thead><tr><th>Aircraft</th><th>Recorded concerns</th><th>Components</th><th>Source</th><th>Action</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.tail_number}<small>{row.label}</small></td><td>{row.open_tasks} open tasks</td><td>{row.components}</td><td>{row.provenance}</td><td><Link className="o-btn sm ghost" to={`/aircraft/${row.id}?dataset=research&return=${encodeURIComponent(`/aircraft?${params}`)}`}>Open aircraft</Link></td></tr>)}</tbody></table></div> : <div className="o-aircraft-grid">{rows.map(row => <Link className="o-aircraft-card" key={row.id} to={`/aircraft/${row.id}?dataset=research&return=${encodeURIComponent(`/aircraft?${params}`)}`}><div className="o-aircraft-card-top"><strong>{row.tail_number}</strong><span>{row.open_tasks} open tasks</span></div><p>{row.label}</p><p>{row.components} verified component mappings · {row.provenance}</p><small>Aggregate aircraft health and flight hours are not established for these research records.</small></Link>)}</div>}</Query>
  </div>;
}

export function ResearchAircraftDetail() {
  const { aircraftId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "summary";
  const query = useQuery({ queryKey: ["fleet"], queryFn: () => api("/fleet", undefined, arrayOf(isFleetItem)) });
  const selected = query.data?.find(row => row.id === aircraftId);
  useEffect(() => { if (selected && params.get("aircraft") !== selected.id) setParams(previous => { const next = new URLSearchParams(previous); next.set("aircraft", selected.id); return next; }, { replace: true }); }, [selected, params, setParams]);
  return <div className="o-screen"><PageHead eyebrow="Engine research" title={selected?.tail_number ?? aircraftId} description="Research records and synthetic logistics · not operational fleet availability"/>
    <Tabs value={tab} onChange={value => setParams(previous => { const next = new URLSearchParams(previous); next.set("tab", value); return next; })} tabs={[["summary", "Summary"], ["components", "Components"], ["maintenance", "Maintenance"], ["history", "History"], ["visual", "Visual inspection"]] as const}/>
    <Query query={query}>{() => !selected ? <EmptyState title="Aircraft record unavailable"><Link to="/aircraft?dataset=research">Return to research register</Link></EmptyState> : tab === "visual" ? <Suspense fallback={<p role="status">Opening visual inspection…</p>}><Spatial embedded/></Suspense> : tab === "components" ? <Card title="Component register">{selected.component_ids.map(id => <p key={id}><Link className="o-btn ghost" to={`/components/${id}?dataset=research`}>{id} · Open evidence</Link></p>)}</Card> : <><Card title={tab === "summary" ? selected.label : tab === "history" ? "Recorded case history" : "Linked maintenance"}><p>{selected.components} component mappings · {selected.open_tasks} open tasks · {selected.provenance}</p><p>Availability, expected return, and an operational owner are not established in this research mapping.</p></Card><CaseQueue dataset="engine-research" scopeAircraft={aircraftId}/></>}</Query>
  </div>;
}
