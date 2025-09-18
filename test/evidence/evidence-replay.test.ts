jest.mock('fs', () => ({
  __esModule: true,
  promises: {
    appendFile: jest.fn(async () => {}),
  },
  existsSync: jest.fn(() => false),
  createReadStream: jest.fn(),
}));

import { EvidenceStore, EvidenceType, EvidenceSource } from '../../src/evidence/evidence-store';
import { ConfidenceCalculator } from '../../src/evidence/confidence-calculator';
import { EvidenceReplay } from '../../src/evidence/evidence-replay';
import { EvidenceAggregator } from '../../src/evidence/evidence-aggregator';
import { AnchorStateMachine } from '../../src/evidence/anchor-state-machine';

describe('Evidence: EvidenceReplay', () => {
  it('replays evidence and generates a textual report', async () => {
    const store = new EvidenceStore('test/.tmp-evidence.jsonl');
    const calc = new ConfidenceCalculator();
    const aggregator = new EvidenceAggregator(store, calc);
    const stateMachine = new AnchorStateMachine(store, aggregator);
    const replay = new EvidenceReplay(store, calc, stateMachine);

    // Seed evidence for two anchors
    const base = Date.now() - 1000 * 60 * 60; // 1h ago
    const t = (i: number) => new Date(base + i * 60000).toISOString();

    const events = [
      { id: 'A', type: EvidenceType.STATISTICAL_MATCH, source: EvidenceSource.STATISTICAL_MODEL },
      { id: 'A', type: EvidenceType.HUMAN_APPROVAL, source: EvidenceSource.HUMAN_FEEDBACK },
      { id: 'B', type: EvidenceType.SCHEMA_CONSISTENCY, source: EvidenceSource.SYSTEM_VALIDATION },
      { id: 'A', type: EvidenceType.TEMPORAL_STABILITY, source: EvidenceSource.SYSTEM_VALIDATION },
    ];

    // Append and overwrite timestamps for determinism
    let i = 0;
    for (const ev of events) {
      const e = await store.append({
        type: ev.type,
        source: ev.source,
        data: { anchor_id: ev.id, details: {} }
      });
      (e as any).timestamp = t(i++);
    }

    const results = await replay.replayEvidence({ include_confidence_evolution: true });
    expect(results.length).toBeGreaterThan(0);
    const a = results.find(r => r.anchor_id === 'A')!;
    expect(a.evidence_timeline.length).toBe(3);
    expect(a.final_state.evidence_count).toBe(3);

    const report = await replay.generateReplayReport(results);
    expect(report).toContain('Evidence Replay Report');
    expect(report).toContain('Anchors Analyzed');
  });
});

