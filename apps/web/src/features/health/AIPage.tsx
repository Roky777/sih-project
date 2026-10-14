import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api, arrayOf, isComponentDetail, isFleetItem } from "../../shared/api/client";
import { AsyncState } from "../../shared/ui/AsyncState";
import { PageHeader } from "../../shared/ui/WorkspaceUI";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { ModelEvidence } from "./ModelEvidence";

export function AIPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [params, setParams] = useSearchParams();
  const fleet = useQuery({ queryKey: ["fleet"], queryFn: () => api("/fleet", undefined, arrayOf(isFleetItem)) });
  const components = fleet.data?.flatMap(aircraft => aircraft.component_ids.map(id => ({ id, aircraft }))) ?? [];
  const selected = components.find(item => item.id === params.get("component")) ?? components[0];
  const detail = useQuery({
    queryKey: ["component", selected?.id],
    queryFn: () => api(`/components/${encodeURIComponent(selected!.id)}`, undefined, isComponentDetail),
    enabled: !!selected,
  });
  const aligned = detail.data?.id === selected?.id && detail.data?.aircraft_id === selected?.aircraft.id;

  return <section className="ai-page">
    <PageHeader level={embedded ? "section" : "page"} eyebrow="AI IN THIS WORKSPACE" title="Turn engine data into maintenance decisions" description="A deteriorating engine needs attention, but a health concern alone does not tell a team when to act or whether parts and crew are available."/>
    <div className="ai-capabilities">
      <article><span className="eyebrow">01 · MACHINE LEARNING</span><h2>Estimate remaining engine life</h2><p>The trained predictor uses supported sensor history to estimate remaining useful life in operating cycles, with a calibrated prediction range. This helps reviewers judge how much time may remain and how uncertain the estimate is.</p><p>Current support: public simulated NASA C-MAPSS FD001 engine histories. A supported, registered model and eligible history are required; insufficient evidence can withhold the estimate.</p></article>
      <article><span className="eyebrow">02 · EVIDENCE & ALERT RULES</span><h2>Explain what needs review</h2><p>Sensor history, model-input influences and data-quality findings make the estimate inspectable. Versioned alert rules use assessment history to flag concerns and reduce repeated changes near a threshold.</p><Link className="text-link" to="/alerts">Review recorded alerts</Link></article>
      <article><span className="eyebrow">03 · OPTIMIZATION & SIMULATION</span><h2>Find a practical maintenance option</h2><p>The constraint solver checks task windows, crew capacity, parts and existing commitments. What-if simulation compares projected downtime under explicit logistics assumptions. These are separate calculations from the life predictor.</p><div className="ai-links"><Link className="text-link" to="/planning">Review maintenance proposals</Link><Link className="text-link" to="/scenarios">Compare simulated outcomes</Link></div></article>
    </div>
    <div className="ai-boundary"><h2>Evidence supports a human decision</h2><p>Model influences describe prediction behaviour, not confirmed mechanical faults. A prediction interval is not an individual engine’s failure probability. Mandatory maintenance remains authoritative, and a supervisor reviews approval. Fleet mappings and logistics are synthetic; scenario outcomes are simulated projections. Independent alert validation and broader scientific acceptance remain incomplete.</p></div>
    <div className="section-heading"><div><h2>Inspect the AI’s recorded output</h2><p>These records come from the workspace API. Select a component to see its saved estimate, input version, model and explanation availability.</p></div></div>
    <AsyncState loading={fleet.isLoading} error={fleet.error} empty={!components.length} emptyMessage="No mapped components available" onRetry={() => void fleet.refetch()}>
      <div className="ai-component-picker"><label htmlFor="ai-component">Component record</label><select id="ai-component" value={selected?.id ?? ""} onChange={event => setParams({ component: event.target.value })}>{components.map(item => <option key={item.id} value={item.id}>{item.aircraft.tail_number} · {item.id}</option>)}</select></div>
      <AsyncState loading={detail.isLoading} error={detail.error} onRetry={() => void detail.refetch()}>
        {detail.data && (aligned ? <>
          <p>{detail.data.serial_number} · {detail.data.kind} · Recorded cycle {detail.data.current_cycle}</p>
          <StatusBadge status={detail.data.assessment?.state ?? 'unavailable'}/>
          {detail.data.assessment?.quality_findings.map(finding => <p className="quality-finding" key={finding.code}>{finding.message}</p>)}
          {!detail.data.assessment && <p>No assessment is recorded for this component. No life estimate is substituted.</p>}
          <ModelEvidence assessment={detail.data.assessment} componentId={detail.data.id}/>
          <Link className="button-secondary" to={`/components/${encodeURIComponent(detail.data.id)}`}>Inspect sensor history & quality</Link>
        </> : <p role="alert">Returned evidence does not match the selected component and aircraft. Refresh before use.</p>)}
      </AsyncState>
    </AsyncState>
  </section>;
}
