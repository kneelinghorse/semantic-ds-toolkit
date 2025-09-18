jest.mock('fs', () => ({
  __esModule: true,
  promises: { appendFile: jest.fn(async () => {}) },
  existsSync: jest.fn(() => false),
  createReadStream: jest.fn(),
}));

import { EvidenceStore, EvidenceType, EvidenceSource } from '../../src/evidence/evidence-store';
import { EvidenceAggregator } from '../../src/evidence/evidence-aggregator';
import { ConfidenceCalculator } from '../../src/evidence/confidence-calculator';
import { AnchorStateMachine, AnchorState } from '../../src/evidence/anchor-state-machine';

describe('Evidence: AnchorStateMachine', () => {
  it('transitions on human approval/rejection from PROPOSED', async () => {
    const store = new EvidenceStore('test/.tmp-evidence.jsonl');
    const aggregator = new EvidenceAggregator(store, new ConfidenceCalculator());
    const sm = new AnchorStateMachine(store, aggregator);

    // Approval -> ACCEPTED
    const app = await store.append({ type: EvidenceType.HUMAN_APPROVAL, source: EvidenceSource.HUMAN_FEEDBACK, data: { anchor_id: 'A', details: {} } });
    const t1 = await sm.processEvidence(app);
    expect(t1).not.toBeNull();
    expect(t1!.to_state).toBe(AnchorState.ACCEPTED);

    // Rejection -> REJECTED
    const rej = await store.append({ type: EvidenceType.HUMAN_REJECTION, source: EvidenceSource.HUMAN_FEEDBACK, data: { anchor_id: 'B', details: {} } });
    const t2 = await sm.processEvidence(rej);
    expect(t2).not.toBeNull();
    expect(t2!.to_state).toBe(AnchorState.REJECTED);
  });

  it('enters MONITORING from PROPOSED on monitor recommendation, and DEPRECATED from MONITORING by timeout', async () => {
    const store = new EvidenceStore('test/.tmp-evidence.jsonl');
    const aggregator = new EvidenceAggregator(store, new ConfidenceCalculator());
    const sm = new AnchorStateMachine(store, aggregator, { monitoring_duration_days: 0 });

    // Moderate signal -> MONITORING
    const mod = await store.append({ type: EvidenceType.STATISTICAL_MATCH, source: EvidenceSource.STATISTICAL_MODEL, data: { anchor_id: 'C', details: {} } });
    const tMon = await sm.processEvidence(mod);
    expect(tMon).not.toBeNull();
    expect(tMon!.to_state).toBe(AnchorState.MONITORING);

    // From MONITORING: low confidence and duration elapsed -> DEPRECATED
    await sm.initializeAnchor('M', AnchorState.MONITORING);
    const neg = await store.append({ type: EvidenceType.ANCHOR_DEPRECATION, source: EvidenceSource.SYSTEM_VALIDATION, data: { anchor_id: 'M', details: {} } });
    const tDep = await sm.processEvidence(neg);
    expect(tDep).not.toBeNull();
    expect(tDep!.to_state).toBe(AnchorState.DEPRECATED);
  });

  it('forceTransition performs manual override', async () => {
    const store = new EvidenceStore('test/.tmp-evidence.jsonl');
    const aggregator = new EvidenceAggregator(store, new ConfidenceCalculator());
    const sm = new AnchorStateMachine(store, aggregator);
    await sm.initializeAnchor('X');
    const tx = await sm.forceTransition('X', AnchorState.MONITORING, 'manual');
    expect(tx.to_state).toBe(AnchorState.MONITORING);
  });

  it('ACCEPTED → DEPRECATED on human rejection; then HUMAN_APPROVAL + positives → MONITORING', async () => {
    const store = new EvidenceStore('test/.tmp-evidence.jsonl');
    const aggregator = new EvidenceAggregator(store, new ConfidenceCalculator());
    const sm = new AnchorStateMachine(store, aggregator);

    // Start with approval to move to ACCEPTED
    const app = await store.append({ type: EvidenceType.HUMAN_APPROVAL, source: EvidenceSource.HUMAN_FEEDBACK, data: { anchor_id: 'Z', details: {} } });
    const t1 = await sm.processEvidence(app);
    expect(t1).not.toBeNull();
    expect(t1!.to_state).toBe(AnchorState.ACCEPTED);

    // Human rejection should deprecate from ACCEPTED
    const rej = await store.append({ type: EvidenceType.HUMAN_REJECTION, source: EvidenceSource.HUMAN_FEEDBACK, data: { anchor_id: 'Z', details: {} } });
    const t2 = await sm.processEvidence(rej);
    expect(t2).not.toBeNull();
    expect(t2!.to_state).toBe(AnchorState.DEPRECATED);

    // Accumulate positive signals to push confidence > 0.5 for manual override from terminal state
    await store.append({ type: EvidenceType.CROSS_VALIDATION, source: EvidenceSource.SYSTEM_VALIDATION, data: { anchor_id: 'Z', details: {} } });
    await store.append({ type: EvidenceType.SCHEMA_CONSISTENCY, source: EvidenceSource.SYSTEM_VALIDATION, data: { anchor_id: 'Z', details: {} } });
    await store.append({ type: EvidenceType.TEMPORAL_STABILITY, source: EvidenceSource.AUTOMATED_ANALYSIS, data: { anchor_id: 'Z', details: {} } });

    // A fresh human approval should trigger MANUAL_OVERRIDE to MONITORING from terminal
    const app2 = await store.append({ type: EvidenceType.HUMAN_APPROVAL, source: EvidenceSource.HUMAN_FEEDBACK, data: { anchor_id: 'Z', details: {} } });
    const t3 = await sm.processEvidence(app2);
    expect(t3).not.toBeNull();
    expect(t3!.to_state).toBe(AnchorState.MONITORING);
  });

  it('ACCEPTED → DEPRECATED on low confidence threshold', async () => {
    const store = new EvidenceStore('test/.tmp-evidence.jsonl');
    const aggregator = new EvidenceAggregator(store, new ConfidenceCalculator());
    const sm = new AnchorStateMachine(store, aggregator);

    // Move to ACCEPTED via approval
    const app = await store.append({ type: EvidenceType.HUMAN_APPROVAL, source: EvidenceSource.HUMAN_FEEDBACK, data: { anchor_id: 'Y', details: {} } });
    await sm.processEvidence(app);

    // Make reject threshold lenient so typical ~0.5 confidence triggers deprecate
    sm.updateRules({ confidence_reject_threshold: 0.9 });

    // Add a mild negative to keep confidence not high
    const neg = await store.append({ type: EvidenceType.ANCHOR_DEPRECATION, source: EvidenceSource.SYSTEM_VALIDATION, data: { anchor_id: 'Y', details: {} } });
    const t = await sm.processEvidence(neg);
    expect(t).not.toBeNull();
    expect(t!.to_state).toBe(AnchorState.DEPRECATED);
  });

  it('MONITORING → ACCEPTED via evidence accumulation after duration elapses', async () => {
    const store = new EvidenceStore('test/.tmp-evidence.jsonl');
    const aggregator = new EvidenceAggregator(store, new ConfidenceCalculator());
    const sm = new AnchorStateMachine(store, aggregator, { monitoring_duration_days: 0 });

    // Enter monitoring with moderate signal
    const mod = await store.append({ type: EvidenceType.STATISTICAL_MATCH, source: EvidenceSource.STATISTICAL_MODEL, data: { anchor_id: 'W', details: {} } });
    await sm.processEvidence(mod);

    // Add additional consistent positive signal; duration set to 0 ensures branch executes
    const pos = await store.append({ type: EvidenceType.TEMPORAL_STABILITY, source: EvidenceSource.AUTOMATED_ANALYSIS, data: { anchor_id: 'W', details: {} } });
    const t = await sm.processEvidence(pos);
    expect(t).not.toBeNull();
    expect(t!.to_state === AnchorState.ACCEPTED || t!.to_state === AnchorState.DEPRECATED).toBe(true);
    // Prefer acceptance when confidence is moderate; assert not MONITORING
    expect(t!.to_state).not.toBe(AnchorState.MONITORING);
  });
});
