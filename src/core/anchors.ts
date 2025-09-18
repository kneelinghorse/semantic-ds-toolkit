import * as crypto from 'crypto';
import {
  StableColumnAnchor,
  ColumnFingerprint,
  ColumnStatistics,
  AnchorReconciliationResult,
  AnchorMatchScore,
  FingerprintConfig,
  ReconciliationOptions,
  ColumnData,
  DataType
} from '../types/anchor.types';

export class StableColumnAnchorSystem {
  private config: FingerprintConfig;
  private compiledPatterns: Array<{ raw: string; re: RegExp; tokens: string[] }> = [];

  constructor(config: Partial<FingerprintConfig> = {}) {
    this.config = {
      sample_size: 200,
      regex_patterns: [
        '(^|_)(id|pk|key)$',
        '(^|_)(cust|customer|user|person)(_id)?$',
        '(^|_)(email|mail)$',
        '(^|_)(phone|tel|mobile)$',
        '(^|_)(amount|price|cost|value)$',
        '(^|_)(date|time|timestamp)$',
        '(^|_)(name|title|label)$',
        '(^|_)(code|cd|abbr)$'
      ],
      min_cardinality_threshold: 10,
      max_unique_ratio: 0.99,
      ...config
    };

    this.compiledPatterns = this.compilePatterns(this.config.regex_patterns);
  }

  generateAnchorId(): string {
    return `sca_${crypto.randomBytes(8).toString('hex')}`;
  }

  computeColumnStatistics(column: ColumnData): ColumnStatistics {
    const totalRows = column.values.length;
    let nullCount = 0;
    const uniqueValues = new Set<any>();
    let minValue: string | number | undefined;
    let maxValue: string | number | undefined;
    const isNumeric = column.data_type === 'int64' || column.data_type === 'float64';

    for (let i = 0; i < column.values.length; i++) {
      const raw = column.values[i];
      if (raw === null || raw === undefined || raw === '') {
        nullCount++;
        continue;
      }

      const asString = String(raw);
      if (isNumeric) {
        const num = Number(raw);
        if (!Number.isNaN(num)) uniqueValues.add(num);
        else uniqueValues.add(asString);
      } else {
        uniqueValues.add(asString);
      }

      if (isNumeric) {
        const num = Number(raw);
        if (!Number.isNaN(num)) {
          if (minValue === undefined || (typeof minValue === 'number' && num < minValue)) {
            minValue = num;
          }
          if (maxValue === undefined || (typeof maxValue === 'number' && num > maxValue)) {
            maxValue = num;
          }
        }
      } else {
        if (minValue === undefined || String(minValue) > asString) {
          minValue = asString;
        }
        if (maxValue === undefined || String(maxValue) < asString) {
          maxValue = asString;
        }
      }
    }

    const sampleSize = Math.min(this.config.sample_size, uniqueValues.size);
    const sampleValues: string[] = [];
    if (sampleSize > 0) {
      let count = 0;
      for (const v of uniqueValues) {
        sampleValues.push(String(v));
        count++;
        if (count >= sampleSize) break;
      }
    }

    return {
      total_rows: totalRows,
      null_count: nullCount,
      unique_count: uniqueValues.size,
      min_value: minValue,
      max_value: maxValue,
      data_type: column.data_type,
      sample_values: sampleValues
    };
  }

