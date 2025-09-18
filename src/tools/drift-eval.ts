import { StableColumnAnchor, ColumnData, ColumnFingerprint } from '../types/anchor.types';
import { DriftDetector, StatisticalTests } from '../drift';

function nowIso() { return new Date().toISOString(); }

function synthNormal(n: number, mean = 0, std = 1) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    out.push(mean + std * z);
  }
  return out;
}

function fpFrom(values: number[]): ColumnFingerprint {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const uniq = new Set(values);
  return {
    dtype: 'float64',
    cardinality: uniq.size,
    regex_patterns: [],
    null_ratio: 0,
    unique_ratio: uniq.size / values.length,
    sample_values: values.slice(0, 20).map(String),
    min, max,
  };
}

function anchorFor(name: string, fp: ColumnFingerprint): StableColumnAnchor {
  const ts = nowIso();
  return {
    dataset: 'eval',
    column_name: name,
    anchor_id: `eval:${name}`,
    fingerprint: JSON.stringify(fp),
    first_seen: ts,
    last_seen: ts,
    confidence: 0.95,
  };
}

async function evalNumericTrials(trials = 50) {
  const detector = new DriftDetector({ enable_performance_mode: true });
  let fpCount = 0; // false positive
  let tpCount = 0; // true positive

  // False positives: same distribution
  for (let i = 0; i < trials; i++) {
    const base = synthNormal(20000, 100, 15);
    const cur = synthNormal(20000, 100, 15);
    const baseFp = fpFrom(base);
    const curFp = fpFrom(cur);
    const anchor = anchorFor('stable_metric', baseFp);
    const col: ColumnData = { name: 'stable_metric', values: cur, data_type: 'float64' };
    const res = await detector.detectDrift(anchor, col, curFp);
    if (res.drift_detected) fpCount++;
  }

  // True positives: significant mean shift
  for (let i = 0; i < trials; i++) {
    const base = synthNormal(20000, 50, 10);
    const cur = synthNormal(20000, 200, 10);
    const baseFp = fpFrom(base);
    const curFp = fpFrom(cur);
    const anchor = anchorFor('mean_shift_metric', baseFp);
    const col: ColumnData = { name: 'mean_shift_metric', values: cur, data_type: 'float64' };
    const res = await detector.detectDrift(anchor, col, curFp);
    if (res.drift_detected) tpCount++;
  }

  return {
    trials,
    false_positive_rate: fpCount / trials,
    true_positive_rate: tpCount / trials,
  };
}

async function main() {
  const stats = new StatisticalTests();
  // Quick check of stats utils
  const ks = stats.kolmogorovSmirnovTest([1,2,3,4], [10,11,12,13]);
  console.log('KS sanity:', { statistic: ks.statistic.toFixed(4), p: ks.p_value.toFixed(4) });

  const numeric = await evalNumericTrials(30);
  console.log('Drift eval summary:', numeric);
}

main().catch(err => {
  console.error('drift-eval error', err);
  process.exit(1);
});
