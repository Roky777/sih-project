import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, arrayOf, isJob } from "../../shared/api/client";
import { useActorRole } from "./roles";
import { Card, Pill } from "./ui";
import { num, pct } from "./format";
import "./aircraft-registration.css";

type Metrics = { availability: number; downtime_aircraft_hours: number; resource_wait_hours: number; late_tasks: number; completed_tasks: number; resource_window_violations: string[]; trace: unknown[] };
type Assumption = { name: string; actual: Metrics; baseline: Metrics | null; downtime_difference_hours: number | null };
type Wait = { part_readiness_wait_task_hours: number; other_planned_wait_task_hours: number; note: string };
type StudyCase = { name: string; solver: { status: string; diagnostics: string[] }; input: { tasks: { id: string; aircraft_id: string; duration: number; deadline: number }[] }; comparison?: { cases: Assumption[]; baseline_status: string; baseline_diagnostics: string[] }; waiting?: { proposed: Wait; FIFO: Wait } };
type Study = { definition_sha256?: string; version: string; input_sha256: string; method: string; attribution: string; limits: string; cases: StudyCase[] };
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const metrics = (v: unknown): v is Metrics => obj(v) && ["availability", "downtime_aircraft_hours", "resource_wait_hours", "late_tasks", "completed_tasks"].every(k => typeof v[k] === "number" && Number.isFinite(v[k])) && Array.isArray(v.resource_window_violations) && Array.isArray(v.trace);
const validWait = (v: unknown) => obj(v) && ["part_readiness_wait_task_hours", "other_planned_wait_task_hours"].every(k => typeof v[k] === "number" && Number.isFinite(v[k]) && v[k] >= 0) && typeof v.note === "string";
function validStudy(v: unknown): v is Study {
  return obj(v) && ["version", "input_sha256", "method", "attribution", "limits"].every(k => typeof v[k] === "string") && Array.isArray(v.cases) && v.cases.every(c => obj(c) && typeof c.name === "string" && obj(c.solver) && typeof c.solver.status === "string" && Array.isArray(c.solver.diagnostics) && obj(c.input) && Array.isArray(c.input.tasks) && (!c.comparison || obj(c.comparison) && typeof c.comparison.baseline_status === "string" && Array.isArray(c.comparison.cases) && c.comparison.cases.every(a => obj(a) && typeof a.name === "string" && metrics(a.actual) && (a.baseline === null || metrics(a.baseline)))) && (!c.waiting || obj(c.waiting) && validWait(c.waiting.proposed) && validWait(c.waiting.FIFO)));
}
export function AvailabilityStudy() {
  const [params, setParams] = useSearchParams(); const selected = params.get("study_job"); const role = useActorRole();
  const saved = useQuery({ queryKey: ["availability-studies"], queryFn: () => api("/jobs?kind=availability_study&limit=30", undefined, arrayOf(isJob)) });
  const submit = useMutation({ mutationFn: () => api("/evidence/availability-study", { method: "POST" }, isJob), onSuccess: async job => { setParams(p => { const next = new URLSearchParams(p); next.set("study_job", job.id); return next; }); await saved.refetch(); } });
  const job = useQuery({ queryKey: ["availability-study", selected], queryFn: () => api(`/jobs/${encodeURIComponent(selected!)}`, undefined, isJob), enabled: !!selected, refetchInterval: q => ["queued", "running", "cancellation_requested"].includes(q.state.data?.state ?? "") ? 1000 : false });
  const raw = job.data?.kind === "availability_study" ? job.data.result?.study : undefined;
  const study = validStudy(raw) ? raw : null;
  const busy = submit.isPending || ["queued", "running", "cancellation_requested"].includes(job.data?.state ?? "");
  const download = () => { if (!study) return; const url = URL.createObjectURL(new Blob([JSON.stringify({ job_id: selected, ...study }, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "AeroCare-availability-study.json"; a.click(); URL.revokeObjectURL(url); };
  return <section className="availability-study" aria-label="Availability evidence study"><Card title="What changes aircraft availability?" subtitle="Reproducible synthetic evaluation · Scheduling and supply effects are separate">
    <p>Four frozen cases use the real constrained planner and saved-plan simulator: competing work on four aircraft, the same work with a part ready, a single-task tie and an impossible mandatory deadline. No live work, stock or aircraft state is changed.</p>
    <div className="registration-import-actions"><button className="o-btn" disabled={busy || !["planner", "supervisor"].includes(role)} onClick={() => submit.mutate()}>{busy ? "Calculating study…" : "Run availability study"}</button><label>Saved study<select aria-label="Saved availability study" value={selected ?? ""} onChange={e => setParams(p => { const n = new URLSearchParams(p); if (e.target.value) n.set("study_job", e.target.value); else n.delete("study_job"); return n; })}><option value="">Choose a saved run</option>{saved.data?.map(row => <option key={row.id} value={row.id}>{row.id} · {row.state}</option>)}</select></label>{study && <button className="o-btn ghost" onClick={download}>Export inputs and results</button>}</div>
    {!["planner", "supervisor"].includes(role) && <p className="o-note">Planners and supervisors can calculate a study. Other roles can inspect saved runs.</p>}
    {(submit.isError || job.isError || saved.isError) && <p role="alert">{submit.error?.message ?? job.error?.message ?? saved.error?.message}</p>}
    {job.data && <p role="status">Run {job.data.id} · {job.data.state}</p>}
    {job.data?.state === "failed" && <p role="alert">The study failed. Inspect the job and retry; no result is substituted.</p>}
    {Boolean(raw) && !study && <p role="alert">This saved result has an unsupported structure. Submit a fresh study.</p>}
    {study && <><p>{study.method}</p><p className="o-note">{study.attribution}</p><details><summary>Definition, limitations and reproducibility</summary><p>{study.limits}</p><p>Availability = 1 − grounded aircraft-hours / represented aircraft-hours. Overlapping grounding counts once per aircraft. Duration stress cases are assumptions, not confidence intervals.</p><p>Definition {study.version}{study.definition_sha256 ? ` · Code SHA-256 ${study.definition_sha256}` : " · Older run without code hash"} · Input SHA-256 <code style={{ overflowWrap: "anywhere" }}>{study.input_sha256}</code></p></details></>}
  </Card>
  {study?.cases.map(c => <Card key={c.name} title={c.name.replaceAll("_", " ")} subtitle={`${c.input.tasks.length} tasks · Solver: ${c.solver.status}`}>
    {!c.comparison ? <><Pill tone="watch">No usable schedule</Pill><p>{c.solver.diagnostics.join("; ") || (c.solver.status === "infeasible" ? "No schedule satisfies the declared hard constraints. No availability benefit is calculated." : "No usable solver result is available. This does not prove infeasibility.")}</p></> : <><div className="o-table-wrap" tabIndex={0} role="region" aria-label="Availability comparison metrics"><table className="o-table"><thead><tr><th>Duration assumption</th><th>Proposed availability</th><th>FIFO availability</th><th>Proposed downtime</th><th>FIFO downtime</th><th>Difference</th><th>Late tasks proposed / FIFO</th><th>Overrun resource wait proposed / FIFO</th></tr></thead><tbody>{c.comparison.cases.map(a => <tr key={a.name}><td>{a.name}</td><td>{pct(a.actual.availability, 1)}</td><td>{a.baseline ? pct(a.baseline.availability, 1) : "FIFO found no placement"}</td><td>{num(a.actual.downtime_aircraft_hours)} aircraft-h</td><td>{a.baseline ? `${num(a.baseline.downtime_aircraft_hours)} aircraft-h` : "Not compared"}</td><td>{a.baseline ? `${num(a.actual.downtime_aircraft_hours - a.baseline.downtime_aircraft_hours)} aircraft-h` : "Not compared"}</td><td>{a.actual.late_tasks} / {a.baseline?.late_tasks ?? "—"}</td><td>{num(a.actual.resource_wait_hours)} / {a.baseline ? num(a.baseline.resource_wait_hours) : "—"} h</td></tr>)}</tbody></table></div><p className="o-note">Negative downtime difference favours the proposal; zero is a tie; positive favours FIFO. FIFO status: {c.comparison.baseline_status}. A failed placement is not an infeasibility proof.</p>
      {c.waiting && <details><summary>Why did work wait?</summary><p>Proposed part-readiness wait: {num(c.waiting.proposed.part_readiness_wait_task_hours)} task-h; other planned wait: {num(c.waiting.proposed.other_planned_wait_task_hours)} task-h.</p><p>FIFO part-readiness wait: {num(c.waiting.FIFO.part_readiness_wait_task_hours)} task-h; other planned wait: {num(c.waiting.FIFO.other_planned_wait_task_hours)} task-h.</p><p>{c.waiting.proposed.note}</p></details>}
      <details><summary>Inspect exact inputs, assignments and event timelines</summary><pre className="registration-preview">{JSON.stringify(c, null, 2)}</pre></details></>}
  </Card>)}
  </section>;
}
