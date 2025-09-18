import { AnchorStoreManager } from '../core/anchor-store';
import { StableColumnAnchor, AnchorMatchScore } from '../types/anchor.types';
import { PRAnalysisResult, SchemaChange } from './pr-analyzer';

export interface SemanticMapping {
  id: string;
  column: string;
  dataset: string;
  semantic_type: string;
  confidence: number;
  anchor_id?: string;
  evidence: string[];
  quick_accept_url: string;
}

export interface DriftDetection {
  column: string;
  dataset: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  suggested_action: string;
  file: string;
}

export interface HealthMetrics {
  coverage: number;
  driftRisk: 'low' | 'medium' | 'high';
  qualityScore: number;
  mappedColumns: number;
  totalColumns: number;
}

export interface SuggestionResult {
  newMappings: SemanticMapping[];
  driftDetections: DriftDetection[];
  healthMetrics: HealthMetrics;
  acceptAllId: string;
  processingTimeMs: number;
}

export class SuggestionEngine {
  private anchorStore: AnchorStoreManager;
  private pendingSuggestions: Map<string, SemanticMapping> = new Map();

  constructor(anchorStore: AnchorStoreManager) {
    this.anchorStore = anchorStore;
  }

  async generateSuggestions(analysis: PRAnalysisResult): Promise<SuggestionResult> {
    const startTime = Date.now();

    const newMappings = await this.generateSemanticMappings(analysis);
    const driftDetections = await this.detectDrift(analysis);
    const healthMetrics = await this.calculateHealthMetrics(analysis, newMappings);

    const acceptAllId = this.generateAcceptAllId(newMappings);

    // Store suggestions for quick accept
    for (const mapping of newMappings) {
      this.pendingSuggestions.set(mapping.id, mapping);
    }

    return {
      newMappings,
      driftDetections,
      healthMetrics,
      acceptAllId,
      processingTimeMs: Date.now() - startTime
    };
  }

  private async generateSemanticMappings(analysis: PRAnalysisResult): Promise<SemanticMapping[]> {
    const mappings: SemanticMapping[] = [];

    // Process schema changes for new columns
    for (const schemaChange of analysis.schemaChanges) {
      if (schemaChange.type === 'column_added') {
        const mapping = await this.suggestMappingForColumn(
          schemaChange.table,
          schemaChange.column,
          schemaChange.after
        );
        if (mapping) {
          mappings.push(mapping);
        }
      }
    }

    // Process data file changes
    for (const fileChange of analysis.dataFileChanges) {
      if (fileChange.status === 'added' && fileChange.patch) {
        const fileMappings = await this.suggestMappingsForDataFile(fileChange);
        mappings.push(...fileMappings);
      }
    }

    return mappings;
  }

  private async suggestMappingForColumn(
    table: string,
    column: string,
    metadata?: any
  ): Promise<SemanticMapping | null> {
    const columnInfo = {
      name: column,
      table: table,
      type: metadata?.type || 'unknown',
      constraints: metadata?.constraints || []
    };

    // Find similar anchors
    const similarAnchors = await this.findSimilarAnchors(columnInfo);

    if (similarAnchors.length > 0) {
      const bestMatch = similarAnchors[0];
      const semanticType = await this.inferSemanticType(columnInfo, bestMatch.anchor);

      const mapping: SemanticMapping = {
        id: this.generateSuggestionId(),
        column: column,
        dataset: table,
        semantic_type: semanticType,
        confidence: bestMatch.confidence,
        anchor_id: bestMatch.anchor.anchor_id,
        evidence: this.generateEvidence(columnInfo, bestMatch),
        quick_accept_url: this.generateQuickAcceptUrl(this.generateSuggestionId())
      };

      return mapping;
    }

    // Fallback to pattern-based inference
    const inferredType = this.inferSemanticTypeFromPattern(columnInfo);
    if (inferredType.confidence > 0.5) {
      return {
        id: this.generateSuggestionId(),
        column: column,
        dataset: table,
        semantic_type: inferredType.type,
        confidence: inferredType.confidence,
        evidence: inferredType.evidence,
        quick_accept_url: this.generateQuickAcceptUrl(this.generateSuggestionId())
      };
    }

    return null;
  }

  private async findSimilarAnchors(columnInfo: any): Promise<{ anchor: StableColumnAnchor; confidence: number }[]> {
    const allAnchors = await this.anchorStore.getAllAnchors();
    const scores: { anchor: StableColumnAnchor; confidence: number }[] = [];

    for (const anchor of allAnchors) {
      const confidence = this.calculateSimilarityScore(columnInfo, anchor);
      if (confidence > 0.3) {
        scores.push({ anchor, confidence });
      }
    }

    return scores.sort((a, b) => b.confidence - a.confidence);
  }

