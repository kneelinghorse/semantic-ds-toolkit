import { Evidence, EvidenceStore, EvidenceType, EvidenceSource } from './evidence-store.js';
import { EvidenceAggregator, AnchorRecommendation } from './evidence-aggregator.js';
import { StableColumnAnchor } from '../types/anchor.types.js';

export enum AnchorState {
  PROPOSED = 'proposed',
  ACCEPTED = 'accepted',
  DEPRECATED = 'deprecated',
  REJECTED = 'rejected',
  MONITORING = 'monitoring'
}

export interface StateTransition {
  from_state: AnchorState;
  to_state: AnchorState;
  timestamp: string;
  trigger: TransitionTrigger;
  evidence_id?: string;
  metadata?: Record<string, any>;
}

export enum TransitionTrigger {
  CONFIDENCE_THRESHOLD = 'confidence_threshold',
  HUMAN_APPROVAL = 'human_approval',
  HUMAN_REJECTION = 'human_rejection',
  EVIDENCE_ACCUMULATION = 'evidence_accumulation',
  TEMPORAL_DECAY = 'temporal_decay',
  SYSTEM_VALIDATION = 'system_validation',
  MANUAL_OVERRIDE = 'manual_override'
}

export interface AnchorStateInfo {
  anchor_id: string;
  current_state: AnchorState;
  state_since: string;
  transition_history: StateTransition[];
  next_review_due?: string;
}

export interface StateTransitionRules {
  confidence_accept_threshold: number;
  confidence_reject_threshold: number;
  monitoring_duration_days: number;
  auto_deprecate_days: number;
  evidence_accumulation_threshold: number;
}

export class AnchorStateMachine {
  private evidenceStore: EvidenceStore;
  private evidenceAggregator: EvidenceAggregator;
  private stateStore: Map<string, AnchorStateInfo> = new Map();
  private rules: StateTransitionRules;

  constructor(
    evidenceStore: EvidenceStore,
    evidenceAggregator: EvidenceAggregator,
    rules?: Partial<StateTransitionRules>
  ) {
    this.evidenceStore = evidenceStore;
    this.evidenceAggregator = evidenceAggregator;
    this.rules = {
      confidence_accept_threshold: 0.8,
      confidence_reject_threshold: 0.2,
      monitoring_duration_days: 30,
      auto_deprecate_days: 90,
      evidence_accumulation_threshold: 10,
      ...rules
    };
  }

  async initializeAnchor(anchorId: string, initialState: AnchorState = AnchorState.PROPOSED): Promise<AnchorStateInfo> {
    const stateInfo: AnchorStateInfo = {
      anchor_id: anchorId,
      current_state: initialState,
      state_since: new Date().toISOString(),
      transition_history: [],
      next_review_due: this.calculateNextReview(initialState)
    };

    this.stateStore.set(anchorId, stateInfo);

    await this.evidenceStore.append({
      type: EvidenceType.ANCHOR_CREATION,
      source: EvidenceSource.SYSTEM_VALIDATION,
      data: {
        anchor_id: anchorId,
        details: { initial_state: initialState }
      }
    });

    return stateInfo;
  }

  async processEvidence(evidence: Evidence): Promise<StateTransition | null> {
    const anchorId = evidence.data.anchor_id;
    let stateInfo = this.stateStore.get(anchorId);

    if (!stateInfo) {
      stateInfo = await this.initializeAnchor(anchorId);
    }

    const aggregationResult = await this.evidenceAggregator.aggregateForAnchor(anchorId);
    const recommendedTransition = this.evaluateTransition(stateInfo, aggregationResult, evidence);

    if (recommendedTransition) {
      return await this.executeTransition(anchorId, recommendedTransition, evidence);
    }

    return null;
  }

