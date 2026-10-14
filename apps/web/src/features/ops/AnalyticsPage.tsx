import { useActorRole } from "./roles";
import { BrandLogo } from "../../shared/ui/BrandLogo";
import { Fragment } from "react";
import { Icon } from "../../shared/ui/Icon";
import { useEngine, useKpis, useModels, useRequestEngineRun } from "./api";
import { availabilityLabel, factorLabel, longDate, num, pct } from "./format";
import { GLASS_CSS, OpsChart, baseAxes, tooltip } from "./OpsChart";
import { Card, Kpi, PageHead, Pill, Query, useToast } from "./ui";

type Kpis = {
  fleet_availability: number; inherent_availability: number; operational_availability: number; mtbf_aircraft_days: number; mttr_days: number; mean_downtime_days: number;
  turnaround_days: number; failure_rate_per_1000_fh: number; unscheduled_to_scheduled_ratio: number; repeat_defect_rate: number; spare_fill_rate: number; on_time_rate: number;
  downtime_days_by_cause: Record<string, number>; by_type: { type: string; name: string; system: string; failures: number; mtbf_flight_hours: number | null; failure_rate_per_1000_fh: number; unwarned_failure_share: number | null }[];
  period: { from: string; to: string }; definitions: Record<string, string>;
};
type Risk = { rows: number; positives: number; base_rate: number; pr_auc: number; recall_at_precision_0_5: number; brier: number; baseline_logistic_pr_auc?: number; baseline_logistic_brier?: number; calibration_curve?: { predicted: number; observed: number; rows: number }[] };
type Detector = { degradation_episodes: number; episodes_detected: number; recall: number; median_lead_time_days: number; false_alarms_per_1000_healthy_rows: number };
type Evaluation = {
  split: { train_end: string; validation_end: string; test_end: string; held_out_aircraft: string[]; grouping: string };
  failure_risk: { "14d": Risk; "30d": Risk };
  rul: { rows: number; mae_days: number; mae_days_near_failure: number; baseline_linear_mae_days: number; baseline_linear_mae_near_failure: number; cmapss_score: number; baseline_cmapss_score: number; interval_coverage_10_90: number; interval_coverage_near_failure: number; mean_interval_width_days: number };
  anomaly: { selected_percentile: number; isolation_forest_residual: Detector; rolling_z_baseline: Detector };
  lead_time: { threshold: number; failures: number; warned: number; median_days_of_warning: number; lead_time_days: number[] };
  training: { models: Record<string, string>; substitutions: string[]; library_versions: Record<string, string>; timings_seconds: Record<string, number>; data_hash: string; features: string[] };
};

export function AnalyticsPage({ section }: { section?: "reports" | "models" } = {}) {
  const kpis = useKpis();
  const models = useModels();
  return <>
    <header className="report-brand"><BrandLogo/><div><strong>AeroCare · {section === "models" ? "Model evaluation" : "Availability report"}</strong><p>Recorded and synthetic demonstrator evidence · PS 26249</p></div></header>
    {!section && <PageHead eyebrow="Explore" title="Reports & models" description="Recorded reliability and model evaluation"/>}
    {section !== "models" && <Query query={kpis} rows={6}>{raw => <ReliabilitySection k={raw as unknown as Kpis}/>}</Query>}
    {section !== "reports" && <Query query={models} rows={10}>{raw => <ModelSection data={raw as unknown as { run_id: string; manifest: { created_at: string; seed: number; hashes: Record<string, string> }; evaluation: Evaluation; priority_rule: { version: string; weights: Record<string, number>; bands: Record<string, number> } }}/>}</Query>}
  </>;
}

