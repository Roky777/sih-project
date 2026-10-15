import { describe, expect, it } from 'vitest';
import { isResearchReport, isResearchSummary } from './researchEvidenceApi';

const metric = { count: 1, mae_cycles: 4, rmse_cycles: 4, asymmetric_score: 1 };
const report = {
  schema_version: 'research-benchmark-v1', subset: 'FD002', simulated: true,
  evidence_status: 'research_only', model_version: 'synthetic-test-fixture', protocol: 'fixture', limitations: 'fixture',
  operating_conditions: 6, fault_modes: 1, target_cap_cycles: 125, minimum_history_cycles: 30,
  train_engine_count: 10, test_engine_count: 1, withheld_count: 0,
  split_counts: {fit: 7, validation: 1, calibration: 2}, capped_primary: metric, uncapped_secondary: metric,
  validation: null, constant_baseline: null, interval_coverage: 1, nominal_interval_coverage: .9,
  mean_interval_width_cycles: 20, provenance: {},
  engines: [{engine_id: 'NASA_CMAPSS:FD002:test:1', engine_number: 1, cutoff_cycle: 30,
    status: 'evaluated', predicted_rul_cycles: 20, lower_cycles: 10, upper_cycles: 30,
    reference_rul_cycles: 24, review_urgency: 'critical_review', recommendation: 'fixture',
    sensor_trend: [{cycle: 30, sensor_2: 1, sensor_3: 2, sensor_4: 3}], influences: []}],
};
describe('research network boundary', () => {
  it('rejects mismatched datasets, denominators, future observations and nonfinite outputs', () => {
    expect(isResearchReport(report)).toBe(true);
    expect(isResearchReport({...report, subset:'FD003'})).toBe(false);
    expect(isResearchReport({...report, withheld_count:1})).toBe(false);
    expect(isResearchReport({...report, engines:[{...report.engines[0],cutoff_cycle:29}]})).toBe(false);
    expect(isResearchSummary({...report, interval_coverage:NaN})).toBe(false);
    expect(isResearchReport({...report, engines:[{...report.engines[0],status:'withheld'}]})).toBe(false);
  });
});