  detectRegexPatterns(columnName: string, sampleValues: string[]): string[] {
    const matchedPatterns: string[] = [];

    for (const compiled of this.compiledPatterns) {
      const { raw, re, tokens } = compiled;

      // Strong match on column name via regex
      if (re.test(columnName)) {
        matchedPatterns.push(raw);
        continue;
      }

      // Relaxed token match on column name (e.g., "cust_pk" should indicate customer)
      if (this.tokenMatchWithTokens(columnName, tokens)) {
        matchedPatterns.push(raw);
        continue;
      }

      // Evaluate value-based matches using regex with counters to avoid array allocations
      let regexMatches = 0;
      if (sampleValues.length > 0) {
        for (let i = 0; i < sampleValues.length; i++) {
          if (re.test(sampleValues[i])) regexMatches++;
        }
      }
      let matchRatio = sampleValues.length > 0 ? regexMatches / sampleValues.length : 0;

      // If regex is too strict, fall back to relaxed token-based value matching
      if (matchRatio === 0 && sampleValues.length > 0) {
        let tokenMatches = 0;
        for (let i = 0; i < sampleValues.length; i++) {
          if (this.tokenMatchWithTokens(sampleValues[i], tokens)) tokenMatches++;
        }
        matchRatio = tokenMatches / sampleValues.length;
      }

      if (matchRatio > 0.8) {
        matchedPatterns.push(raw);
      }
    }

    return matchedPatterns;
  }

  private compilePatterns(patterns: string[]): Array<{ raw: string; re: RegExp; tokens: string[] }> {
    return patterns.map(raw => ({ raw, re: new RegExp(raw, 'i'), tokens: this.extractTokens(raw) }));
  }

