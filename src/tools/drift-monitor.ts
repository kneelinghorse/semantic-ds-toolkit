import { promises as fs } from 'fs';
import { join } from 'path';
import { PerformanceOptimizedDriftDetector } from '../drift';
import {
  StableColumnAnchor,
  ColumnData,
  ColumnFingerprint,
} from '../types/anchor.types';

async function ensureDir(path: string) {
  try {
    await fs.mkdir(path, { recursive: true });
  } catch {}
}

function nowIso() {
  return new Date().toISOString();
}

function synthNumeric(size = 10000, mean = 0, std = 1) {
  const values: number[] = [];
  for (let i = 0; i < size; i++) {
    // Box-Muller
    const u = Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    values.push(mean + std * z);
  }
  return values;
}

function fingerprintFromNumeric(values: number[]): ColumnFingerprint {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const unique = new Set(values);
  return {
    dtype: 'float64',
    cardinality: unique.size,
    regex_patterns: [],
    null_ratio: 0,
    unique_ratio: unique.size / values.length,
    sample_values: values.slice(0, 20).map(String),
    min,
    max,
  };
}

function anchorFromFingerprint(dataset: string, name: string, fp: ColumnFingerprint): StableColumnAnchor {
  const ts = nowIso();
  return {
    dataset,
    column_name: name,
    anchor_id: `${dataset}:${name}`,
    fingerprint: JSON.stringify(fp),
    first_seen: ts,
    last_seen: ts,
    confidence: 0.95,
  };
}

async function main() {
  const outDir = 'evidence-logs';
  await ensureDir(outDir);

  // Attempt to load baseline/current from local JSON if available
  // Fallback to synthetic data demonstrating both stable and drifted scenarios
  let scenarios: Array<{
    name: string;
    anchor: StableColumnAnchor;
    column: ColumnData;
    fingerprint: ColumnFingerprint;
  }> = [];

  try {
    const raw = await fs.readFile('test-data/drift-scenarios.json', 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      scenarios = parsed as any;
    }
  } catch {}

  if (scenarios.length === 0) {
    // Synthetic: stable and drifted numeric columns
    const base = synthNumeric(50000, 100, 10);
    const baseFp = fingerprintFromNumeric(base);
    const baseAnchor = anchorFromFingerprint('synthetic', 'metric_stable', baseFp);
    const baseColumn: ColumnData = { name: 'metric_stable', values: base, data_type: 'float64' };

    const drifted = synthNumeric(50000, 1000, 10); // mean shift 10x
    const driftFp = fingerprintFromNumeric(drifted);
    const driftAnchor = anchorFromFingerprint('synthetic', 'metric_drifted', baseFp);
    const driftColumn: ColumnData = { name: 'metric_drifted', values: drifted, data_type: 'float64' };

    scenarios.push(
      { name: 'stable', anchor: baseAnchor, column: baseColumn, fingerprint: baseFp },
      { name: 'distribution_drift', anchor: driftAnchor, column: driftColumn, fingerprint: driftFp },
    );
  }

  const detector = new PerformanceOptimizedDriftDetector({ enable_performance_mode: true });

  const results = [] as any[];
  for (const s of scenarios) {
    const res = await detector.detectDriftFast(s.anchor, s.column, s.fingerprint);
    results.push({ scenario: s.name, result: res });
  }

  const ts = new Date();
  const file = join(outDir, `drift-monitor-${ts.toISOString().replace(/[:]/g, '-')}.json`);
  await fs.writeFile(file, JSON.stringify({ generated_at: nowIso(), results }, null, 2), 'utf8');

  // Console summary for logs
  const summary = results.map(r => ({
    scenario: r.scenario,
    drift: r.result.drift_detected,
    severity: r.result.severity,
    types: r.result.drift_types.map((d: any) => d.type),
    time_ms: r.result.performance_metrics?.detection_time_ms,
  }));
  console.log('Drift monitor summary:', summary);
  console.log('Saved:', file);
}

main().catch(err => {
  console.error('drift-monitor error', err);
  process.exit(1);
});
