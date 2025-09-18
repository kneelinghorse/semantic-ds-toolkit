import { ColumnFingerprint } from '../types/anchor.types';
import { DriftType } from './drift-detector';

export interface PatternDriftAnalysis {
  similarity_score: number;
  new_patterns: PatternInfo[];
  lost_patterns: PatternInfo[];
  changed_patterns: PatternChange[];
  format_stability: 'stable' | 'minor_change' | 'major_change' | 'format_shift';
  sample_analysis: SampleDriftAnalysis;
}

export interface PatternInfo {
  pattern: string;
  frequency: number;
  confidence: number;
  examples: string[];
  semantic_type?: string;
}

export interface PatternChange {
  old_pattern: string;
  new_pattern: string;
  similarity: number;
  impact_severity: 'low' | 'medium' | 'high';
  transformation_type: 'format_evolution' | 'encoding_change' | 'scale_change' | 'semantic_drift';
}

export interface SampleDriftAnalysis {
  format_consistency: number;
  length_distribution_change: number;
  character_set_changes: string[];
  structural_changes: StructuralChange[];
}

export interface StructuralChange {
  type: 'delimiter_change' | 'casing_change' | 'encoding_change' | 'prefix_suffix_change';
  description: string;
  impact: number;
  examples: { before: string; after: string }[];
}

