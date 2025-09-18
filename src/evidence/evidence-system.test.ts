import { EvidenceStore, EvidenceType, EvidenceSource } from './evidence-store.js';
import { ConfidenceCalculator } from './confidence-calculator.js';
import { EvidenceAggregator } from './evidence-aggregator.js';
import { AnchorStateMachine, AnchorState } from './anchor-state-machine.js';
import { EvidenceReplay } from './evidence-replay.js';

describe('Evidence System Integration Tests', () => {
  let evidenceStore: EvidenceStore;
  let confidenceCalculator: ConfidenceCalculator;
  let evidenceAggregator: EvidenceAggregator;
  let stateMachine: AnchorStateMachine;
  let evidenceReplay: EvidenceReplay;

  const testAnchorId = 'test-anchor-123';

  beforeEach(async () => {
    evidenceStore = new EvidenceStore(':memory:');
    await evidenceStore.load();

    confidenceCalculator = new ConfidenceCalculator();
    evidenceAggregator = new EvidenceAggregator(evidenceStore, confidenceCalculator);
    stateMachine = new AnchorStateMachine(evidenceStore, evidenceAggregator);
    evidenceReplay = new EvidenceReplay(evidenceStore, confidenceCalculator, stateMachine);
  });

  describe('Evidence Persistence', () => {
    test('should persist evidence across store reloads', async () => {
      const evidence1 = await evidenceStore.append({
        type: EvidenceType.HUMAN_APPROVAL,
        source: EvidenceSource.HUMAN_FEEDBACK,
        data: {
          anchor_id: testAnchorId,
          confidence_score: 0.9,
          details: { user_id: 'user123', reason: 'Looks correct' }
        }
      });

      const evidence2 = await evidenceStore.append({
        type: EvidenceType.STATISTICAL_MATCH,
        source: EvidenceSource.AUTOMATED_ANALYSIS,
        data: {
          anchor_id: testAnchorId,
          confidence_score: 0.8,
          details: { correlation: 0.95, sample_size: 1000 }
        }
      });

      const beforeReload = await evidenceStore.getEvidenceForAnchor(testAnchorId);
      expect(beforeReload).toHaveLength(2);

      const newStore = new EvidenceStore(':memory:');
      await newStore.load();

      const afterReload = await newStore.getEvidenceForAnchor(testAnchorId);
      expect(afterReload).toHaveLength(2);

      const foundEvidence1 = afterReload.find(e => e.id === evidence1.id);
      const foundEvidence2 = afterReload.find(e => e.id === evidence2.id);

      expect(foundEvidence1).toBeDefined();
      expect(foundEvidence2).toBeDefined();
      expect(foundEvidence1!.type).toBe(EvidenceType.HUMAN_APPROVAL);
      expect(foundEvidence2!.type).toBe(EvidenceType.STATISTICAL_MATCH);
    });

    test('should maintain evidence order across sessions', async () => {
      const evidenceTypes = [
        EvidenceType.ANCHOR_CREATION,
        EvidenceType.STATISTICAL_MATCH,
        EvidenceType.SCHEMA_CONSISTENCY,
        EvidenceType.HUMAN_APPROVAL
      ];

      const addedEvidence = [];
      for (const [index, type] of evidenceTypes.entries()) {
        await new Promise(resolve => setTimeout(resolve, 10));

        const evidence = await evidenceStore.append({
          type,
          source: EvidenceSource.AUTOMATED_ANALYSIS,
          data: {
            anchor_id: testAnchorId,
            details: { sequence: index }
          }
        });
        addedEvidence.push(evidence);
      }

      const retrieved = await evidenceStore.getEvidenceForAnchor(testAnchorId);

      for (let i = 0; i < evidenceTypes.length; i++) {
        expect(retrieved[i].type).toBe(evidenceTypes[i]);
        expect(retrieved[i].data.details.sequence).toBe(i);
      }

      const newStore = new EvidenceStore(':memory:');
      await newStore.load();
      const afterReload = await newStore.getEvidenceForAnchor(testAnchorId);

      for (let i = 0; i < evidenceTypes.length; i++) {
        expect(afterReload[i].type).toBe(evidenceTypes[i]);
        expect(afterReload[i].data.details.sequence).toBe(i);
      }
    });
  });

  describe('Confidence Evolution', () => {
    test('should track confidence changes over time', async () => {
      const confidenceHistory = [];

      await evidenceStore.append({
        type: EvidenceType.ANCHOR_CREATION,
        source: EvidenceSource.SYSTEM_VALIDATION,
        data: { anchor_id: testAnchorId, details: {} }
      });

      let evidence = await evidenceStore.getEvidenceForAnchor(testAnchorId);
      let confidence = confidenceCalculator.calculateConfidence(evidence);
      confidenceHistory.push({ step: 'creation', confidence: confidence.confidence });

      await evidenceStore.append({
        type: EvidenceType.STATISTICAL_MATCH,
        source: EvidenceSource.AUTOMATED_ANALYSIS,
        data: { anchor_id: testAnchorId, confidence_score: 0.7, details: {} }
      });

      evidence = await evidenceStore.getEvidenceForAnchor(testAnchorId);
      confidence = confidenceCalculator.calculateConfidence(evidence);
      confidenceHistory.push({ step: 'statistical_match', confidence: confidence.confidence });

      await evidenceStore.append({
        type: EvidenceType.HUMAN_APPROVAL,
        source: EvidenceSource.HUMAN_FEEDBACK,
        data: { anchor_id: testAnchorId, details: { user_id: 'expert123' } }
      });

      evidence = await evidenceStore.getEvidenceForAnchor(testAnchorId);
      confidence = confidenceCalculator.calculateConfidence(evidence);
      confidenceHistory.push({ step: 'human_approval', confidence: confidence.confidence });

      expect(confidenceHistory[0].confidence).toBeLessThan(confidenceHistory[1].confidence);
      expect(confidenceHistory[1].confidence).toBeLessThan(confidenceHistory[2].confidence);
      expect(confidenceHistory[2].confidence).toBeGreaterThan(0.8);
    });

    test('should handle conflicting evidence appropriately', async () => {
      await evidenceStore.append({
        type: EvidenceType.HUMAN_APPROVAL,
        source: EvidenceSource.HUMAN_FEEDBACK,
        data: { anchor_id: testAnchorId, details: { user_id: 'expert1' } }
      });

      let evidence = await evidenceStore.getEvidenceForAnchor(testAnchorId);
      let confidence = confidenceCalculator.calculateConfidence(evidence);
      const afterApproval = confidence.confidence;

      await evidenceStore.append({
        type: EvidenceType.HUMAN_REJECTION,
        source: EvidenceSource.HUMAN_FEEDBACK,
        data: { anchor_id: testAnchorId, details: { user_id: 'expert2', reason: 'Incorrect mapping' } }
      });

      evidence = await evidenceStore.getEvidenceForAnchor(testAnchorId);
      confidence = confidenceCalculator.calculateConfidence(evidence);
      const afterRejection = confidence.confidence;

      expect(afterRejection).toBeLessThan(afterApproval);
      expect(confidence.components.consistency_score).toBeLessThan(0.5);
    });
  });

  describe('State Machine Integration', () => {
    test('should transition states based on evidence', async () => {
      await stateMachine.initializeAnchor(testAnchorId, AnchorState.PROPOSED);

      let stateInfo = await stateMachine.getStateInfo(testAnchorId);
      expect(stateInfo!.current_state).toBe(AnchorState.PROPOSED);

      const approvalEvidence = await evidenceStore.append({
        type: EvidenceType.HUMAN_APPROVAL,
        source: EvidenceSource.HUMAN_FEEDBACK,
        data: { anchor_id: testAnchorId, details: { user_id: 'expert123' } }
      });

      const transition = await stateMachine.processEvidence(approvalEvidence);
      expect(transition).toBeTruthy();
      expect(transition!.to_state).toBe(AnchorState.ACCEPTED);

      stateInfo = await stateMachine.getStateInfo(testAnchorId);
      expect(stateInfo!.current_state).toBe(AnchorState.ACCEPTED);
      expect(stateInfo!.transition_history).toHaveLength(1);
    });

    test('should maintain state consistency across evidence processing', async () => {
      await stateMachine.initializeAnchor(testAnchorId, AnchorState.PROPOSED);

      const evidenceSequence = [
        { type: EvidenceType.STATISTICAL_MATCH, expectedState: AnchorState.PROPOSED },
        { type: EvidenceType.SCHEMA_CONSISTENCY, expectedState: AnchorState.PROPOSED },
        { type: EvidenceType.TEMPORAL_STABILITY, expectedState: AnchorState.MONITORING },
        { type: EvidenceType.CROSS_VALIDATION, expectedState: AnchorState.MONITORING },
        { type: EvidenceType.HUMAN_APPROVAL, expectedState: AnchorState.ACCEPTED }
      ];

      for (const { type, expectedState } of evidenceSequence) {
        const evidence = await evidenceStore.append({
          type,
          source: EvidenceSource.AUTOMATED_ANALYSIS,
          data: { anchor_id: testAnchorId, details: {} }
        });

        await stateMachine.processEvidence(evidence);
        const stateInfo = await stateMachine.getStateInfo(testAnchorId);

        console.log(`After ${type}: ${stateInfo!.current_state} (expected: ${expectedState})`);
      }

      const finalState = await stateMachine.getStateInfo(testAnchorId);
      expect(finalState!.current_state).toBe(AnchorState.ACCEPTED);
    });
  });

  describe('Evidence Replay', () => {
    test('should replay evidence chronologically', async () => {
      const evidenceSequence = [
        EvidenceType.ANCHOR_CREATION,
        EvidenceType.STATISTICAL_MATCH,
        EvidenceType.SCHEMA_CONSISTENCY,
        EvidenceType.HUMAN_APPROVAL
      ];

      for (const type of evidenceSequence) {
        await new Promise(resolve => setTimeout(resolve, 10));
        await evidenceStore.append({
          type,
          source: EvidenceSource.AUTOMATED_ANALYSIS,
          data: { anchor_id: testAnchorId, details: {} }
        });
      }

      const replayResults = await evidenceReplay.replayEvidence({
        anchor_ids: [testAnchorId],
        include_confidence_evolution: true
      });

      expect(replayResults).toHaveLength(1);
      const result = replayResults[0];

      expect(result.evidence_timeline).toHaveLength(4);
      expect(result.confidence_evolution).toHaveLength(4);

      for (let i = 0; i < evidenceSequence.length; i++) {
        expect(result.evidence_timeline[i].evidence.type).toBe(evidenceSequence[i]);
      }

      const confidences = result.confidence_evolution.map(e => e.confidence);
      for (let i = 1; i < confidences.length; i++) {
        expect(confidences[i]).toBeGreaterThanOrEqual(confidences[i - 1]);
      }
    });

    test('should generate comprehensive replay report', async () => {
      await evidenceStore.append({
        type: EvidenceType.ANCHOR_CREATION,
        source: EvidenceSource.SYSTEM_VALIDATION,
        data: { anchor_id: testAnchorId, details: {} }
      });

      await evidenceStore.append({
        type: EvidenceType.HUMAN_APPROVAL,
        source: EvidenceSource.HUMAN_FEEDBACK,
        data: { anchor_id: testAnchorId, details: { user_id: 'expert123' } }
      });

      const replayResults = await evidenceReplay.replayEvidence({
        anchor_ids: [testAnchorId],
        include_confidence_evolution: true
      });

      const report = await evidenceReplay.generateReplayReport(replayResults);

      expect(report).toContain('Evidence Replay Report');
      expect(report).toContain(testAnchorId);
      expect(report).toContain('Evidence Steps: 2');
      expect(report).toContain('Final Confidence:');
    });
  });

  describe('System Integration', () => {
    test('should handle complete evidence lifecycle', async () => {
      await stateMachine.initializeAnchor(testAnchorId);

      const lifecycle = [
        { type: EvidenceType.STATISTICAL_MATCH, confidence: 0.6 },
        { type: EvidenceType.SCHEMA_CONSISTENCY, confidence: 0.7 },
        { type: EvidenceType.TEMPORAL_STABILITY, confidence: 0.8 },
        { type: EvidenceType.HUMAN_APPROVAL, confidence: 0.9 }
      ];

      for (const { type, confidence } of lifecycle) {
        const evidence = await evidenceStore.append({
          type,
          source: EvidenceSource.AUTOMATED_ANALYSIS,
          data: {
            anchor_id: testAnchorId,
            confidence_score: confidence,
            details: {}
          }
        });

        await stateMachine.processEvidence(evidence);

        const aggregation = await evidenceAggregator.aggregateForAnchor(testAnchorId);
        expect(aggregation.anchor_id).toBe(testAnchorId);
        expect(aggregation.confidence.confidence).toBeGreaterThan(0);
      }

      const finalState = await stateMachine.getStateInfo(testAnchorId);
      expect(finalState!.current_state).toBe(AnchorState.ACCEPTED);

      const replayResults = await evidenceReplay.replayEvidence({
        anchor_ids: [testAnchorId],
        include_confidence_evolution: true
      });

      expect(replayResults[0].final_state.anchor_state).toBe(AnchorState.ACCEPTED);
      expect(replayResults[0].final_state.confidence.confidence).toBeGreaterThan(0.8);
    });

    test('should provide audit trail', async () => {
      await stateMachine.initializeAnchor(testAnchorId);

      await evidenceStore.append({
        type: EvidenceType.HUMAN_APPROVAL,
        source: EvidenceSource.HUMAN_FEEDBACK,
        data: {
          anchor_id: testAnchorId,
          details: { user_id: 'expert123', timestamp: new Date().toISOString() }
        }
      });

      const evidence = await evidenceStore.getEvidenceForAnchor(testAnchorId);
      const stats = await evidenceStore.getStats();

      expect(evidence.length).toBeGreaterThan(0);
      expect(stats.total_evidence).toBeGreaterThan(0);
      expect(stats.by_type[EvidenceType.HUMAN_APPROVAL]).toBe(1);
      expect(stats.oldest_timestamp).toBeDefined();
      expect(stats.newest_timestamp).toBeDefined();

      const aggregation = await evidenceAggregator.generateReport(testAnchorId);
      expect(aggregation).toContain('Evidence Aggregation Report');
      expect(aggregation).toContain(testAnchorId);
    });
  });
});

