import { StableColumnAnchor } from '../types/anchor.types.js';

export interface Evidence {
  id: string;
  timestamp: string;
  type: EvidenceType;
  source: EvidenceSource;
  data: EvidenceData;
  metadata?: Record<string, any>;
}

export enum EvidenceType {
  HUMAN_APPROVAL = 'human_approval',
  HUMAN_REJECTION = 'human_rejection',
  STATISTICAL_MATCH = 'statistical_match',
  SCHEMA_CONSISTENCY = 'schema_consistency',
  TEMPORAL_STABILITY = 'temporal_stability',
  CROSS_VALIDATION = 'cross_validation',
  ANCHOR_CREATION = 'anchor_creation',
  ANCHOR_DEPRECATION = 'anchor_deprecation'
}

export enum EvidenceSource {
  HUMAN_FEEDBACK = 'human_feedback',
  AUTOMATED_ANALYSIS = 'automated_analysis',
  CROSS_REFERENCE = 'cross_reference',
  STATISTICAL_MODEL = 'statistical_model',
  SYSTEM_VALIDATION = 'system_validation'
}

export interface EvidenceData {
  anchor_id: string;
  column_name?: string;
  dataset?: string;
  confidence_score?: number;
  details: Record<string, any>;
}

export interface EvidenceQuery {
  anchor_id?: string;
  type?: EvidenceType;
  source?: EvidenceSource;
  from_timestamp?: string;
  to_timestamp?: string;
  limit?: number;
}

export class EvidenceStore {
  private evidence: Evidence[] = [];
  private readonly storePath: string;

  constructor(storePath: string = './evidence.jsonl') {
    this.storePath = storePath;
  }

  async append(evidenceData: Omit<Evidence, 'id' | 'timestamp'>): Promise<Evidence> {
    const evidence: Evidence = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      ...evidenceData
    };

    this.evidence.push(evidence);
    await this.persist(evidence);

    return evidence;
  }

  async query(query: EvidenceQuery = {}): Promise<Evidence[]> {
    let results = [...this.evidence];

    if (query.anchor_id) {
      results = results.filter(e => e.data.anchor_id === query.anchor_id);
    }

    if (query.type) {
      results = results.filter(e => e.type === query.type);
    }

    if (query.source) {
      results = results.filter(e => e.source === query.source);
    }

    if (query.from_timestamp) {
      results = results.filter(e => e.timestamp >= query.from_timestamp!);
    }

    if (query.to_timestamp) {
      results = results.filter(e => e.timestamp <= query.to_timestamp!);
    }

    results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  async getEvidenceForAnchor(anchorId: string): Promise<Evidence[]> {
    return this.query({ anchor_id: anchorId });
  }

  async getRecentEvidence(hours: number = 24): Promise<Evidence[]> {
    const fromTimestamp = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    return this.query({ from_timestamp: fromTimestamp });
  }

  async load(): Promise<void> {
    try {
      const fs = await import('fs');
      const readline = await import('readline');

      if (!fs.existsSync(this.storePath)) {
        return;
      }

      const fileStream = fs.createReadStream(this.storePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      this.evidence = [];
      for await (const line of rl) {
        if (line.trim()) {
          try {
            const evidence = JSON.parse(line) as Evidence;
            this.evidence.push(evidence);
          } catch (error) {
            console.warn(`Failed to parse evidence line: ${line}`, error);
          }
        }
      }

      this.evidence.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    } catch (error) {
      console.error('Failed to load evidence store:', error);
    }
  }

  private async persist(evidence: Evidence): Promise<void> {
    try {
      const fs = await import('fs');
      const line = JSON.stringify(evidence) + '\n';

      await fs.promises.appendFile(this.storePath, line, 'utf8');
    } catch (error) {
      console.error('Failed to persist evidence:', error);
      throw error;
    }
  }

  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }

  async replay(fromTimestamp?: string): Promise<Evidence[]> {
    const query: EvidenceQuery = {};
    if (fromTimestamp) {
      query.from_timestamp = fromTimestamp;
    }

    return this.query(query);
  }

  async getStats(): Promise<{
    total_evidence: number;
    by_type: Record<string, number>;
    by_source: Record<string, number>;
    oldest_timestamp?: string;
    newest_timestamp?: string;
  }> {
    const stats = {
      total_evidence: this.evidence.length,
      by_type: {} as Record<string, number>,
      by_source: {} as Record<string, number>,
      oldest_timestamp: undefined as string | undefined,
      newest_timestamp: undefined as string | undefined
    };

    if (this.evidence.length === 0) {
      return stats;
    }

    stats.oldest_timestamp = this.evidence[0].timestamp;
    stats.newest_timestamp = this.evidence[this.evidence.length - 1].timestamp;

    for (const evidence of this.evidence) {
      stats.by_type[evidence.type] = (stats.by_type[evidence.type] || 0) + 1;
      stats.by_source[evidence.source] = (stats.by_source[evidence.source] || 0) + 1;
    }

    return stats;
  }
}