  private evaluateTransition(
    stateInfo: AnchorStateInfo,
    aggregationResult: any,
    evidence: Evidence
  ): { to_state: AnchorState; trigger: TransitionTrigger } | null {
    const currentState = stateInfo.current_state;
    const confidence = aggregationResult.confidence.confidence;
    const recommendation = aggregationResult.recommendation;

    switch (currentState) {
      case AnchorState.PROPOSED:
        return this.evaluateFromProposed(confidence, recommendation, evidence);

      case AnchorState.MONITORING:
        return this.evaluateFromMonitoring(stateInfo, confidence, recommendation, evidence);

      case AnchorState.ACCEPTED:
        return this.evaluateFromAccepted(confidence, recommendation, evidence);

      case AnchorState.DEPRECATED:
      case AnchorState.REJECTED:
        return this.evaluateFromTerminalState(confidence, recommendation, evidence);

      default:
        return null;
    }
  }

  private evaluateFromProposed(
    confidence: number,
    recommendation: AnchorRecommendation,
    evidence: Evidence
  ): { to_state: AnchorState; trigger: TransitionTrigger } | null {
    if (evidence.type === EvidenceType.HUMAN_APPROVAL) {
      return { to_state: AnchorState.ACCEPTED, trigger: TransitionTrigger.HUMAN_APPROVAL };
    }

    if (evidence.type === EvidenceType.HUMAN_REJECTION) {
      return { to_state: AnchorState.REJECTED, trigger: TransitionTrigger.HUMAN_REJECTION };
    }

    if (confidence >= this.rules.confidence_accept_threshold) {
      return { to_state: AnchorState.ACCEPTED, trigger: TransitionTrigger.CONFIDENCE_THRESHOLD };
    }

    if (confidence <= this.rules.confidence_reject_threshold) {
      return { to_state: AnchorState.REJECTED, trigger: TransitionTrigger.CONFIDENCE_THRESHOLD };
    }

    if (recommendation === AnchorRecommendation.MONITOR) {
      return { to_state: AnchorState.MONITORING, trigger: TransitionTrigger.EVIDENCE_ACCUMULATION };
    }

    return null;
  }

  private evaluateFromMonitoring(
    stateInfo: AnchorStateInfo,
    confidence: number,
    recommendation: AnchorRecommendation,
    evidence: Evidence
  ): { to_state: AnchorState; trigger: TransitionTrigger } | null {
    if (evidence.type === EvidenceType.HUMAN_APPROVAL) {
      return { to_state: AnchorState.ACCEPTED, trigger: TransitionTrigger.HUMAN_APPROVAL };
    }

    if (evidence.type === EvidenceType.HUMAN_REJECTION) {
      return { to_state: AnchorState.REJECTED, trigger: TransitionTrigger.HUMAN_REJECTION };
    }

    if (confidence >= this.rules.confidence_accept_threshold) {
      return { to_state: AnchorState.ACCEPTED, trigger: TransitionTrigger.CONFIDENCE_THRESHOLD };
    }

    if (confidence <= this.rules.confidence_reject_threshold) {
      return { to_state: AnchorState.REJECTED, trigger: TransitionTrigger.CONFIDENCE_THRESHOLD };
    }

    const monitoringDuration = this.getStateDurationDays(stateInfo);
    if (monitoringDuration >= this.rules.monitoring_duration_days) {
      if (confidence < 0.5) {
        return { to_state: AnchorState.DEPRECATED, trigger: TransitionTrigger.TEMPORAL_DECAY };
      } else {
        return { to_state: AnchorState.ACCEPTED, trigger: TransitionTrigger.EVIDENCE_ACCUMULATION };
      }
    }

    return null;
  }

  private evaluateFromAccepted(
    confidence: number,
    recommendation: AnchorRecommendation,
    evidence: Evidence
  ): { to_state: AnchorState; trigger: TransitionTrigger } | null {
    if (evidence.type === EvidenceType.HUMAN_REJECTION) {
      return { to_state: AnchorState.DEPRECATED, trigger: TransitionTrigger.HUMAN_REJECTION };
    }

    if (confidence <= this.rules.confidence_reject_threshold) {
      return { to_state: AnchorState.DEPRECATED, trigger: TransitionTrigger.CONFIDENCE_THRESHOLD };
    }

    if (recommendation === AnchorRecommendation.DEPRECATE) {
      return { to_state: AnchorState.DEPRECATED, trigger: TransitionTrigger.EVIDENCE_ACCUMULATION };
    }

    return null;
  }