export class PatternDriftDetector {
  private readonly COMMON_PATTERNS = {
    email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    phone: /^[\+]?[1-9][\d\-\(\)\s\+\.]{7,15}$/,
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    date_iso: /^\d{4}-\d{2}-\d{2}$/,
    date_us: /^\d{1,2}\/\d{1,2}\/\d{4}$/,
    ssn: /^\d{3}-\d{2}-\d{4}$/,
    credit_card: /^\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}$/,
    ip_address: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
    url: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
    numeric: /^-?\d+(\.\d+)?$/,
    alphanumeric: /^[a-zA-Z0-9]+$/,
    alpha: /^[a-zA-Z]+$/
  };

  private readonly SEMANTIC_PATTERNS = {
    person_name: /^[A-Z][a-z]+ [A-Z][a-z]+$/,
    company_name: /^[A-Z][a-zA-Z0-9\s&\.,\-\']+$/,
    address: /^\d+\s+[A-Za-z0-9\s\.,\-\#]+$/,
    postal_code: /^[A-Z0-9\-\s]{3,10}$/,
    currency: /^\$?\d{1,3}(,\d{3})*(\.\d{2})?$/,
    percentage: /^\d{1,3}(\.\d+)?%$/
  };

  async detectPatternDrift(
    historicalFingerprint: ColumnFingerprint,
    currentFingerprint: ColumnFingerprint,
    similarityThreshold: number = 0.8
  ): Promise<DriftType | null> {
    const analysis = await this.analyzePatternDrift(historicalFingerprint, currentFingerprint);

    if (analysis.similarity_score < similarityThreshold) {
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

      switch (analysis.format_stability) {
        case 'format_shift':
          severity = 'critical';
          break;
        case 'major_change':
          severity = 'high';
          break;
        case 'minor_change':
          severity = 'medium';
          break;
        case 'stable':
          severity = 'low';
          break;
      }

      // Escalate severity based on semantic patterns
      const semanticPatternLoss = analysis.lost_patterns.filter(p => p.semantic_type).length;
      if (semanticPatternLoss > 0) {
        severity = severity === 'low' ? 'medium' : severity === 'medium' ? 'high' : severity;
      }

      return {
        type: 'format',
        severity: severity,
        metric_value: 1 - analysis.similarity_score,
        threshold: 1 - similarityThreshold,
        description: `Format drift detected: ${(100 * (1 - analysis.similarity_score)).toFixed(1)}% pattern change`
      };
    }

    return null;
  }

  async analyzePatternDrift(
    historicalFingerprint: ColumnFingerprint,
    currentFingerprint: ColumnFingerprint
  ): Promise<PatternDriftAnalysis> {
    // Extract patterns from fingerprints
    const historicalPatterns = this.extractPatterns(
      historicalFingerprint.regex_patterns,
      historicalFingerprint.sample_values
    );
    const currentPatterns = this.extractPatterns(
      currentFingerprint.regex_patterns,
      currentFingerprint.sample_values
    );

    // Calculate pattern similarity
    const similarityScore = this.calculatePatternSimilarity(historicalPatterns, currentPatterns);

    // Identify pattern changes
    const newPatterns = this.findNewPatterns(historicalPatterns, currentPatterns);
    const lostPatterns = this.findLostPatterns(historicalPatterns, currentPatterns);
    const changedPatterns = this.findChangedPatterns(historicalPatterns, currentPatterns);

    // Analyze sample-level changes
    const sampleAnalysis = this.analyzeSampleDrift(
      historicalFingerprint.sample_values,
      currentFingerprint.sample_values
    );

    // Determine format stability
    const formatStability = this.assessFormatStability(
      similarityScore,
      newPatterns.length,
      lostPatterns.length,
      sampleAnalysis
    );

    return {
      similarity_score: similarityScore,
      new_patterns: newPatterns,
      lost_patterns: lostPatterns,
      changed_patterns: changedPatterns,
      format_stability: formatStability,
      sample_analysis: sampleAnalysis
    };
  }

  private extractPatterns(regexPatterns: string[], sampleValues: string[]): PatternInfo[] {
    const patterns: PatternInfo[] = [];

    // Add explicit regex patterns
    for (const pattern of regexPatterns) {
      const patternInfo = this.analyzePattern(pattern, sampleValues);
      if (patternInfo) {
        patterns.push(patternInfo);
      }
    }

    // Detect common patterns from samples
    const detectedPatterns = this.detectPatternsFromSamples(sampleValues);
    patterns.push(...detectedPatterns);

    // Remove duplicates and sort by frequency
    const uniquePatterns = this.deduplicatePatterns(patterns);
    return uniquePatterns.sort((a, b) => b.frequency - a.frequency);
  }

  private analyzePattern(pattern: string, sampleValues: string[]): PatternInfo | null {
    try {
      const regex = new RegExp(pattern);
      const matches = sampleValues.filter(value => regex.test(value));
      const frequency = matches.length / sampleValues.length;

      if (frequency > 0) {
        return {
          pattern: pattern,
          frequency: frequency,
          confidence: this.calculatePatternConfidence(pattern, matches),
          examples: matches.slice(0, 5),
          semantic_type: this.identifySemanticType(pattern)
        };
      }
    } catch (error) {
      // Invalid regex pattern
    }

    return null;
  }

  private detectPatternsFromSamples(sampleValues: string[]): PatternInfo[] {
    const patterns: PatternInfo[] = [];

    // Test against common patterns
    for (const [type, regex] of Object.entries(this.COMMON_PATTERNS)) {
      const matches = sampleValues.filter(value => regex.test(value));
      const frequency = matches.length / sampleValues.length;

      if (frequency > 0.1) { // Only include patterns that match at least 10% of samples
        patterns.push({
          pattern: regex.source,
          frequency: frequency,
          confidence: frequency,
          examples: matches.slice(0, 5),
          semantic_type: type
        });
      }
    }

    // Test against semantic patterns
    for (const [type, regex] of Object.entries(this.SEMANTIC_PATTERNS)) {
      const matches = sampleValues.filter(value => regex.test(value));
      const frequency = matches.length / sampleValues.length;

      if (frequency > 0.05) { // Lower threshold for semantic patterns
        patterns.push({
          pattern: regex.source,
          frequency: frequency,
          confidence: frequency * 0.8, // Lower confidence for inferred patterns
          examples: matches.slice(0, 5),
          semantic_type: type
        });
      }
    }

    // Generate structural patterns
    const structuralPatterns = this.generateStructuralPatterns(sampleValues);
    patterns.push(...structuralPatterns);

    return patterns;
  }

  private generateStructuralPatterns(sampleValues: string[]): PatternInfo[] {
    const patterns: PatternInfo[] = [];

    // Length patterns
    const lengths = sampleValues.map(v => v.length);
    const uniqueLengths = [...new Set(lengths)];

    if (uniqueLengths.length <= 3) {
      for (const length of uniqueLengths) {
        const matchCount = lengths.filter(l => l === length).length;
        const frequency = matchCount / sampleValues.length;

        if (frequency > 0.2) {
          patterns.push({
            pattern: `^.{${length}}$`,
            frequency: frequency,
            confidence: frequency,
            examples: sampleValues.filter(v => v.length === length).slice(0, 3),
            semantic_type: 'fixed_length'
          });
        }
      }
    }

    // Character class patterns
    const characterClassPatterns = this.detectCharacterClassPatterns(sampleValues);
    patterns.push(...characterClassPatterns);

    return patterns;
  }

  private detectCharacterClassPatterns(sampleValues: string[]): PatternInfo[] {
    const patterns: PatternInfo[] = [];

    // Sample a few values to generate patterns
    const sampleSize = Math.min(sampleValues.length, 20);
    const samples = sampleValues.slice(0, sampleSize);

    for (const sample of samples) {
      const generatedPattern = this.generateCharacterClassPattern(sample);
      if (generatedPattern) {
        const regex = new RegExp(generatedPattern);
        const matches = sampleValues.filter(v => regex.test(v));
        const frequency = matches.length / sampleValues.length;

        if (frequency > 0.3) {
          patterns.push({
            pattern: generatedPattern,
            frequency: frequency,
            confidence: frequency * 0.6,
            examples: matches.slice(0, 3),
            semantic_type: 'inferred_structure'
          });
        }
      }
    }

    return this.deduplicatePatterns(patterns);
  }

  private generateCharacterClassPattern(sample: string): string | null {
    if (sample.length === 0) return null;

    let pattern = '^';
    let i = 0;

    while (i < sample.length) {
      const char = sample[i];
      let charClass = '';

      if (/\d/.test(char)) {
        charClass = '\\d';
      } else if (/[a-z]/.test(char)) {
        charClass = '[a-z]';
      } else if (/[A-Z]/.test(char)) {
        charClass = '[A-Z]';
      } else if (/\s/.test(char)) {
        charClass = '\\s';
      } else if (/[!@#$%^&*(),.?":{}|<>]/.test(char)) {
        charClass = `\\${char}`;
      } else {
        charClass = `.`;
      }

      // Count consecutive characters of the same class
      let count = 1;
      while (i + count < sample.length && this.matchesCharacterClass(sample[i + count], charClass)) {
        count++;
      }

      if (count === 1) {
        pattern += charClass;
      } else if (count <= 3) {
        pattern += `${charClass}{${count}}`;
      } else {
        pattern += `${charClass}+`;
      }

      i += count;
    }

    pattern += '$';
    return pattern;
  }

  private matchesCharacterClass(char: string, charClass: string): boolean {
    switch (charClass) {
      case '\\d': return /\d/.test(char);
      case '[a-z]': return /[a-z]/.test(char);
      case '[A-Z]': return /[A-Z]/.test(char);
      case '\\s': return /\s/.test(char);
      default: return false;
    }
  }

  private calculatePatternSimilarity(
    historicalPatterns: PatternInfo[],
    currentPatterns: PatternInfo[]
  ): number {
    if (historicalPatterns.length === 0 && currentPatterns.length === 0) {
      return 1.0;
    }

    if (historicalPatterns.length === 0 || currentPatterns.length === 0) {
      return 0.0;
    }

    // Create frequency maps
    const historicalMap = new Map(
      historicalPatterns.map(p => [p.pattern, p.frequency])
    );
    const currentMap = new Map(
      currentPatterns.map(p => [p.pattern, p.frequency])
    );

    // Calculate weighted similarity
    let totalSimilarity = 0;
    let totalWeight = 0;

    // Check overlap and frequency changes
    for (const [pattern, historicalFreq] of historicalMap) {
      const currentFreq = currentMap.get(pattern) || 0;
      const weight = Math.max(historicalFreq, currentFreq);
      const similarity = 1 - Math.abs(historicalFreq - currentFreq);

      totalSimilarity += similarity * weight;
      totalWeight += weight;
    }

    // Penalize for completely new patterns
    for (const [pattern, currentFreq] of currentMap) {
      if (!historicalMap.has(pattern)) {
        totalWeight += currentFreq;
        // New patterns get 0 similarity
      }
    }

    return totalWeight > 0 ? totalSimilarity / totalWeight : 0;
  }

  private findNewPatterns(
    historicalPatterns: PatternInfo[],
    currentPatterns: PatternInfo[]
  ): PatternInfo[] {
    const historicalPatternSet = new Set(historicalPatterns.map(p => p.pattern));
    return currentPatterns.filter(p => !historicalPatternSet.has(p.pattern));
  }

  private findLostPatterns(
    historicalPatterns: PatternInfo[],
    currentPatterns: PatternInfo[]
  ): PatternInfo[] {
    const currentPatternSet = new Set(currentPatterns.map(p => p.pattern));
    return historicalPatterns.filter(p => !currentPatternSet.has(p.pattern));
  }

  private findChangedPatterns(
    historicalPatterns: PatternInfo[],
    currentPatterns: PatternInfo[]
  ): PatternChange[] {
    const changes: PatternChange[] = [];
    const currentMap = new Map(currentPatterns.map(p => [p.pattern, p]));

    for (const historical of historicalPatterns) {
      const current = currentMap.get(historical.pattern);
      if (current) {
        const frequencyChange = Math.abs(historical.frequency - current.frequency);
        const confidenceChange = Math.abs(historical.confidence - current.confidence);

        if (frequencyChange > 0.1 || confidenceChange > 0.1) {
          changes.push({
            old_pattern: historical.pattern,
            new_pattern: current.pattern,
            similarity: 1 - Math.max(frequencyChange, confidenceChange),
            impact_severity: this.assessChangeImpact(frequencyChange, confidenceChange),
            transformation_type: this.identifyTransformationType(historical, current)
          });
        }
      }
    }

    return changes;
  }

  private analyzeSampleDrift(
    historicalSamples: string[],
    currentSamples: string[]
  ): SampleDriftAnalysis {
    // Format consistency analysis
    const formatConsistency = this.calculateFormatConsistency(currentSamples);

    // Length distribution analysis
    const lengthDistributionChange = this.calculateLengthDistributionChange(
      historicalSamples,
      currentSamples
    );

    // Character set analysis
    const characterSetChanges = this.detectCharacterSetChanges(
      historicalSamples,
      currentSamples
    );

    // Structural changes
    const structuralChanges = this.detectStructuralChanges(
      historicalSamples,
      currentSamples
    );

    return {
      format_consistency: formatConsistency,
      length_distribution_change: lengthDistributionChange,
      character_set_changes: characterSetChanges,
      structural_changes: structuralChanges
    };
  }

  private calculateFormatConsistency(samples: string[]): number {
    if (samples.length === 0) return 1.0;

    const patterns = samples.map(s => this.generateCharacterClassPattern(s));
    const uniquePatterns = new Set(patterns.filter(p => p !== null));

    return 1 - (uniquePatterns.size / samples.length);
  }

  private calculateLengthDistributionChange(
    historicalSamples: string[],
    currentSamples: string[]
  ): number {
    const historicalLengths = historicalSamples.map(s => s.length);
    const currentLengths = currentSamples.map(s => s.length);

    const historicalAvg = historicalLengths.reduce((a, b) => a + b, 0) / historicalLengths.length;
    const currentAvg = currentLengths.reduce((a, b) => a + b, 0) / currentLengths.length;

    return Math.abs(historicalAvg - currentAvg) / Math.max(historicalAvg, currentAvg, 1);
  }

  private detectCharacterSetChanges(
    historicalSamples: string[],
    currentSamples: string[]
  ): string[] {
    const historicalChars = new Set(historicalSamples.join('').split(''));
    const currentChars = new Set(currentSamples.join('').split(''));

    const changes: string[] = [];

    // Check for new character types
    const newChars = [...currentChars].filter(c => !historicalChars.has(c));
    if (newChars.length > 0) {
      changes.push(`Added characters: ${newChars.slice(0, 10).join(', ')}`);
    }

    // Check for lost character types
    const lostChars = [...historicalChars].filter(c => !currentChars.has(c));
    if (lostChars.length > 0) {
      changes.push(`Removed characters: ${lostChars.slice(0, 10).join(', ')}`);
    }

    return changes;
  }

  private detectStructuralChanges(
    historicalSamples: string[],
    currentSamples: string[]
  ): StructuralChange[] {
    const changes: StructuralChange[] = [];

    // Detect delimiter changes
    const delimiterChange = this.detectDelimiterChanges(historicalSamples, currentSamples);
    if (delimiterChange) changes.push(delimiterChange);

    // Detect casing changes
    const casingChange = this.detectCasingChanges(historicalSamples, currentSamples);
    if (casingChange) changes.push(casingChange);

    // Detect prefix/suffix changes
    const affixChanges = this.detectAffixChanges(historicalSamples, currentSamples);
    changes.push(...affixChanges);

    return changes;
  }

  private detectDelimiterChanges(
    historicalSamples: string[],
    currentSamples: string[]
  ): StructuralChange | null {
    const delimiters = ['-', '_', '.', '/', ':', ' ', ',', ';'];
    const historicalDelims = this.countDelimiters(historicalSamples, delimiters);
    const currentDelims = this.countDelimiters(currentSamples, delimiters);

    const changes: { before: string; after: string }[] = [];

    for (const delim of delimiters) {
      const histFreq = historicalDelims[delim] || 0;
      const currFreq = currentDelims[delim] || 0;
      const change = Math.abs(histFreq - currFreq);

      if (change > 0.2) {
        changes.push({
          before: `${delim}: ${(histFreq * 100).toFixed(1)}%`,
          after: `${delim}: ${(currFreq * 100).toFixed(1)}%`
        });
      }
    }

    if (changes.length > 0) {
      return {
        type: 'delimiter_change',
        description: `Delimiter usage patterns changed`,
        impact: Math.max(...changes.map(c =>
          Math.abs(parseFloat(c.before.split(': ')[1]) - parseFloat(c.after.split(': ')[1]))
        )) / 100,
        examples: changes
      };
    }

    return null;
  }

  private detectCasingChanges(
    historicalSamples: string[],
    currentSamples: string[]
  ): StructuralChange | null {
    const historicalCasing = this.analyzeCasing(historicalSamples);
    const currentCasing = this.analyzeCasing(currentSamples);

    const changes: { before: string; after: string }[] = [];

    for (const [type, histFreq] of Object.entries(historicalCasing)) {
      const currFreq = currentCasing[type] || 0;
      const change = Math.abs(histFreq - currFreq);

      if (change > 0.1) {
        changes.push({
          before: `${type}: ${(histFreq * 100).toFixed(1)}%`,
          after: `${type}: ${(currFreq * 100).toFixed(1)}%`
        });
      }
    }

    if (changes.length > 0) {
      return {
        type: 'casing_change',
        description: `Text casing patterns changed`,
        impact: Math.max(...changes.map(c =>
          Math.abs(parseFloat(c.before.split(': ')[1]) - parseFloat(c.after.split(': ')[1]))
        )) / 100,
        examples: changes
      };
    }

    return null;
  }

  private detectAffixChanges(
    historicalSamples: string[],
    currentSamples: string[]
  ): StructuralChange[] {
    const changes: StructuralChange[] = [];

    // Detect common prefixes/suffixes
    const historicalPrefixes = this.extractCommonAffixes(historicalSamples, 'prefix');
    const currentPrefixes = this.extractCommonAffixes(currentSamples, 'prefix');
    const historicalSuffixes = this.extractCommonAffixes(historicalSamples, 'suffix');
    const currentSuffixes = this.extractCommonAffixes(currentSamples, 'suffix');

    // Compare prefixes
    const prefixChange = this.compareAffixes(historicalPrefixes, currentPrefixes, 'prefix');
    if (prefixChange) changes.push(prefixChange);

    // Compare suffixes
    const suffixChange = this.compareAffixes(historicalSuffixes, currentSuffixes, 'suffix');
    if (suffixChange) changes.push(suffixChange);

    return changes;
  }

  // Helper methods
  private deduplicatePatterns(patterns: PatternInfo[]): PatternInfo[] {
    const patternMap = new Map<string, PatternInfo>();

    for (const pattern of patterns) {
      const existing = patternMap.get(pattern.pattern);
      if (!existing || pattern.frequency > existing.frequency) {
        patternMap.set(pattern.pattern, pattern);
      }
    }

    return Array.from(patternMap.values());
  }

  private calculatePatternConfidence(pattern: string, matches: string[]): number {
    // Simple confidence based on match consistency and pattern complexity
    const baseConfidence = matches.length > 0 ? 0.5 : 0;
    const complexityBonus = Math.min(pattern.length / 100, 0.3);
    const consistencyBonus = matches.length > 10 ? 0.2 : 0;

    return Math.min(1.0, baseConfidence + complexityBonus + consistencyBonus);
  }

  private identifySemanticType(pattern: string): string | undefined {
    for (const [type, regex] of Object.entries({...this.COMMON_PATTERNS, ...this.SEMANTIC_PATTERNS})) {
      if (pattern === regex.source) {
        return type;
      }
    }
    return undefined;
  }

  private assessFormatStability(
    similarityScore: number,
    newPatternsCount: number,
    lostPatternsCount: number,
    sampleAnalysis: SampleDriftAnalysis
  ): 'stable' | 'minor_change' | 'major_change' | 'format_shift' {
    const changeScore = (newPatternsCount + lostPatternsCount) / 10;
    const formatScore = 1 - sampleAnalysis.format_consistency;

    if (similarityScore < 0.5 || changeScore > 0.5 || formatScore > 0.5) {
      return 'format_shift';
    } else if (similarityScore < 0.7 || changeScore > 0.3 || formatScore > 0.3) {
      return 'major_change';
    } else if (similarityScore < 0.9 || changeScore > 0.1 || formatScore > 0.1) {
      return 'minor_change';
    } else {
      return 'stable';
    }
  }

  private assessChangeImpact(frequencyChange: number, confidenceChange: number): 'low' | 'medium' | 'high' {
    const maxChange = Math.max(frequencyChange, confidenceChange);
    if (maxChange > 0.3) return 'high';
    if (maxChange > 0.15) return 'medium';
    return 'low';
  }

  private identifyTransformationType(
    historical: PatternInfo,
    current: PatternInfo
  ): 'format_evolution' | 'encoding_change' | 'scale_change' | 'semantic_drift' {
    const frequencyRatio = current.frequency / historical.frequency;

    if (frequencyRatio > 2 || frequencyRatio < 0.5) {
      return 'scale_change';
    }

    if (historical.semantic_type && current.semantic_type &&
        historical.semantic_type !== current.semantic_type) {
      return 'semantic_drift';
    }

    if (Math.abs(historical.confidence - current.confidence) > 0.2) {
      return 'encoding_change';
    }

    return 'format_evolution';
  }

  private countDelimiters(samples: string[], delimiters: string[]): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const delim of delimiters) {
      let totalCount = 0;
      for (const sample of samples) {
        totalCount += (sample.match(new RegExp(delim === '.' ? '\\.' : delim, 'g')) || []).length;
      }
      counts[delim] = totalCount / (samples.length * samples.join('').length);
    }

    return counts;
  }

  private analyzeCasing(samples: string[]): Record<string, number> {
    let uppercase = 0;
    let lowercase = 0;
    let mixed = 0;
    let titlecase = 0;

    for (const sample of samples) {
      if (sample === sample.toUpperCase()) {
        uppercase++;
      } else if (sample === sample.toLowerCase()) {
        lowercase++;
      } else if (sample === sample.charAt(0).toUpperCase() + sample.slice(1).toLowerCase()) {
        titlecase++;
      } else {
        mixed++;
      }
    }

    const total = samples.length;
    return {
      uppercase: uppercase / total,
      lowercase: lowercase / total,
      titlecase: titlecase / total,
      mixed: mixed / total
    };
  }

  private extractCommonAffixes(samples: string[], type: 'prefix' | 'suffix'): Map<string, number> {
    const affixes = new Map<string, number>();
    const maxLength = 5;

    for (const sample of samples) {
      for (let len = 1; len <= Math.min(maxLength, sample.length - 1); len++) {
        const affix = type === 'prefix'
          ? sample.substring(0, len)
          : sample.substring(sample.length - len);

        affixes.set(affix, (affixes.get(affix) || 0) + 1);
      }
    }

    // Filter to only common affixes (appearing in at least 20% of samples)
    const threshold = samples.length * 0.2;
    for (const [affix, count] of affixes) {
      if (count < threshold) {
        affixes.delete(affix);
      }
    }

    return affixes;
  }

  private compareAffixes(
    historical: Map<string, number>,
    current: Map<string, number>,
    type: 'prefix' | 'suffix'
  ): StructuralChange | null {
    const changes: { before: string; after: string }[] = [];

    for (const [affix, histCount] of historical) {
      const currCount = current.get(affix) || 0;
      const change = Math.abs(histCount - currCount);

      if (change > historical.size * 0.1) {
        changes.push({
          before: `${affix}: ${histCount}`,
          after: `${affix}: ${currCount}`
        });
      }
    }

    if (changes.length > 0) {
      return {
        type: 'prefix_suffix_change',
        description: `${type} patterns changed`,
        impact: changes.length / Math.max(historical.size, current.size),
        examples: changes.slice(0, 5)
      };
    }

    return null;
  }
}