function ReliabilitySection({ k }: { k: Kpis }) {
  const loss = k.inherent_availability - k.operational_availability;
  return <>
    <div className="o-kpis">
      <Kpi label="Fleet availability (3 y)" icon="aircraft" tone="accent" value={k.fleet_availability} format={v => pct(v, 1)} detail={`${longDate(k.period.from)} – ${longDate(k.period.to)}`}/>
      <Kpi label="Inherent availability Ai" icon="gauge" tone="healthy" value={k.inherent_availability} format={v => pct(v, 1)} detail="MTBF / (MTBF + MTTR)"/>
      <Kpi label="Operational availability Ao" icon="gauge" tone="degraded" value={k.operational_availability} format={v => pct(v, 1)} detail={`${pct(loss, 1)} lost to logistics, queue and admin delay`}/>
      <Kpi label="MTTR · turnaround" icon="wrench" tone="maint" value={k.mttr_days} format={v => `${v.toFixed(1)} d`} detail={`Turnaround ${k.turnaround_days.toFixed(1)} d incl. waits`}/>
      <Kpi label="Spare fill rate" icon="box" tone="watch" value={k.spare_fill_rate} format={v => pct(v)} detail="Issues served without waiting"/>
      <Kpi label="Failure rate" icon="activity" tone="critical" value={k.failure_rate_per_1000_fh} format={v => v.toFixed(2)} detail={`per 1,000 FH · ${k.unscheduled_to_scheduled_ratio}:1 unscheduled:scheduled · repeat ${pct(k.repeat_defect_rate, 1)}`}/>
    </div>
    <div className="o-grid o-cols-main">
      <Card title="Failures by component type" subtitle="Recorded unscheduled removals; the bar label shows MTBF in flight hours">
        <OpsChart label="Failures by component type" height={360} deps={[k]} build={p => { const rows = [...k.by_type].sort((a, b) => a.failures - b.failures); return {
          grid: { left: 150, right: 60, top: 6, bottom: 20 }, tooltip: { ...tooltip(p), axisPointer: { type: "shadow" } },
          xAxis: { type: "value", ...baseAxes(p) }, yAxis: { type: "category", data: rows.map(r => r.name), ...baseAxes(p), axisLabel: { color: p.muted, fontSize: 11 } },
          series: [{ name: "Failures", type: "bar", barWidth: "62%", data: rows.map(r => r.failures), itemStyle: { color: p.accent, borderRadius: [0, 4, 4, 0] },
            label: { show: true, position: "right", color: p.muted, fontSize: 10, formatter: (params: { dataIndex: number }) => rows[params.dataIndex].mtbf_flight_hours ? `${num(rows[params.dataIndex].mtbf_flight_hours)} FH` : "" } }],
        }; }}/>
      </Card>
      <Card title="Where availability goes" subtitle="Aircraft-days not available, by cause, over three years">
        <OpsChart label="Downtime by cause" height={220} deps={[k]} build={p => { const entries = Object.entries(k.downtime_days_by_cause); const colors: Record<string, string> = { unscheduled_repair: p.critical, awaiting_spares: p.degraded, awaiting_agency: p.watch, scheduled_maintenance: p.maint }; return {
          grid: { left: 140, right: 50, top: 6, bottom: 18 }, tooltip: { ...tooltip(p), axisPointer: { type: "shadow" } },
          xAxis: { type: "value", splitNumber: 3, ...baseAxes(p) }, yAxis: { type: "category", data: entries.map(([c]) => availabilityLabel[c]), ...baseAxes(p) },
          series: [{ type: "bar", barWidth: "55%", data: entries.map(([c, v]) => ({ value: v, itemStyle: { color: colors[c], borderRadius: [0, 4, 4, 0] } })), label: { show: true, position: "right", color: p.muted, fontSize: 10 } }],
        }; }}/>
        <div className="o-ai-ao">
          <div><span>Ai</span><i style={{ width: `${k.inherent_availability * 100}%` }} className="ai"/><b>{pct(k.inherent_availability, 1)}</b></div>
          <div><span>Ao</span><i style={{ width: `${k.operational_availability * 100}%` }} className="ao"/><b>{pct(k.operational_availability, 1)}</b></div>
        </div>
        <p className="o-muted o-small">The gap between inherent and operational availability is the logistics and delay loss that predictive maintenance plus spares planning can recover. Definitions: {k.definitions.operational_availability}.</p>
      </Card>
    </div>
  </>;
}

function Compare({ label, model, baseline, better, format }: { label: string; model: number; baseline: number; better: "higher" | "lower"; format: (v: number) => string }) {
  const wins = better === "higher" ? model > baseline : model < baseline;
  const max = Math.max(model, baseline, 1e-9);
  return <div className="o-compare"><span>{label}</span>
    <div className="o-compare-bars"><div><i className="model" style={{ width: `${(model / max) * 100}%` }}/><b>{format(model)}</b><small>model</small></div><div><i className="base" style={{ width: `${(baseline / max) * 100}%` }}/><b>{format(baseline)}</b><small>baseline</small></div></div>
    <Pill tone={wins ? "healthy" : "critical"}>{wins ? "beats baseline" : "below baseline"}</Pill></div>;
}