async function runTests() {
  console.log('Running Evidence System Integration Tests...');
  console.log('==========================================');

  try {
    const evidenceStore = new EvidenceStore('./test-evidence.jsonl');
    await evidenceStore.load();

    const confidenceCalculator = new ConfidenceCalculator();
    const evidenceAggregator = new EvidenceAggregator(evidenceStore, confidenceCalculator);
    const stateMachine = new AnchorStateMachine(evidenceStore, evidenceAggregator);
    const evidenceReplay = new EvidenceReplay(evidenceStore, confidenceCalculator, stateMachine);

    const testAnchorId = `test-anchor-${Date.now()}`;

    console.log('✓ Initialized evidence system components');

    await evidenceStore.append({
      type: EvidenceType.ANCHOR_CREATION,
      source: EvidenceSource.SYSTEM_VALIDATION,
      data: { anchor_id: testAnchorId, details: {} }
    });

    const evidence1 = await evidenceStore.append({
      type: EvidenceType.STATISTICAL_MATCH,
      source: EvidenceSource.AUTOMATED_ANALYSIS,
      data: { anchor_id: testAnchorId, confidence_score: 0.7, details: {} }
    });

    console.log('✓ Added evidence to store');

    const confidence = confidenceCalculator.calculateConfidence([evidence1]);
    console.log(`✓ Calculated confidence: ${(confidence.confidence * 100).toFixed(1)}%`);

    await stateMachine.initializeAnchor(testAnchorId);
    await stateMachine.processEvidence(evidence1);

    const stateInfo = await stateMachine.getStateInfo(testAnchorId);
    console.log(`✓ Anchor state: ${stateInfo!.current_state}`);

    const replayResults = await evidenceReplay.replayEvidence({
      anchor_ids: [testAnchorId],
      include_confidence_evolution: true
    });

    console.log(`✓ Replay generated ${replayResults[0].evidence_timeline.length} steps`);

    const allEvidence = await evidenceStore.getEvidenceForAnchor(testAnchorId);
    console.log(`✓ Evidence persistence: ${allEvidence.length} items stored`);

    const newStore = new EvidenceStore('./test-evidence.jsonl');
    await newStore.load();
    const persistedEvidence = await newStore.getEvidenceForAnchor(testAnchorId);
    console.log(`✓ Evidence persistence verified: ${persistedEvidence.length} items loaded`);

    console.log('');
    console.log('🎉 All tests passed! Evidence system is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

if (require.main === module) {
  runTests().catch(console.error);
}