  private calculateSimilarityScore(columnInfo: any, anchor: StableColumnAnchor): number {
    let score = 0;
    let factors = 0;

    // Name similarity (Levenshtein distance)
    const nameSimilarity = this.calculateNameSimilarity(columnInfo.name, anchor.column_name);
    score += nameSimilarity * 0.4;
    factors += 0.4;

    // Type similarity
    const fingerprint = JSON.parse(anchor.fingerprint);
    if (fingerprint.dtype && columnInfo.type) {
      const typeSimilarity = this.calculateTypeSimilarity(columnInfo.type, fingerprint.dtype);
      score += typeSimilarity * 0.3;
      factors += 0.3;
    }

    // Pattern similarity (if available)
    if (fingerprint.regex_patterns && fingerprint.regex_patterns.length > 0) {
      const patternScore = this.calculatePatternSimilarity(columnInfo, fingerprint.regex_patterns);
      score += patternScore * 0.3;
      factors += 0.3;
    }

    return factors > 0 ? score / factors : 0;
  }

  private calculateNameSimilarity(name1: string, name2: string): number {
    const longer = name1.length > name2.length ? name1 : name2;
    const shorter = name1.length > name2.length ? name2 : name1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  private calculateTypeSimilarity(type1: string, type2: string): number {
    const normalized1 = this.normalizeType(type1);
    const normalized2 = this.normalizeType(type2);

    if (normalized1 === normalized2) return 1.0;

    // Similar types
    const similarities: Record<string, string[]> = {
      'integer': ['int', 'bigint', 'smallint', 'int64'],
      'string': ['text', 'varchar', 'char', 'str'],
      'float': ['double', 'decimal', 'numeric', 'float64'],
      'date': ['datetime', 'timestamp', 'time']
    };

    for (const [baseType, variants] of Object.entries(similarities)) {
      if ((normalized1 === baseType && variants.includes(normalized2)) ||
        (normalized2 === baseType && variants.includes(normalized1)) ||
        (variants.includes(normalized1) && variants.includes(normalized2))) {
        return 0.8;
      }
    }

    return 0;
  }

  private normalizeType(type: string): string {
    return type.toLowerCase().replace(/[^\w]/g, '');
  }

  private calculatePatternSimilarity(columnInfo: any, patterns: string[]): number {
    // This would ideally use sample data, but for now we'll use column name patterns
    const columnName = columnInfo.name.toLowerCase();

    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(columnName)) {
          return 0.7;
        }
      } catch {
        // Invalid regex, skip
      }
    }

    return 0;
  }

  private async inferSemanticType(columnInfo: any, anchor: StableColumnAnchor): Promise<string> {
    // If anchor has a mapped CID, use it
    if (anchor.mapped_cid) {
      return anchor.mapped_cid;
    }

    // Infer from column name and type
    return this.inferSemanticTypeFromPattern(columnInfo).type;
  }

  private inferSemanticTypeFromPattern(columnInfo: any): {
    type: string;
    confidence: number;
    evidence: string[];
  } {
    const name = columnInfo.name.toLowerCase();
    const type = columnInfo.type?.toLowerCase() || '';

    const patterns = [
      {
        pattern: /^(user_?)?id$/,
        type: 'identity.user_id',
        confidence: 0.9,
        evidence: ['Column name matches user ID pattern']
      },
      {
        pattern: /^(customer|cust)_?id$/,
        type: 'identity.customer_id',
        confidence: 0.9,
        evidence: ['Column name matches customer ID pattern']
      },
      {
        pattern: /^email$/,
        type: 'identity.email',
        confidence: 0.95,
        evidence: ['Column name is "email"']
      },
      {
        pattern: /^(created_at|timestamp|date_created)$/,
        type: 'temporal.created_at',
        confidence: 0.85,
        evidence: ['Column name indicates creation timestamp']
      },
      {
        pattern: /^(amount|price|cost|total)$/,
        type: 'money.amount',
        confidence: 0.8,
        evidence: ['Column name indicates monetary value']
      },
      {
        pattern: /^(name|title|label)$/,
        type: 'text.name',
        confidence: 0.7,
        evidence: ['Column name indicates text label']
      },
      {
        pattern: /^(phone|telephone)$/,
        type: 'contact.phone',
        confidence: 0.85,
        evidence: ['Column name indicates phone number']
      },
      {
        pattern: /^(address|addr)$/,
        type: 'location.address',
        confidence: 0.8,
        evidence: ['Column name indicates address']
      }
    ];

    for (const patternInfo of patterns) {
      if (patternInfo.pattern.test(name)) {
        return {
          type: patternInfo.type,
          confidence: patternInfo.confidence,
          evidence: patternInfo.evidence
        };
      }
    }

    // Type-based inference
    if (type.includes('int') || type.includes('bigint')) {
      return {
        type: 'numeric.integer',
        confidence: 0.6,
        evidence: ['Column type is integer']
      };
    }

    if (type.includes('varchar') || type.includes('text')) {
      return {
        type: 'text.string',
        confidence: 0.5,
        evidence: ['Column type is text']
      };
    }

    return {
      type: 'unknown',
      confidence: 0,
      evidence: ['No pattern matched']
    };
  }

  private async suggestMappingsForDataFile(fileChange: any): Promise<SemanticMapping[]> {
    // This would analyze CSV headers or JSON structure
    // For now, return empty array as this requires file content analysis
    return [];
  }

  private async detectDrift(analysis: PRAnalysisResult): Promise<DriftDetection[]> {
    const drifts: DriftDetection[] = [];

    for (const schemaChange of analysis.schemaChanges) {
      if (schemaChange.type === 'type_changed') {
        drifts.push({
          column: schemaChange.column,
          dataset: schemaChange.table,
          description: `Type changed from ${schemaChange.before?.type || 'unknown'} to ${schemaChange.after?.type || 'unknown'}`,
          severity: 'medium',
          suggested_action: 'Validate existing semantic mappings',
          file: `${schemaChange.table}.yml`
        });
      }

      if (schemaChange.type === 'column_removed') {
        drifts.push({
          column: schemaChange.column,
          dataset: schemaChange.table,
          description: `Column removed from schema`,
          severity: 'high',
          suggested_action: 'Remove semantic mapping',
          file: `${schemaChange.table}.yml`
        });
      }
    }

    return drifts;
  }

  private async calculateHealthMetrics(
    analysis: PRAnalysisResult,
    newMappings: SemanticMapping[]
  ): Promise<HealthMetrics> {
    // Count columns from schema changes
    const totalColumns = analysis.schemaChanges.filter(c => c.type === 'column_added').length;
    const mappedColumns = newMappings.length;

    const coverage = totalColumns > 0 ? mappedColumns / totalColumns : 1;

    const driftRisk = analysis.riskLevel;

    // Quality score based on confidence levels
    const avgConfidence = newMappings.length > 0
      ? newMappings.reduce((sum, m) => sum + m.confidence, 0) / newMappings.length
      : 1;

    const qualityScore = avgConfidence * 100;

    return {
      coverage,
      driftRisk,
      qualityScore,
      mappedColumns,
      totalColumns
    };
  }

  private generateEvidence(columnInfo: any, match: { anchor: StableColumnAnchor; confidence: number }): string[] {
    const evidence = [];

    if (match.confidence > 0.8) {
      evidence.push(`High similarity to existing anchor "${match.anchor.anchor_id}"`);
    }

    if (columnInfo.name === match.anchor.column_name) {
      evidence.push('Exact column name match');
    } else {
      evidence.push(`Similar column name to "${match.anchor.column_name}"`);
    }

    return evidence;
  }

  private generateSuggestionId(): string {
    return `sugg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateAcceptAllId(mappings: SemanticMapping[]): string {
    const ids = mappings.map(m => m.id).sort().join(',');
    return `accept_all_${Buffer.from(ids).toString('base64').substr(0, 10)}`;
  }

  private generateQuickAcceptUrl(suggestionId: string): string {
    return `https://github.com/owner/repo/actions/runs/accept?suggestion=${suggestionId}`;
  }

  async acceptSuggestion(suggestionId: string): Promise<boolean> {
    const suggestion = this.pendingSuggestions.get(suggestionId);
    if (!suggestion) {
      return false;
    }

    try {
      // Create new anchor from accepted suggestion
      const newAnchor: StableColumnAnchor = {
        dataset: suggestion.dataset,
        column_name: suggestion.column,
        anchor_id: suggestion.anchor_id || `sca_${Date.now()}`,
        fingerprint: JSON.stringify({
          dtype: 'inferred',
          cardinality: 0,
          regex_patterns: [],
          null_ratio: 0,
          unique_ratio: 0,
          sample_values: []
        }),
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        mapped_cid: suggestion.semantic_type,
        confidence: suggestion.confidence
      };

      await this.anchorStore.saveAnchor(newAnchor);
      this.pendingSuggestions.delete(suggestionId);

      return true;
    } catch (error) {
      console.error('Error accepting suggestion:', error);
      return false;
    }
  }

  async acceptSuggestionByData(suggestion: SemanticMapping): Promise<boolean> {
    try {
      const newAnchor: StableColumnAnchor = {
        dataset: suggestion.dataset,
        column_name: suggestion.column,
        anchor_id: suggestion.anchor_id || `sca_${Date.now()}`,
        fingerprint: JSON.stringify({
          dtype: 'inferred',
          cardinality: 0,
          regex_patterns: [],
          null_ratio: 0,
          unique_ratio: 0,
          sample_values: []
        }),
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        mapped_cid: suggestion.semantic_type,
        confidence: suggestion.confidence
      };

      await this.anchorStore.saveAnchor(newAnchor);
      return true;
    } catch (error) {
      console.error('Error accepting suggestion by data:', error);
      return false;
    }
  }

  async acceptAllSuggestions(acceptAllId: string): Promise<{ accepted: number; failed: number }> {
    let accepted = 0;
    let failed = 0;

    // Extract suggestion IDs from accept all ID
    const suggestions = Array.from(this.pendingSuggestions.values());

    for (const suggestion of suggestions) {
      const success = await this.acceptSuggestion(suggestion.id);
      if (success) {
        accepted++;
      } else {
        failed++;
      }
    }

    return { accepted, failed };
  }
}
