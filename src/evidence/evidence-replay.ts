import { Evidence, EvidenceStore, EvidenceQuery } from './evidence-store.js';
import { ConfidenceCalculator, ConfidenceResult } from './confidence-calculator.js';
import { AnchorStateMachine, AnchorState, StateTransition } from './anchor-state-machine.js';

export interface ReplayOptions {
  from_timestamp?: string;
  to_timestamp?: string;
  anchor_ids?: string[];
  evidence_types?: string[];
  step_by_step?: boolean;
  include_confidence_evolution?: boolean;
}

export interface ReplayResult {
  anchor_id: string;
  evidence_timeline: EvidenceStep[];
  confidence_evolution: ConfidenceEvolution[];
  state_transitions: StateTransition[];
  final_state: {
    confidence: ConfidenceResult;
    anchor_state: AnchorState;
    evidence_count: number;
  };
}

export interface EvidenceStep {
  evidence: Evidence;
  cumulative_confidence: number;
  confidence_change: number;
  state_after?: AnchorState;
  transition_triggered?: StateTransition;
}

export interface ConfidenceEvolution {
  timestamp: string;
  confidence: number;
  evidence_count: number;
  major_components: {
    positive_signals: number;
    negative_signals: number;
    temporal_decay: number;
  };
}

export interface ReplaySession {
  session_id: string;
  started_at: string;
  options: ReplayOptions;
  anchors_processed: number;
  total_evidence: number;
  completed: boolean;
}

export class EvidenceReplay {
  private evidenceStore: EvidenceStore;
  private confidenceCalculator: ConfidenceCalculator;
  private stateMachine: AnchorStateMachine;

  constructor(
    evidenceStore: EvidenceStore,
    confidenceCalculator: ConfidenceCalculator,
    stateMachine: AnchorStateMachine
  ) {
    this.evidenceStore = evidenceStore;
    this.confidenceCalculator = confidenceCalculator;
    this.stateMachine = stateMachine;
  }

  async replayEvidence(options: ReplayOptions = {}): Promise<ReplayResult[]> {
    const evidence = await this.loadEvidenceForReplay(options);
    const anchorGroups = this.groupEvidenceByAnchor(evidence);

    const results: ReplayResult[] = [];

    for (const [anchorId, anchorEvidence] of anchorGroups) {
      if (options.anchor_ids && !options.anchor_ids.includes(anchorId)) {
        continue;
      }

      const result = await this.replayAnchorEvidence(anchorId, anchorEvidence, options);
      results.push(result);
    }

    return results;
  }

  async replayAnchorEvidence(
    anchorId: string,
    evidence: Evidence[],
    options: ReplayOptions
  ): Promise<ReplayResult> {
    const sortedEvidence = [...evidence].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const evidenceTimeline: EvidenceStep[] = [];
    const confidenceEvolution: ConfidenceEvolution[] = [];
    const stateTransitions: StateTransition[] = [];

    const cumulativeEvidence: Evidence[] = [];
    let previousConfidence = 0.5;
    let currentState = AnchorState.PROPOSED;

    for (const ev of sortedEvidence) {
      cumulativeEvidence.push(ev);

      const confidenceResult = this.confidenceCalculator.calculateConfidence(cumulativeEvidence);
      const confidenceChange = confidenceResult.confidence - previousConfidence;

      const step: EvidenceStep = {
        evidence: ev,
        cumulative_confidence: confidenceResult.confidence,
        confidence_change: confidenceChange
      };

      const transition = await this.simulateStateTransition(anchorId, currentState, ev, cumulativeEvidence);
      if (transition) {
        step.state_after = transition.to_state;
        step.transition_triggered = transition;
        stateTransitions.push(transition);
        currentState = transition.to_state;
      }

      evidenceTimeline.push(step);

      if (options.include_confidence_evolution) {
        confidenceEvolution.push({
          timestamp: ev.timestamp,
          confidence: confidenceResult.confidence,
          evidence_count: cumulativeEvidence.length,
          major_components: {
            positive_signals: confidenceResult.components.positive_signals,
            negative_signals: confidenceResult.components.negative_signals,
            temporal_decay: confidenceResult.components.temporal_decay
          }
        });
      }

      previousConfidence = confidenceResult.confidence;

      if (options.step_by_step) {
        await this.pauseForStepByStep(step);
      }
    }

    const finalConfidence = this.confidenceCalculator.calculateConfidence(cumulativeEvidence);

    return {
      anchor_id: anchorId,
      evidence_timeline: evidenceTimeline,
      confidence_evolution: confidenceEvolution,
      state_transitions: stateTransitions,
      final_state: {
        confidence: finalConfidence,
        anchor_state: currentState,
        evidence_count: cumulativeEvidence.length
      }
    };
  }

