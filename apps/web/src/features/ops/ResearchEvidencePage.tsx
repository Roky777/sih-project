import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../shared/api/client";
import { Card, EmptyState, Pill, Query } from "./ui";
import { OpsChart, baseAxes, tooltip } from "./OpsChart";
import { isDrawingEvidence, isResearchIndex, isResearchReport, type ResearchEngine } from "./researchEvidenceApi";
import "./research-evidence.css";

export function ResearchEvidencePage({ drawings = false }: { drawings?: boolean }) {
  const [params, setParams] = useSearchParams();
  const subset = ["FD001", "FD002", "FD003", "FD004"].includes(params.get("subset") ?? "") ? params.get("subset")! : "FD002";
  const index = useQuery({ queryKey: ["research-benchmarks"], queryFn: () => api("/evidence/research", undefined, isResearchIndex), enabled: !drawings, retry: false });
  const report = useQuery({ queryKey: ["research-benchmark", subset], queryFn: () => api(`/evidence/research/${subset}`, undefined, isResearchReport), enabled: !drawings, retry: false });
  const register = useQuery({ queryKey: ["drawing-evidence"], queryFn: () => api("/evidence/drawings", undefined, isDrawingEvidence), enabled: drawings });
  const aligned = report.data?.subset === subset ? report.data : null;
  const engineId = params.get("engine") ?? aligned?.engines[0]?.engine_id;
  const engine = aligned?.engines.find(row => row.engine_id === engineId);
  const select = (key: string, value: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set(key, value); if (key === "subset") next.delete("engine"); return next; });
  const exportReport = () => {
    if (!aligned) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(aligned, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `${subset}-research-evidence.json`; a.click(); URL.revokeObjectURL(url);
  };
  if (drawings) return <Card title="Component-to-drawing evidence register" subtitle="Authored demo mappings · no approved aircraft installation is claimed">
    <p>The catalogue assembly below is illustrative. Drawing references, revisions and independent reviewers remain pending. Maintenance narratives are case-study material, not verified failure labels.</p>
    <Query query={register}>{rows => !rows.length ? <EmptyState title="No drawing evidence registered"/> : <div className="o-table-wrap"><table className="o-table"><thead><tr><th>Model family</th><th>Component reference</th><th>Drawing</th><th>Drawing revision</th><th>Verification</th><th>Reviewer</th><th>Mapping source</th></tr></thead><tbody>{rows.map(row => <tr key={row.model_family}><td>{row.model_family.toUpperCase()}</td><td>{row.component_reference}</td><td>{row.drawing_reference ?? "Pending"}</td><td>{row.drawing_revision ?? "Pending"}</td><td><Pill tone="watch">{row.verification_status}</Pill></td><td>{row.reviewer ?? "Pending"}</td><td>{row.mapping_reference}</td></tr>)}</tbody></table></div>}</Query>
  </Card>;
  return <section className="research-evidence" aria-label="Multi-dataset engine research">
    <Card title="FD001–FD004 prediction evidence" subtitle="NASA simulated engine histories · RUL in cycles · research only">
      <p>Each subset has its own model and preprocessing. FD001 is the retained, previously inspected historical benchmark; it uses a different model/protocol. These rows describe separate experiments, not a controlled ranking across datasets.</p>
      <Query query={index}>{data => !data.summaries.length ? <EmptyState title="No evaluated dataset reports installed"/> : <div className="o-table-wrap" tabIndex={0} role="region" aria-label="Dataset evaluation results"><table className="o-table"><thead><tr><th>Subset</th><th>Evidence</th><th>Conditions / fault modes</th><th>Train / test engines</th><th>Fit / validation / calibration</th><th>Evaluated / withheld</th><th>MAE (cycles)</th><th>RMSE (cycles)</th><th>Model</th></tr></thead><tbody>{data.summaries.map(s => <tr key={s.subset}><td><button type="button" className="o-link" onClick={() => select("subset", s.subset)}>{s.subset}</button></td><td>{s.evidence_status === "historical_inspected" ? "Historical · inspected" : "Separate research evaluation"}</td><td>{s.operating_conditions} / {s.fault_modes}</td><td>{s.train_engine_count} / {s.test_engine_count}</td><td>{["fit", "validation", "calibration"].map(k => s.split_counts[k] ?? "Not retained").join(" / ")}</td><td>{s.capped_primary.count} / {s.withheld_count}</td><td>{s.capped_primary.mae_cycles.toFixed(2)}</td><td>{s.capped_primary.rmse_cycles.toFixed(2)}</td><td>{s.model_version}</td></tr>)}</tbody></table></div>}</Query>
      <p className="o-note">Primary errors use a 125-cycle capped target and include eligible test endpoints only. Short histories are withheld and counted. Full uncapped errors and protocols are available below and in the export.</p>
    </Card>
    <Card title="Inspect a recorded benchmark prediction" subtitle="Saved test-endpoint evidence · not a live aircraft assessment">
      <div className="research-evidence-controls"><label className="o-field">Dataset<select aria-label="Research dataset" value={subset} onChange={e => select("subset", e.target.value)}>{["FD001", "FD002", "FD003", "FD004"].map(s => <option key={s}>{s}</option>)}</select></label>
        {aligned && <label className="o-field">Engine<select aria-label="Research engine" value={engine?.engine_id ?? ""} onChange={e => select("engine", e.target.value)}><option disabled value="">Choose an evaluated engine</option>{aligned.engines.map(row => <option value={row.engine_id} key={row.engine_id}>Engine {row.engine_number} · {row.status} · cycle {row.cutoff_cycle}</option>)}</select></label>}
        {aligned && <button type="button" className="o-btn ghost" onClick={exportReport}>Export dataset evidence</button>}
      </div>
      <Query query={report}>{data => data.subset !== subset ? <p role="alert">Evidence does not match the selected dataset. Retry before use.</p> : !engine ? <EmptyState title="Engine not present in this report"/> : <EngineEvidence key={engine.engine_id} engine={engine}/>}</Query>
      {aligned && <details><summary>Evaluation protocol, source hashes and limitations</summary><p>{aligned.protocol}</p><p>{aligned.limitations}</p><p>Uncapped MAE {aligned.uncapped_secondary.mae_cycles.toFixed(2)} cycles · RMSE {aligned.uncapped_secondary.rmse_cycles.toFixed(2)} cycles. Interval coverage {(100 * aligned.interval_coverage).toFixed(1)}% on {aligned.capped_primary.count} eligible endpoints, nominal {(100 * aligned.nominal_interval_coverage).toFixed(0)}%; mean width {aligned.mean_interval_width_cycles.toFixed(2)} cycles. These are empirical benchmark results, not individual failure probabilities.</p>{aligned.constant_baseline && <p>Fit-target constant baseline: MAE {aligned.constant_baseline.mae_cycles.toFixed(2)}, RMSE {aligned.constant_baseline.rmse_cycles.toFixed(2)} cycles.</p>}<pre>{JSON.stringify(aligned.provenance, null, 2)}</pre></details>}
      <p className="o-note">Simulated engine RUL does not establish real aircraft component life, a mechanical fault, an approved repair or clearance. These new research models are not promoted into the operational-style fleet or the existing FD001 serving model.</p>
      <Link className="o-btn ghost" to="/demo">Run the established FD001 sensor → plan → supply → work demo</Link>
    </Card>
  </section>;
}