function ModelSection({ data }: { data: { run_id: string; manifest: { created_at: string; seed: number; hashes: Record<string, string> }; evaluation: Evaluation; priority_rule: { version: string; weights: Record<string, number>; bands: Record<string, number> } } }) {
  const e = data.evaluation;
  const r14 = e.failure_risk["14d"], r30 = e.failure_risk["30d"];
  const anomaly = e.anomaly;
  return <>
    <div className="o-section-head"><h2>Model evaluation</h2><Pill tone="maint">Synthetic data</Pill><span className="o-muted o-small">Temporal split: train to {longDate(e.split.train_end)}, validate to {longDate(e.split.validation_end)}, test to {longDate(e.split.test_end)}; {e.split.held_out_aircraft.length} aircraft held out entirely ({e.split.held_out_aircraft.join(", ")}).</span></div>
    <div className="o-grid o-cols-3">
      <Card title="Failure risk · 14 days" subtitle={`${num(r14.rows)} held-out rows · ${r14.positives} positives · base rate ${pct(r14.base_rate, 1)}`}>
        <Compare label="PR-AUC" model={r14.pr_auc} baseline={r14.baseline_logistic_pr_auc ?? 0} better="higher" format={v => v.toFixed(3)}/>
        <Compare label="Brier score" model={r14.brier} baseline={r14.baseline_logistic_brier ?? 0} better="lower" format={v => v.toFixed(4)}/>
        <dl className="o-kv" style={{ marginTop: 12 }}><dt>Recall at precision ≥ 0.5</dt><dd>{pct(r14.recall_at_precision_0_5)}</dd><dt>30-day PR-AUC</dt><dd>{r30.pr_auc.toFixed(3)} (base rate {pct(r30.base_rate, 1)})</dd></dl>
        <small className="o-muted">Gradient boosting + isotonic calibration vs logistic-regression baseline. PR-AUC is the headline metric because failures are rare.</small>
      </Card>
      <Card title="Remaining useful life" subtitle={`${num(e.rul.rows)} held-out rows · target capped at 60 days`}>
        <Compare label="MAE near failure (days)" model={e.rul.mae_days_near_failure} baseline={e.rul.baseline_linear_mae_near_failure} better="lower" format={v => v.toFixed(1)}/>
        <Compare label="Asymmetric score (late costs more)" model={e.rul.cmapss_score} baseline={e.rul.baseline_cmapss_score} better="lower" format={v => v.toFixed(1)}/>
        <dl className="o-kv" style={{ marginTop: 12 }}><dt>10–90 % coverage (all rows)</dt><dd>{pct(e.rul.interval_coverage_10_90)}</dd><dt>Coverage within 60 d of failure</dt><dd className={e.rul.interval_coverage_near_failure < 0.75 ? "o-tone-degraded" : ""}>{pct(e.rul.interval_coverage_near_failure)}</dd><dt>Mean interval width</dt><dd>{e.rul.mean_interval_width_days.toFixed(1)} d</dd></dl>
        <small className="o-muted">Quantile gradient boosting with split-conformal widening vs linear health-trend extrapolation. Near-failure coverage is below the 80 % nominal level; it is reported, not hidden.</small>
      </Card>
      <Card title="Anomaly detection" subtitle={`Episodes before recorded failures in the test period · threshold = ${pct(anomaly.selected_percentile, 1)} percentile`}>
        <table className="o-table o-table-mini"><thead><tr><th/><th className="num">Recall</th><th className="num">Median lead</th><th className="num">False alarms /1k</th></tr></thead><tbody>
          <tr><td className="o-strong">Isolation Forest + residual</td><td className="num">{pct(anomaly.isolation_forest_residual.recall)}</td><td className="num">{anomaly.isolation_forest_residual.median_lead_time_days} d</td><td className="num">{anomaly.isolation_forest_residual.false_alarms_per_1000_healthy_rows.toFixed(2)}</td></tr>
          <tr><td>Rolling z-score baseline</td><td className="num">{pct(anomaly.rolling_z_baseline.recall)}</td><td className="num">{anomaly.rolling_z_baseline.median_lead_time_days} d</td><td className="num">{anomaly.rolling_z_baseline.false_alarms_per_1000_healthy_rows.toFixed(2)}</td></tr>
        </tbody></table>
        <p className="o-note" style={{ marginTop: 12 }}><Icon name="info" size={16}/>Trade-off, not a win: the z-score baseline warns earlier and on more episodes but raises far more false alarms on healthy components. The selected detector favours low false-alarm load.</p>
      </Card>
    </div>
    <div className="o-grid o-cols-2">
      <Card title="Calibration · 14-day risk" subtitle="Predicted probability vs observed failure frequency on held-out rows (points need ≥ 20 rows)">
        <OpsChart label="Calibration curve" height={260} deps={[r14]} build={p => ({
          grid: { left: 44, right: 16, top: 12, bottom: 36 }, tooltip: { trigger: "item", backgroundColor: p.glass, borderColor: "rgba(255,255,255,.55)", extraCssText: GLASS_CSS, textStyle: { color: p.text } },
          xAxis: { type: "value", min: 0, max: 1, name: "predicted", nameLocation: "middle", nameGap: 24, nameTextStyle: { color: p.muted }, ...baseAxes(p) },
          yAxis: { type: "value", min: 0, max: 1, name: "observed", nameTextStyle: { color: p.muted }, ...baseAxes(p) },
          series: [{ type: "line", data: [[0, 0], [1, 1]], symbol: "none", lineStyle: { color: p.muted, type: "dashed" }, tooltip: { show: false } },
            { type: "line", data: (r14.calibration_curve ?? []).map(c => [c.predicted, c.observed]), symbolSize: (_: unknown, params: { dataIndex: number }) => 6 + Math.min(14, Math.log10((r14.calibration_curve ?? [])[params.dataIndex]?.rows ?? 1) * 4), lineStyle: { color: p.accent, width: 2 }, itemStyle: { color: p.accent } }],
        })}/>
      </Card>
      <Card title="Warning lead time" subtitle={`Days between the first 14-day risk ≥ ${pct(e.lead_time.threshold)} and the recorded failure · ${e.lead_time.warned} of ${e.lead_time.failures} test-period failures warned`}>
        <OpsChart label="Lead time distribution" height={260} deps={[e.lead_time]} build={p => { const bins = Array.from({ length: 10 }, (_, i) => i * 5); const counts = bins.map(b => e.lead_time.lead_time_days.filter(d => d >= b && d < b + 5).length); return {
          grid: { left: 36, right: 12, top: 12, bottom: 36 }, tooltip: { ...tooltip(p), axisPointer: { type: "shadow" } },
          xAxis: { type: "category", data: bins.map(b => `${b}–${b + 4}`), name: "days of warning", nameLocation: "middle", nameGap: 24, nameTextStyle: { color: p.muted }, ...baseAxes(p) },
          yAxis: { type: "value", ...baseAxes(p) },
          series: [{ type: "bar", barWidth: "70%", data: counts, itemStyle: { color: p.accent2, borderRadius: [4, 4, 0, 0] } }],
        }; }}/>
        <p className="o-muted o-small">Median warning {e.lead_time.median_days_of_warning} days. Sudden failures (about 12 % in this simulation) give little or no warning by design.</p>
      </Card>
    </div>
    <div className="o-grid o-cols-2">
      <Card title="Priority rule" subtitle={`${data.priority_rule.version} · transparent weighted score, editable in configuration`}>
        <div className="o-bars">{Object.entries(data.priority_rule.weights).map(([name, weight]) => <div key={name} className="o-bar-row"><span>{factorLabel[name] ?? name}</span><span className="o-bar-track"><span className="accent" style={{ width: `${(weight / 0.35) * 100}%` }}/></span><b>{weight.toFixed(2)}</b></div>)}</div>
        <p className="o-muted o-small" style={{ marginTop: 10 }}>Bands: {Object.entries(data.priority_rule.bands).map(([level, minimum]) => `${level} ≥ ${minimum}`).join(" · ")} · otherwise P4. Not machine-learned, so planners can audit and tune it.</p>
      </Card>
      <EngineCard data={data}/>
    </div>
  </>;
}

