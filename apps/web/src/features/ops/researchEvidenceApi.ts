import type { components } from "../../shared/api/generated/schema";

export type ResearchSummary = components["schemas"]["ResearchSummary"];
export type ResearchReport = components["schemas"]["ResearchReport"];
export type ResearchEngine = components["schemas"]["ResearchEngine"];
export type ResearchIndex = components["schemas"]["ResearchIndex"];
export type DrawingEvidence = components["schemas"]["DrawingEvidence"];
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const positiveInt = (v: unknown): v is number => finite(v) && Number.isInteger(v) && v > 0;
const nullableNumber = (v: unknown) => v === null || finite(v);
const metric = (v: unknown) => obj(v) && positiveInt(v.count) && ["mae_cycles", "rmse_cycles", "asymmetric_score"].every(k => finite(v[k]) && v[k] >= 0);
export function isResearchSummary(v: unknown): v is ResearchSummary {
  return obj(v) && v.schema_version === "research-benchmark-v1" && v.simulated === true && ["FD001", "FD002", "FD003", "FD004"].includes(String(v.subset))
    && ["historical_inspected", "research_only"].includes(String(v.evidence_status))
    && ["model_version", "protocol", "limitations"].every(k => typeof v[k] === "string")
    && ["operating_conditions", "fault_modes", "target_cap_cycles", "minimum_history_cycles", "train_engine_count", "test_engine_count"].every(k => positiveInt(v[k]))
    && finite(v.withheld_count) && v.withheld_count >= 0 && Number.isInteger(v.withheld_count)
    && metric(v.capped_primary) && metric(v.uncapped_secondary) && (v.validation === null || metric(v.validation)) && (v.constant_baseline === null || metric(v.constant_baseline))
    && finite(v.interval_coverage) && v.interval_coverage >= 0 && v.interval_coverage <= 1
    && finite(v.nominal_interval_coverage) && v.nominal_interval_coverage > 0 && v.nominal_interval_coverage < 1
    && finite(v.mean_interval_width_cycles) && v.mean_interval_width_cycles >= 0
    && obj(v.provenance) && obj(v.split_counts) && Object.values(v.split_counts).every(x => finite(x) && x >= 0);
}
export function isResearchIndex(v: unknown): v is ResearchIndex {
  return obj(v) && typeof v.version === "string" && Array.isArray(v.summaries) && v.summaries.every(isResearchSummary) && new Set(v.summaries.map(s => s.subset)).size === v.summaries.length;
}
function isEngine(v: unknown): v is ResearchEngine {
  if (!obj(v) || typeof v.engine_id !== "string" || !positiveInt(v.engine_number) || !positiveInt(v.cutoff_cycle)
    || typeof v.recommendation !== "string" || !finite(v.reference_rul_cycles) || v.reference_rul_cycles < 0
    || !["predicted_rul_cycles", "lower_cycles", "upper_cycles"].every(k => nullableNumber(v[k]))
    || !Array.isArray(v.influences) || !v.influences.every(i => obj(i) && typeof i.feature === "string" && finite(i.change_when_replaced_cycles))
    || !Array.isArray(v.sensor_trend) || !v.sensor_trend.every(p => obj(p) && positiveInt(p.cycle) && p.cycle <= (v.cutoff_cycle as number) && ["sensor_2", "sensor_3", "sensor_4"].every(k => finite(p[k])))) return false;
  const cycles = v.sensor_trend.map(p => p.cycle as number);
  if (cycles.some((c, i) => i > 0 && c <= cycles[i - 1])) return false;
  if (v.status === "withheld") return v.predicted_rul_cycles === null && v.lower_cycles === null && v.upper_cycles === null && v.review_urgency === "unavailable" && v.influences.length === 0;
  return v.status === "evaluated" && finite(v.predicted_rul_cycles) && finite(v.lower_cycles) && finite(v.upper_cycles)
    && v.lower_cycles >= 0 && v.lower_cycles <= v.predicted_rul_cycles && v.predicted_rul_cycles <= v.upper_cycles
    && ["critical_review", "review", "routine"].includes(String(v.review_urgency));
}
export function isResearchReport(v: unknown): v is ResearchReport {
  if (!obj(v)) return false;
  const engines = v.engines;
  if (!Array.isArray(engines) || !engines.every(isEngine) || !isResearchSummary(v)) return false;
  return engines.length === v.test_engine_count && new Set(engines.map(e => e.engine_id)).size === engines.length
    && engines.every(e => e.engine_id === `NASA_CMAPSS:${v.subset}:test:${e.engine_number}`)
    && engines.filter(e => e.status === "withheld").length === v.withheld_count
    && v.capped_primary.count + v.withheld_count === v.test_engine_count
    && v.uncapped_secondary.count === v.capped_primary.count;
}
export function isDrawingEvidence(v: unknown): v is DrawingEvidence[] {
  return Array.isArray(v) && v.every(row => obj(row) && row.verification_status === "pending" && row.provenance === "authored_demonstration_mapping" && ["model_family", "component_reference", "mapping_reference"].every(k => typeof row[k] === "string") && ["drawing_reference", "drawing_revision", "reviewer"].every(k => row[k] === null || typeof row[k] === "string"));
}