  async replayWithTimeSlicing(
    options: ReplayOptions,
    timeSliceHours: number = 24
  ): Promise<{
    time_slices: Array<{
      from: string;
      to: string;
      anchors_changed: string[];
      confidence_changes: Record<string, { from: number; to: number }>;
      state_transitions: StateTransition[];
    }>;
    summary: ReplayResult[];
  }> {
    const evidence = await this.loadEvidenceForReplay(options);

    if (evidence.length === 0) {
      return { time_slices: [], summary: [] };
    }

    const sortedEvidence = [...evidence].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const startTime = new Date(sortedEvidence[0].timestamp);
    const endTime = new Date(sortedEvidence[sortedEvidence.length - 1].timestamp);

    const timeSlices: Array<{
      from: string;
      to: string;
      anchors_changed: string[];
      confidence_changes: Record<string, { from: number; to: number }>;
      state_transitions: StateTransition[];
    }> = [];

    const anchorStates = new Map<string, { confidence: number; state: AnchorState }>();
    let currentTime = new Date(startTime);

    while (currentTime < endTime) {
      const sliceStart = new Date(currentTime);
      const sliceEnd = new Date(currentTime.getTime() + timeSliceHours * 60 * 60 * 1000);

      const sliceEvidence = sortedEvidence.filter(e => {
        const evidenceTime = new Date(e.timestamp);
        return evidenceTime >= sliceStart && evidenceTime < sliceEnd;
      });

      const anchorsChanged = new Set<string>();
      const confidenceChanges: Record<string, { from: number; to: number }> = {};
      const sliceTransitions: StateTransition[] = [];

      for (const ev of sliceEvidence) {
        const anchorId = ev.data.anchor_id;
        anchorsChanged.add(anchorId);

        const previousState = anchorStates.get(anchorId) || { confidence: 0.5, state: AnchorState.PROPOSED };

        const allEvidenceForAnchor = sortedEvidence.filter(e =>
          e.data.anchor_id === anchorId && new Date(e.timestamp) <= new Date(ev.timestamp)
        );

        const newConfidence = this.confidenceCalculator.calculateConfidence(allEvidenceForAnchor);

        confidenceChanges[anchorId] = {
          from: previousState.confidence,
          to: newConfidence.confidence
        };

        anchorStates.set(anchorId, {
          confidence: newConfidence.confidence,
          state: previousState.state
        });
      }

      timeSlices.push({
        from: sliceStart.toISOString(),
        to: sliceEnd.toISOString(),
        anchors_changed: Array.from(anchorsChanged),
        confidence_changes: confidenceChanges,
        state_transitions: sliceTransitions
      });

      currentTime = sliceEnd;
    }

    const summary = await this.replayEvidence(options);

    return { time_slices: timeSlices, summary };
  }

  async generateReplayReport(results: ReplayResult[]): Promise<string> {
    const lines: string[] = [];

    lines.push('Evidence Replay Report');
    lines.push('====================');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Anchors Analyzed: ${results.length}`);
    lines.push('');

    for (const result of results) {
      lines.push(`Anchor: ${result.anchor_id}`);
      lines.push(`Evidence Steps: ${result.evidence_timeline.length}`);
      lines.push(`State Transitions: ${result.state_transitions.length}`);
      lines.push(`Final Confidence: ${(result.final_state.confidence.confidence * 100).toFixed(1)}%`);
      lines.push(`Final State: ${result.final_state.anchor_state}`);
      lines.push('');

      if (result.confidence_evolution.length > 0) {
        lines.push('Confidence Evolution:');
        const significantChanges = result.confidence_evolution.filter((ev, i) =>
          i === 0 || Math.abs(ev.confidence - result.confidence_evolution[i - 1].confidence) > 0.1
        );

        for (const evolution of significantChanges) {
          lines.push(`  ${evolution.timestamp}: ${(evolution.confidence * 100).toFixed(1)}% (${evolution.evidence_count} evidence)`);
        }
        lines.push('');
      }

      if (result.state_transitions.length > 0) {
        lines.push('State Transitions:');
        for (const transition of result.state_transitions) {
          lines.push(`  ${transition.timestamp}: ${transition.from_state} → ${transition.to_state} (${transition.trigger})`);
        }
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  private async loadEvidenceForReplay(options: ReplayOptions): Promise<Evidence[]> {
    const query: EvidenceQuery = {};

    if (options.from_timestamp) {
      query.from_timestamp = options.from_timestamp;
    }

    if (options.to_timestamp) {
      query.to_timestamp = options.to_timestamp;
    }

    return await this.evidenceStore.query(query);
  }

  private groupEvidenceByAnchor(evidence: Evidence[]): Map<string, Evidence[]> {
    const groups = new Map<string, Evidence[]>();

    for (const ev of evidence) {
      const anchorId = ev.data.anchor_id;
      if (!groups.has(anchorId)) {
        groups.set(anchorId, []);
      }
      groups.get(anchorId)!.push(ev);
    }

    return groups;
  }

  private async simulateStateTransition(
    anchorId: string,
    currentState: AnchorState,
    evidence: Evidence,
    cumulativeEvidence: Evidence[]
  ): Promise<StateTransition | null> {
    return null;
  }

  private async pauseForStepByStep(step: EvidenceStep): Promise<void> {
    console.log(`Step: ${step.evidence.type} at ${step.evidence.timestamp}`);
    console.log(`Confidence: ${(step.cumulative_confidence * 100).toFixed(1)}% (change: ${step.confidence_change > 0 ? '+' : ''}${(step.confidence_change * 100).toFixed(1)}%)`);

    if (step.transition_triggered) {
      console.log(`State Transition: ${step.transition_triggered.from_state} → ${step.transition_triggered.to_state}`);
    }

    console.log('---');
  }

  async createReplaySession(options: ReplayOptions): Promise<ReplaySession> {
    const sessionId = `replay-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    return {
      session_id: sessionId,
      started_at: new Date().toISOString(),
      options,
      anchors_processed: 0,
      total_evidence: 0,
      completed: false
    };
  }
}