function EngineCard({ data }: { data: { run_id: string; manifest: { created_at: string; seed: number; hashes: Record<string, string> }; evaluation: Evaluation } }) {
  const actorRole = useActorRole();
  const engine = useEngine();
  const request = useRequestEngineRun();
  const toast = useToast();
  const t = data.evaluation.training;
  return <Card title="Engine run & provenance" subtitle={`${data.run_id} · seed ${data.manifest.seed} · ${longDate(data.manifest.created_at)}`}
    actions={actorRole === "supervisor" && <button type="button" className="o-btn sm ghost" disabled={request.isPending || Boolean(engine.data?.pending_run)} onClick={() => request.mutate(data.manifest.seed, { onSuccess: () => toast({ tone: "info", title: "Engine run queued", body: "The current bundle stays active until the new one is verified." }) })}><Icon name="refresh" size={14}/>{engine.data?.pending_run ? "Run in progress…" : "Re-run engine"}</button>}>
    <dl className="o-kv">{Object.entries(t.models).map(([name, text]) => <Fragment key={name}><dt>{name.replace(/_/g, " ")}</dt><dd className="o-kv-text">{text}</dd></Fragment>)}</dl>
    <hr className="o-divider"/>
    <ul className="o-plain-list">{t.substitutions.map(item => <li key={item}><Icon name="info" size={13}/>{item}</li>)}</ul>
    <p className="o-muted o-small">Libraries: {Object.entries(t.library_versions).map(([k, v]) => `${k} ${v}`).join(" · ")} · {t.features.length} features · data hash {t.data_hash} · timings {Object.entries(t.timings_seconds).map(([k, v]) => `${k} ${v}s`).join(", ")}. Bundle files are verified by SHA-256 before the API serves them.</p>
  </Card>;
}
