import fs from 'fs/promises';
import path from 'path';

import { EvidenceStore, EvidenceType, EvidenceSource } from '../dist/src/evidence/evidence-store.js';
import { ConfidenceCalculator } from '../dist/src/evidence/confidence-calculator.js';
import { EvidenceAggregator } from '../dist/src/evidence/evidence-aggregator.js';
import { AnchorStateMachine, AnchorState } from '../dist/src/evidence/anchor-state-machine.js';
import { EvidenceReplay } from '../dist/src/evidence/evidence-replay.js';

async function main() {
  const tmpFile = path.join(process.cwd(), 'tmp-evidence.jsonl');
  try { await fs.unlink(tmpFile); } catch {}

  const store = new EvidenceStore(tmpFile);
  await store.load();

  const calc = new ConfidenceCalculator();
  const agg = new EvidenceAggregator(store, calc);
  const sm = new AnchorStateMachine(store, agg);
  const replay = new EvidenceReplay(store, calc, sm);

  const anchorId = `anchor-${Date.now()}`;

  // Append evidence
  await store.append({
    type: EvidenceType.ANCHOR_CREATION,
    source: EvidenceSource.SYSTEM_VALIDATION,
    data: { anchor_id: anchorId, details: {} }
  });
  await store.append({
    type: EvidenceType.STATISTICAL_MATCH,
    source: EvidenceSource.AUTOMATED_ANALYSIS,
    data: { anchor_id: anchorId, confidence_score: 0.7, details: {} }
  });
  const approval = await store.append({
    type: EvidenceType.HUMAN_APPROVAL,
    source: EvidenceSource.HUMAN_FEEDBACK,
    data: { anchor_id: anchorId, details: { reviewer: 'expert' } }
  });

  // Persistence check
  const store2 = new EvidenceStore(tmpFile);
  await store2.load();
  const ev2 = await store2.getEvidenceForAnchor(anchorId);
  if (ev2.length !== 3) throw new Error(`Expected 3 evidence, got ${ev2.length}`);

  // Confidence determinism
  const c1 = calc.calculateConfidence(ev2);
  const c2 = calc.calculateConfidence(ev2);
  if (Math.abs(c1.confidence - c2.confidence) > 1e-12) throw new Error('Confidence not deterministic');

  // Aggregation + recommendation
  const aggr = await agg.aggregateForAnchor(anchorId);
  if (!aggr.confidence || aggr.evidence_summary.total_evidence !== 3) throw new Error('Aggregation failed');

  // State transitions
  await sm.initializeAnchor(anchorId, AnchorState.PROPOSED);
  const t = await sm.processEvidence(approval);
  if (!t || t.to_state !== AnchorState.ACCEPTED) throw new Error('State transition to ACCEPTED failed');

  // Replay
  const results = await replay.replayEvidence({ anchor_ids: [anchorId], include_confidence_evolution: true });
  console.log('Replay results:', { count: results.length, steps: results[0]?.evidence_timeline.length });
  if (results.length !== 1 || results[0].evidence_timeline.length < 2) throw new Error('Replay failed');

  console.log('Evidence smoke test passed:', {
    anchorId,
    evidenceCount: ev2.length,
    confidence: c1.confidence,
    state: (await sm.getStateInfo(anchorId))?.current_state,
    replaySteps: results[0].evidence_timeline.length
  });
}

main().catch(err => { console.error(err); process.exit(1); });
