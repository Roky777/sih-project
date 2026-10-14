import {useState} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, arrayOf, isJob, isScenario, isSimulationRun, type Job, type Scenario, type SimulationRun } from "../../shared/api/client";
import { AsyncState } from "../../shared/ui/AsyncState";
import { Icon } from "../../shared/ui/Icon";
import { Notice, PageHeader, RefreshButton } from "../../shared/ui/WorkspaceUI";
import { JobProgress } from "../jobs/JobProgress";
import { ScenarioComparison } from "./ScenarioComparison";
import { ScenarioEditor, type ScenarioRevisionInput } from "./ScenarioEditor";
export function ScenariosPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [selectedId,setSelectedId]=useState('');
  const client = useQueryClient();
  const scenarios = useQuery({ queryKey:["scenarios"], queryFn: () => api<Scenario[]>("/scenarios", undefined, arrayOf(isScenario)) });
  const runs = useQuery({ queryKey:["scenario-runs"], queryFn: () => api<SimulationRun[]>("/scenarios/runs/all", undefined, arrayOf(isSimulationRun)) });
  const revise = useMutation({ mutationFn: ({id,input}:{id:string;input:ScenarioRevisionInput}) => api<Scenario>(`/scenarios/${encodeURIComponent(id)}/revisions`, {method:"POST",body:JSON.stringify(input)},isScenario), onSuccess:(saved)=>{setSelectedId(saved.id);return client.invalidateQueries({queryKey:["scenarios"]});} });
  const selected=scenarios.data?.find(item=>item.id===selectedId)??scenarios.data?.[0];
  const run = useMutation({ mutationFn:(id:string) => api<Job>(`/jobs/simulation/${id}`, { method:"POST" }, isJob), onSuccess: () => client.invalidateQueries({ queryKey:["jobs"] }) });
  return <section><PageHeader level={embedded ? "section" : "page"} eyebrow="WHAT-IF ANALYSIS" title="Scenario analysis" description="Explore how explicit maintenance and capacity assumptions affect projected aircraft-time availability." actions={<RefreshButton fetching={scenarios.isFetching || runs.isFetching} onClick={() => { void scenarios.refetch(); void runs.refetch(); }}/>}/>
    <Notice title="Simulated projections">These results describe synthetic scenarios. Aircraft-time availability is the proportion of available aircraft-hours within the configured horizon.</Notice>
    <div className="section-heading"><div><h2>Scenario inputs</h2><p>Each calculation retains its scenario identity, assumptions and seed.</p></div><span className="source-tag"><Icon name="file" size={14}/>Synthetic assumptions</span></div>
    {(run.error || revise.error) && <div className="state error" role="alert">{(run.error || revise.error)?.message}</div>}
    {revise.isSuccess && <Notice title="New scenario revision saved">The original assumptions and outcomes remain unchanged. Run the new revision to compare actual projected outcomes.</Notice>}
    <AsyncState loading={scenarios.isLoading} error={scenarios.error} empty={!scenarios.data?.length} onRetry={() => void scenarios.refetch()}><div className="scenario-register"><label htmlFor="scenario-editor-picker">Scenario revision</label><select id="scenario-editor-picker" value={selected?.id??''} onChange={event=>setSelectedId(event.target.value)}>{scenarios.data?.map(item=><option key={item.id} value={item.id}>{item.name} · v{item.version} · {item.id}</option>)}</select></div><div className="scenario-grid">{selected&&<ScenarioEditor key={selected.id} scenario={selected} pending={run.isPending} submitting={run.isPending && run.variables===selected.id} onRun={(id) => run.mutate(id)} onRevise={(id,input)=>revise.mutate({id,input})} revisionPending={revise.isPending}/>}</div></AsyncState>
    <div className="section-heading"><div><h2>Recorded outcomes</h2><p>Actual simulation results, with separate records for each run.</p></div></div><ScenarioComparison runs={runs.data} scenarios={scenarios.data} loading={runs.isLoading} error={runs.error} onRetry={() => void runs.refetch()}/>
    <div className="section-heading"><h2>Calculation activity</h2><span className="muted">Updated automatically</span></div><JobProgress kind="simulation"/>
  </section>;
}