function EngineEvidence({ engine }: { engine: ResearchEngine }) {
  const [sensor, setSensor] = useState<"sensor_2" | "sensor_3" | "sensor_4">("sensor_2");
  return <div className="research-engine-evidence">
    <p><strong>{engine.engine_id}</strong> · Input through cycle {engine.cutoff_cycle} · {engine.status}</p>
    <div className="research-engine-grid"><div><h3>Remaining useful life</h3><p className="research-rul">{engine.predicted_rul_cycles === null ? "Withheld" : `${engine.predicted_rul_cycles.toFixed(1)} cycles`}</p><p>{engine.lower_cycles === null || engine.upper_cycles === null ? "No numerical range substituted" : `Evaluated range: ${engine.lower_cycles.toFixed(1)}–${engine.upper_cycles.toFixed(1)} cycles`}</p><Pill tone={engine.review_urgency === "critical_review" ? "critical" : engine.review_urgency === "review" ? "watch" : "neutral"}>{engine.review_urgency.replaceAll("_", " ")}</Pill><p>{engine.recommendation}</p><p className="o-note">Demonstration review rule: predicted RUL ≤20 cycles prioritises review; ≤45 requests review. These thresholds are not certified maintenance limits or a failure probability.</p><details><summary>Benchmark reference value</summary><p>Supplied test label: {engine.reference_rul_cycles} cycles. This is evaluation-only truth; it was not used as an input to this prediction.</p></details></div>
      <div><label className="o-field">Sensor trend<select aria-label="Benchmark sensor" value={sensor} onChange={e => setSensor(e.target.value as typeof sensor)}>{["sensor_2", "sensor_3", "sensor_4"].map(s => <option key={s}>{s}</option>)}</select></label><OpsChart label={`${engine.engine_id} ${sensor} observed history`} height={240} deps={[engine, sensor]} build={p => ({ ...baseAxes(p), tooltip: tooltip(p), grid: { left: 68, right: 20, top: 20, bottom: 42 }, xAxis: { type: "category", data: engine.sensor_trend.map(point => point.cycle), name: "Cycle" }, yAxis: { type: "value", scale: true }, series: [{ type: "line", data: engine.sensor_trend.map(point => point[sensor]), symbol: "none", lineStyle: { color: p.accent } }] })}/><p className="o-note">Last 30 observed cycles only; generic native dataset values. No verified physical sensor mapping or engineering unit is implied.</p><details><summary>Sensor values as a table</summary><div className="o-table-wrap"><table className="o-table"><thead><tr><th>Cycle</th><th>{sensor}</th></tr></thead><tbody>{engine.sensor_trend.map(point => <tr key={point.cycle}><td>{point.cycle}</td><td>{point[sensor]}</td></tr>)}</tbody></table></div></details></div></div>
    <details><summary>Model-input sensitivity behind the prediction</summary><p>Change in predicted RUL after replacing one normalised/engineered feature with its fit-only mean. This is a noncausal model sensitivity, not a confirmed fault or an additive explanation.</p>{engine.influences?.length ? <ul>{engine.influences.map(i => <li key={i.feature}><code>{i.feature}</code>: {i.change_when_replaced_cycles > 0 ? "+" : ""}{i.change_when_replaced_cycles.toFixed(2)} cycles</li>)}</ul> : <p>No influence evidence retained for this record; none is invented.</p>}</details>
  </div>;
}
