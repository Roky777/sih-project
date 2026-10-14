import { useActorRole } from "../ops/roles";
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, arrayOf, isJob, isSimulationRun, type Job } from '../../shared/api/client';
import { Notice } from '../../shared/ui/WorkspaceUI';

type Projection = { availability: number; downtime_aircraft_hours: number; resource_wait_hours: number; late_tasks?: number; resource_window_violations?: string[] };
type Case = { name: string; actual: Projection; baseline: Projection | null; downtime_difference_hours: number | null };
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const projection = (v: unknown): v is Projection => object(v) && ['availability', 'downtime_aircraft_hours', 'resource_wait_hours'].every(key => typeof v[key] === 'number' && Number.isFinite(v[key])) && (v.late_tasks === undefined || typeof v.late_tasks === 'number' && Number.isInteger(v.late_tasks) && v.late_tasks >= 0) && (v.resource_window_violations === undefined || Array.isArray(v.resource_window_violations) && v.resource_window_violations.every(item => typeof item === 'string'));
const isCase = (v: unknown): v is Case => object(v) && typeof v.name === 'string' && projection(v.actual) && (v.baseline === null || projection(v.baseline)) && (v.downtime_difference_hours === null || typeof v.downtime_difference_hours === 'number' && Number.isFinite(v.downtime_difference_hours));

export function PlanComparison({ planId }: { planId: string }) {
  const actorRole = useActorRole();
  const canCalculate = actorRole === 'planner' || actorRole === 'supervisor';
  const submit = useMutation({ mutationFn: () => api(`/plans/${encodeURIComponent(planId)}/comparison`, { method: 'POST' }, isJob) });
  const job = useQuery({ queryKey: ['comparison-job', submit.data?.id], queryFn: () => api(`/jobs/${submit.data!.id}`, undefined, isJob), enabled: !!submit.data, refetchInterval: q => ['queued', 'running'].includes((q.state.data as Job | undefined)?.state ?? '') ? 1000 : false });
  const runs = useQuery({ queryKey: ['plan-comparison', planId, job.data?.state], queryFn: () => api(`/scenarios/runs/all?plan_id=${encodeURIComponent(planId)}&limit=10`, undefined, arrayOf(isSimulationRun)) });
  const requestedRun = job.data?.result?.run_id;
  const record = submit.data ? (requestedRun ? runs.data?.find(run => run.id === requestedRun) : undefined) : runs.data?.[0];
  const aligned = record?.metrics.plan_id === planId && typeof record.metrics.plan_sha256 === 'string';
  const cases = aligned && Array.isArray(record.metrics.cases) ? record.metrics.cases.filter(isCase) : [];
  const busy = submit.isPending || !!job.data && ['queued', 'running'].includes(job.data.state);
  return <article className="card plan-comparison"><span className="eyebrow">EVALUATE THIS SAVED PLAN</span><h2>What does this schedule change?</h2><p>Compare this exact proposal with a FIFO schedule using the same tasks, crew, bays and supply assumptions.</p>
    <button disabled={busy || !canCalculate} onClick={() => submit.mutate()}>{busy ? 'Calculating plan comparison…' : 'Compare this saved plan'}</button>
    {(submit.error || job.error || runs.error) && <p role="alert">{(submit.error || job.error || runs.error)?.message}</p>}
    {job.data?.state === 'failed' && <Notice title="Comparison could not finish" tone="warning">Refresh the proposal and inspect its constraints before retrying. No substitute projection is shown.</Notice>}
    {!!cases.length && <><div className="table-scroll"><table><caption>Assumption-based outcomes · downtime in aircraft hours</caption><thead><tr><th>Work-duration assumption</th><th>This plan</th><th>FIFO baseline</th><th>Difference</th></tr></thead><tbody>{cases.map(item => <tr key={item.name}><td>{item.name}{(!!item.actual.late_tasks || !!item.actual.resource_window_violations?.length) && <small className="table-subtitle">Deadline/calendar overrun · revise before execution</small>}</td><td>{item.actual.downtime_aircraft_hours.toFixed(1)} h</td><td>{item.baseline ? `${item.baseline.downtime_aircraft_hours.toFixed(1)} h` : 'No feasible baseline'}</td><td>{item.downtime_difference_hours === null ? 'Unavailable' : `${item.downtime_difference_hours.toFixed(1)} h`}</td></tr>)}</tbody></table></div><p>Negative differences mean less simulated downtime; zero means no modeled improvement. Overrun cases are stress assumptions and do not authorize overtime.</p><details><summary>Inspect assumptions and event timeline</summary><p>{String(record?.metrics.availability_definition)}</p><p>Plan {planId} · snapshot SHA-256 {String(record?.metrics.plan_sha256)}</p><pre>{JSON.stringify(record?.metrics.cases, null, 2)}</pre></details></>}
    <p className="footnote">Simulated scheduled-maintenance grounding and duration sensitivity. No failure-time law or measured fleet benefit is inferred. Cost is unavailable without cost inputs.</p>
  </article>;
}