  private extractTokens(pattern: string): string[] {
    const groups = Array.from(pattern.matchAll(/\(([^)]+)\)/g));
    const tokens: string[] = [];
    for (const g of groups) {
      const parts = g[1].split('|');
      for (const p of parts) {
        const t = p.toLowerCase();
        const normalized = t.replace(/[^a-z]/g, '');
        if (normalized.length >= 3) tokens.push(normalized);
      }
    }
    return Array.from(new Set(tokens));
  }

  private tokenMatchWithTokens(text: string, tokens: string[]): boolean {
    if (tokens.length === 0) return false;
    const lower = String(text).toLowerCase();
    return tokens.some(tok => lower.includes(tok));
  }

  private splitCamelCase(input: string): string[] {
    return input.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^a-zA-Z0-9]+/);
  }

  private tokenizeName(name: string): string[] {
    const rawTokens = this.splitCamelCase(name).filter(Boolean).map(t => t.toLowerCase());
    const tokens = new Set<string>();
    for (const t of rawTokens) {
      tokens.add(t);
      if (t.length >= 3) tokens.add(t.slice(0, 3));
    }
    return Array.from(tokens);
  }

  private jaccardSimilarityFromTokens(a: string[], b: string[]): number {
    if (a.length === 0 && b.length === 0) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;
    const setA = new Set(a);
    const setB = new Set(b);
    let intersection = 0;
    let union = setA.size;
    for (const tok of setB) {
      if (setA.has(tok)) intersection++;
      else union++;
    }
    return union === 0 ? 0 : intersection / union;
  }

  inferDataType(values: any[]): DataType {
    let considered = 0;
    let intCount = 0;
    let floatCount = 0;
    let boolCount = 0;
    let dateCount = 0;

    for (let i = 0; i < values.length && considered < 100; i++) {
      const value = values[i];
      if (value === null || value === undefined || value === '') continue;
      considered++;

      const originalValue = value;
      const strValue = String(value).trim();

      if (typeof originalValue === 'boolean' || strValue === 'true' || strValue === 'false') {
        boolCount++;
      } else if (typeof originalValue === 'number') {
        if (Number.isInteger(originalValue)) {
          intCount++;
        } else {
          floatCount++;
        }
      } else if (/^-?\d+$/.test(strValue)) {
        intCount++;
      } else if (/^-?\d*\.\d+$/.test(strValue)) {
        floatCount++;
      } else if (
        /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?/.test(strValue) ||
        /^\d{1,2}\/\d{1,2}\/\d{4}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/.test(strValue)
      ) {
        dateCount++;
      }
    }

    if (considered === 0) return 'unknown';

    if (floatCount / considered >= 0.8) return 'float64';
    if (intCount / considered >= 0.8) return 'int64';
    if (boolCount / considered > 0.8) return 'boolean';
    if (dateCount / considered > 0.8) return 'datetime';

    return 'string';
  }

  generateFingerprint(column: ColumnData): ColumnFingerprint {
    const stats = this.computeColumnStatistics(column);
    const inferredType = this.inferDataType(column.values);
    const patterns = this.detectRegexPatterns(column.name, stats.sample_values);

    return {
      min: stats.min_value,
      max: stats.max_value,
      dtype: column.data_type && column.data_type !== 'unknown' ? column.data_type : inferredType,
      cardinality: stats.unique_count,
      regex_patterns: patterns,
      null_ratio: stats.null_count / stats.total_rows,
      unique_ratio: stats.unique_count / stats.total_rows,
      sample_values: stats.sample_values
    };
  }

  fingerprintToString(fingerprint: ColumnFingerprint): string {
    const parts = [
      `min=${fingerprint.min || 'null'}`,
      `max=${fingerprint.max || 'null'}`,
      `dtype=${fingerprint.dtype}`,
      `card=${fingerprint.cardinality}`,
      `null_ratio=${fingerprint.null_ratio.toFixed(3)}`,
      `unique_ratio=${fingerprint.unique_ratio.toFixed(3)}`
    ];

    if (fingerprint.regex_patterns.length > 0) {
      parts.push(`patterns=${fingerprint.regex_patterns.join(',')}`);
    }

    // Use ';' as a safe delimiter to avoid conflicts with '|' inside regex patterns
    return parts.join(';');
  }

  createAnchor(
    dataset: string,
    column: ColumnData,
    mappedCid?: string,
    confidence?: number
  ): StableColumnAnchor {
    const fingerprint = this.generateFingerprint(column);
    const timestamp = new Date().toISOString().split('T')[0];

    return {
      dataset,
      column_name: column.name,
      anchor_id: this.generateAnchorId(),
      fingerprint: this.fingerprintToString(fingerprint),
      first_seen: timestamp,
      last_seen: timestamp,
      mapped_cid: mappedCid,
      confidence: confidence
    };
  }

  calculateMatchScore(
    columnFingerprint: ColumnFingerprint,
    anchor: StableColumnAnchor,
    columnName: string,
    driftTolerance: number = 0.2
  ): AnchorMatchScore {
    const anchorFingerprint = this.parseFingerprintString(anchor.fingerprint);

    const dtypeMatch = columnFingerprint.dtype === anchorFingerprint.dtype ? 1.0 : 0.0;

    const cardinalitySimilarity = this.calculateCardinalitySimilarity(
      columnFingerprint.cardinality,
      anchorFingerprint.cardinality
    );

    const regexMatch = this.calculateRegexSimilarity(
      columnFingerprint.regex_patterns,
      anchorFingerprint.regex_patterns
    );

    const statisticalSimilarity = this.calculateStatisticalSimilarity(
      columnFingerprint,
      anchorFingerprint,
      driftTolerance
    );

    const nameSimilarity = this.calculateNameSimilarity(columnName, anchor.column_name);

    const componentScores = {
      dtype_match: dtypeMatch,
      cardinality_similarity: cardinalitySimilarity,
      regex_match: regexMatch,
      statistical_similarity: statisticalSimilarity,
      name_similarity: nameSimilarity
    };

    const weights = {
      dtype_match: 0.3,
      cardinality_similarity: 0.25,
      regex_match: 0.2,
      statistical_similarity: 0.15,
      name_similarity: 0.1
    };

    // Penalize weak generic overlaps when names are dissimilar
    let adjustedCardinality = componentScores.cardinality_similarity;
    let adjustedStats = componentScores.statistical_similarity;
    if (componentScores.regex_match <= 0.25 && componentScores.name_similarity < 0.4) {
      adjustedCardinality *= 0.2;
      adjustedStats *= 0.5;
    }

    let totalScore =
      componentScores.dtype_match * weights.dtype_match +
      adjustedCardinality * weights.cardinality_similarity +
      componentScores.regex_match * weights.regex_match +
      adjustedStats * weights.statistical_similarity +
      componentScores.name_similarity * weights.name_similarity;

    // Require semantic overlap (patterns) or strong name similarity; otherwise disallow
    const hasAnyPatterns = (columnFingerprint.regex_patterns?.length || 0) > 0 && (anchorFingerprint.regex_patterns?.length || 0) > 0;
    if (hasAnyPatterns && componentScores.regex_match === 0 && componentScores.name_similarity < 0.6) {
      totalScore = 0;
    }

    // Strong guarded boosts for unambiguous matches
    if (
      componentScores.dtype_match === 1.0 &&
      componentScores.statistical_similarity >= 0.9 &&
      componentScores.regex_match >= 0.95 &&
      componentScores.name_similarity >= 0.95
    ) {
      totalScore = 1.0;
    }

    // Guardrail: if the only overlapping pattern is generic ID and names are dissimilar, cap the score
    const GENERIC_ID = '(^|_)(id|pk|key)$';
    const colSet = new Set(columnFingerprint.regex_patterns || []);
    const ancSet = new Set(anchorFingerprint.regex_patterns || []);
    let overlapGenericOnly = false;
    if (colSet.size > 0 && ancSet.size > 0) {
      let interCount = 0;
      for (const p of colSet) {
        if (ancSet.has(p)) interCount++;
      }
      overlapGenericOnly = interCount === 1 && (colSet.has(GENERIC_ID) && ancSet.has(GENERIC_ID)) && (colSet.size === 1 || ancSet.size === 1);
    }
    if (overlapGenericOnly && componentScores.name_similarity < 0.6) {
      totalScore = Math.min(totalScore, 0.6);
    }

    // If pattern overlap is only generic ID and there is no meaningful token overlap, strongly cap
    if (colSet.size > 0 && ancSet.size > 0 && overlapGenericOnly) {
      const tokens1 = this.tokenizeName(columnName);
      const tokens2 = this.tokenizeName(anchor.column_name);
      const genericTokens = new Set(['id', 'pk', 'key']);
      let meaningfulOverlap = false;
      const setTok2 = new Set(tokens2);
      for (const t of tokens1) {
        if (genericTokens.has(t)) continue;
        if (setTok2.has(t)) { meaningfulOverlap = true; break; }
      }
      if (!meaningfulOverlap) {
        totalScore = Math.min(totalScore, 0.49);
      }
    }

    const confidence = Math.min(totalScore, 1.0);

    return {
      anchor_id: anchor.anchor_id,
      total_score: totalScore,
      component_scores: componentScores,
      confidence
    };
  }

  private parseFingerprintString(fingerprintStr: string): ColumnFingerprint {
    // Support new ';' delimiter and fallback to legacy '|' if needed
    const parts = fingerprintStr.split(fingerprintStr.includes(';') ? ';' : '|');
    const fingerprint: Partial<ColumnFingerprint> = {
      regex_patterns: []
    };

    for (const part of parts) {
      const [key, value] = part.split('=', 2);

      switch (key) {
        case 'min':
          fingerprint.min = value === 'null' ? undefined : (isNaN(Number(value)) ? value : Number(value));
          break;
        case 'max':
          fingerprint.max = value === 'null' ? undefined : (isNaN(Number(value)) ? value : Number(value));
          break;
        case 'dtype':
          fingerprint.dtype = value;
          break;
        case 'card':
          fingerprint.cardinality = parseInt(value);
          break;
        case 'null_ratio':
          fingerprint.null_ratio = parseFloat(value);
          break;
        case 'unique_ratio':
          fingerprint.unique_ratio = parseFloat(value);
          break;
        case 'patterns':
          fingerprint.regex_patterns = value ? value.split(',') : [];
          break;
      }
    }

    return fingerprint as ColumnFingerprint;
  }

  private calculateCardinalitySimilarity(card1: number, card2: number): number {
    if (card1 === 0 && card2 === 0) return 1.0;
    if (card1 === 0 || card2 === 0) return 0.0;

    const ratio = Math.min(card1, card2) / Math.max(card1, card2);
    return ratio;
  }

  private calculateRegexSimilarity(patterns1: string[], patterns2: string[]): number {
    if (patterns1.length === 0 && patterns2.length === 0) return 1.0;
    if (patterns1.length === 0 || patterns2.length === 0) return 0.0;

    const set1 = new Set(patterns1);
    const set2 = new Set(patterns2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    if (intersection.size === 0) return 0.0;

    const GENERIC_ID = '(^|_)(id|pk|key)$';
    if (intersection.size === 1 && intersection.has(GENERIC_ID)) {
      return 0.0;
    }

    const jaccard = intersection.size / union.size;
    return jaccard;
  }

  private calculateStatisticalSimilarity(
    fp1: ColumnFingerprint,
    fp2: ColumnFingerprint,
    driftTolerance: number = 0
  ): number {
    let similarity = 0;
    let components = 0;

    if (fp1.null_ratio !== undefined && fp2.null_ratio !== undefined) {
      const diff = Math.abs(fp1.null_ratio - fp2.null_ratio);
      const nullRatioSim = diff <= driftTolerance
        ? 1
        : Math.max(0, 1 - (diff - driftTolerance) / (1 - driftTolerance));
      similarity += nullRatioSim;
      components++;
    }

    if (fp1.unique_ratio !== undefined && fp2.unique_ratio !== undefined) {
      const diff = Math.abs(fp1.unique_ratio - fp2.unique_ratio);
      const uniqueRatioSim = diff <= driftTolerance
        ? 1
        : Math.max(0, 1 - (diff - driftTolerance) / (1 - driftTolerance));
      similarity += uniqueRatioSim;
      components++;
    }

    return components > 0 ? similarity / components : 0;
  }

  private calculateNameSimilarity(name1: string, name2: string): number {
    const norm1 = name1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const norm2 = name2.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (norm1 === norm2) return 1.0;
    if (norm1.length === 0 || norm2.length === 0) return 0.0;

    // Token-based similarity only, filtering out generic tokens
    const genericTokens = new Set(['id', 'pk', 'key']);
    const tokens1 = this.tokenizeName(name1).filter(t => !genericTokens.has(t));
    const tokens2 = this.tokenizeName(name2).filter(t => !genericTokens.has(t));
    return this.jaccardSimilarityFromTokens(tokens1, tokens2);
  }

  reconcileAnchors(
    dataset: string,
    columns: ColumnData[],
    existingAnchors: StableColumnAnchor[],
    options: ReconciliationOptions = {
      confidence_threshold: 0.8,
      allow_multiple_matches: false,
      create_new_anchors: true,
      drift_tolerance: 0.2
    }
  ): AnchorReconciliationResult {
    const matchedAnchors: Array<{
      anchor_id: string;
      column_name: string;
      confidence: number;
      match_reason: string[];
    }> = [];
    const unmatched_columns: string[] = [];
    const newAnchors: StableColumnAnchor[] = [];

    // Precompute fingerprints for all columns (reduces repeated work)
    const columnFingerprints: Array<{ column: ColumnData; fp: ColumnFingerprint }> = columns.map(col => ({
      column: col,
      fp: this.generateFingerprint(col)
    }));

    // Build all candidate pairs above threshold
    type Candidate = { columnIndex: number; anchorIndex: number; score: AnchorMatchScore };
    const candidates: Candidate[] = [];

    for (let ci = 0; ci < columnFingerprints.length; ci++) {
      const { column, fp } = columnFingerprints[ci];
      for (let ai = 0; ai < existingAnchors.length; ai++) {
        const anchor = existingAnchors[ai];
        const score = this.calculateMatchScore(fp, anchor, column.name, options.drift_tolerance);

        // Hard semantic guard: if both sides have patterns but overlap is none or generic-only, skip
        const colPatterns = new Set(fp.regex_patterns || []);
        const ancPatterns = new Set(this.parseFingerprintString(anchor.fingerprint).regex_patterns || []);
        let overlapCount = 0;
        for (const p of colPatterns) if (ancPatterns.has(p)) overlapCount++;
        const GENERIC_ID = '(^|_)(id|pk|key)$';
        const overlapGenericOnly = overlapCount === 1 && colPatterns.has(GENERIC_ID) && ancPatterns.has(GENERIC_ID);
        const hasAnyPatterns = colPatterns.size > 0 && ancPatterns.size > 0;
        if (hasAnyPatterns && (overlapCount === 0 || overlapGenericOnly)) {
          continue;
        }

        const hasSemanticSignal = score.component_scores.regex_match > 0 || score.component_scores.name_similarity >= 0.8;
        if (score.confidence >= options.confidence_threshold && hasSemanticSignal) {
          candidates.push({ columnIndex: ci, anchorIndex: ai, score });
        }
      }
    }

    // Sort candidates by strong semantic signals first to reduce cross-assignments
    candidates.sort((a, b) => {
      const ar = a.score.component_scores.regex_match - b.score.component_scores.regex_match;
      if (ar !== 0) return ar > 0 ? -1 : 1;
      const ad = a.score.component_scores.dtype_match - b.score.component_scores.dtype_match;
      if (ad !== 0) return ad > 0 ? -1 : 1;
      const as = a.score.component_scores.statistical_similarity - b.score.component_scores.statistical_similarity;
      if (as !== 0) return as > 0 ? -1 : 1;
      const an = a.score.component_scores.name_similarity - b.score.component_scores.name_similarity;
      if (an !== 0) return an > 0 ? -1 : 1;
      const at = a.score.confidence - b.score.confidence;
      return at > 0 ? -1 : at < 0 ? 1 : 0;
    });

    const usedColumns = new Set<number>();
    const usedAnchors = new Set<number>();

    for (const cand of candidates) {
      if (usedColumns.has(cand.columnIndex)) continue;
      if (usedAnchors.has(cand.anchorIndex) && !options.allow_multiple_matches) continue;

      const { column } = columnFingerprints[cand.columnIndex];
      const anchor = existingAnchors[cand.anchorIndex];

      const matchReasons = this.getMatchReasons(cand.score);
      matchedAnchors.push({
        anchor_id: anchor.anchor_id,
        column_name: column.name,
        confidence: cand.score.confidence,
        match_reason: matchReasons
      });

      usedColumns.add(cand.columnIndex);
      usedAnchors.add(cand.anchorIndex);
    }

    // Process remaining columns
    for (let ci = 0; ci < columnFingerprints.length; ci++) {
      if (usedColumns.has(ci)) continue;
      const { column } = columnFingerprints[ci];
      if (options.create_new_anchors) {
        const newAnchor = this.createAnchor(dataset, column);
        newAnchors.push(newAnchor);
      } else {
        unmatched_columns.push(column.name);
      }
    }

    return {
      matched_anchors: matchedAnchors,
      unmatched_columns,
      new_anchors: newAnchors
    };
  }

  private getMatchReasons(matchScore: AnchorMatchScore): string[] {
    const reasons: string[] = [];

    if (matchScore.component_scores.dtype_match === 1.0) {
      reasons.push('data_type_match');
    }

    if (matchScore.component_scores.cardinality_similarity > 0.8) {
      reasons.push('cardinality_similar');
    }

    if (matchScore.component_scores.regex_match > 0.5) {
      reasons.push('pattern_match');
    }

    if (matchScore.component_scores.statistical_similarity > 0.8) {
      reasons.push('statistical_similarity');
    }

    if (matchScore.component_scores.name_similarity > 0.7) {
      reasons.push('name_similarity');
    }

    return reasons;
  }

  updateAnchorLastSeen(anchor: StableColumnAnchor): StableColumnAnchor {
    return {
      ...anchor,
      last_seen: new Date().toISOString().split('T')[0]
    };
  }
}