  private evaluateFromTerminalState(
    confidence: number,
    recommendation: AnchorRecommendation,
    evidence: Evidence
  ): { to_state: AnchorState; trigger: TransitionTrigger } | null {
    if (evidence.type === EvidenceType.HUMAN_APPROVAL && confidence > 0.5) {
      return { to_state: AnchorState.MONITORING, trigger: TransitionTrigger.MANUAL_OVERRIDE };
    }

    return null;
  }

  private async executeTransition(
    anchorId: string,
    transition: { to_state: AnchorState; trigger: TransitionTrigger },
    triggeringEvidence: Evidence
  ): Promise<StateTransition> {
    const stateInfo = this.stateStore.get(anchorId)!;

    const stateTransition: StateTransition = {
      from_state: stateInfo.current_state,
      to_state: transition.to_state,
      timestamp: new Date().toISOString(),
      trigger: transition.trigger,
      evidence_id: triggeringEvidence.id,
      metadata: {
        confidence: triggeringEvidence.data.confidence_score,
        evidence_type: triggeringEvidence.type
      }
    };

    stateInfo.current_state = transition.to_state;
    stateInfo.state_since = stateTransition.timestamp;
    stateInfo.transition_history.push(stateTransition);
    stateInfo.next_review_due = this.calculateNextReview(transition.to_state);

    await this.evidenceStore.append({
      type: EvidenceType.ANCHOR_CREATION,
      source: EvidenceSource.SYSTEM_VALIDATION,
      data: {
        anchor_id: anchorId,
        details: {
          state_transition: stateTransition,
          trigger: transition.trigger
        }
      }
    });

    return stateTransition;
  }

  private calculateNextReview(state: AnchorState): string | undefined {
    const now = new Date();
    let reviewDays: number;

    switch (state) {
      case AnchorState.PROPOSED:
        reviewDays = 7;
        break;
      case AnchorState.MONITORING:
        reviewDays = this.rules.monitoring_duration_days;
        break;
      case AnchorState.ACCEPTED:
        reviewDays = 60;
        break;
      default:
        return undefined;
    }

    return new Date(now.getTime() + reviewDays * 24 * 60 * 60 * 1000).toISOString();
  }

  private getStateDurationDays(stateInfo: AnchorStateInfo): number {
    const now = new Date().getTime();
    const stateSince = new Date(stateInfo.state_since).getTime();
    return (now - stateSince) / (1000 * 60 * 60 * 24);
  }

  async getStateInfo(anchorId: string): Promise<AnchorStateInfo | null> {
    return this.stateStore.get(anchorId) || null;
  }

  async getAllStates(): Promise<AnchorStateInfo[]> {
    return Array.from(this.stateStore.values());
  }

  async getAnchorsByState(state: AnchorState): Promise<AnchorStateInfo[]> {
    return Array.from(this.stateStore.values()).filter(info => info.current_state === state);
  }

  async getAnchorsForReview(): Promise<AnchorStateInfo[]> {
    const now = new Date().toISOString();
    return Array.from(this.stateStore.values()).filter(info =>
      info.next_review_due && info.next_review_due <= now
    );
  }

  async forceTransition(
    anchorId: string,
    toState: AnchorState,
    reason: string
  ): Promise<StateTransition> {
    const stateInfo = this.stateStore.get(anchorId);
    if (!stateInfo) {
      throw new Error(`Anchor ${anchorId} not found in state machine`);
    }

    const evidence = await this.evidenceStore.append({
      type: EvidenceType.ANCHOR_CREATION,
      source: EvidenceSource.HUMAN_FEEDBACK,
      data: {
        anchor_id: anchorId,
        details: { manual_override: true, reason }
      }
    });

    return await this.executeTransition(
      anchorId,
      { to_state: toState, trigger: TransitionTrigger.MANUAL_OVERRIDE },
      evidence
    );
  }

  updateRules(newRules: Partial<StateTransitionRules>): void {
    this.rules = { ...this.rules, ...newRules };
  }

  getRules(): StateTransitionRules {
    return { ...this.rules };
  }
}