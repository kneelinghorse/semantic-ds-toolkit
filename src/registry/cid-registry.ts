export interface CIDFacets {
  pii?: boolean;
  temporal?: boolean;
  numerical?: boolean;
  categorical?: boolean;
  identifier?: boolean;
  metadata?: Record<string, any>;
}

export interface CIDInferenceRule {
  condition: string;
  action: string;
  confidence: number;
}

export interface CIDConcept {
  cid: string;
  labels: string[];
  description?: string;
  facets: CIDFacets;
  inference?: {
    rules: CIDInferenceRule[];
  };
  examples?: string[];
  parent_cid?: string;
}

export interface CIDPack {
  pack: string;
  version: string;
  description?: string;
  depends_on?: string[];
  concepts: CIDConcept[];
}

export interface CIDLookupResult {
  concept: CIDConcept;
  pack: string;
  confidence: number;
  match_type: 'exact' | 'label' | 'inference' | 'semantic';
}

export class CIDRegistry {
  private concepts: Map<string, { concept: CIDConcept; pack: string }> = new Map();
  private labelIndex: Map<string, string[]> = new Map();
  private packs: Map<string, CIDPack> = new Map();
  private loadedPackNames: Set<string> = new Set();

  registerPack(pack: CIDPack): void {
    this.packs.set(pack.pack, pack);
    this.loadedPackNames.add(pack.pack);

    for (const concept of pack.concepts) {
      this.concepts.set(concept.cid, { concept, pack: pack.pack });

      // Index labels for fast lookup
      for (const label of concept.labels) {
        const normalizedLabel = this.normalizeLabel(label);
        if (!this.labelIndex.has(normalizedLabel)) {
          this.labelIndex.set(normalizedLabel, []);
        }
        this.labelIndex.get(normalizedLabel)!.push(concept.cid);
      }
    }
  }

  getConcept(cid: string): CIDConcept | null {
    const entry = this.concepts.get(cid);
    return entry ? entry.concept : null;
  }

  lookupByLabel(label: string): CIDLookupResult[] {
    const normalizedLabel = this.normalizeLabel(label);
    const results: CIDLookupResult[] = [];

    // Exact label match
    const exactMatches = this.labelIndex.get(normalizedLabel) || [];
    for (const cid of exactMatches) {
      const entry = this.concepts.get(cid);
      if (entry) {
        results.push({
          concept: entry.concept,
          pack: entry.pack,
          confidence: 1.0,
          match_type: 'exact'
        });
      }
    }

    // Fuzzy label matching
    if (results.length === 0) {
      const fuzzyMatches = this.fuzzyLabelSearch(normalizedLabel);
      results.push(...fuzzyMatches);
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  lookupByCriteria(criteria: {
    facets?: Partial<CIDFacets>;
    patterns?: string[];
    semantic_context?: string;
  }): CIDLookupResult[] {
    const results: CIDLookupResult[] = [];

    for (const [cid, entry] of this.concepts) {
      let confidence = 0;
      const matchReasons: string[] = [];

      // Facet matching
      if (criteria.facets) {
        const facetMatch = this.matchFacets(entry.concept.facets, criteria.facets);
        confidence += facetMatch.score;
        if (facetMatch.score > 0) {
          matchReasons.push('facets');
        }
      }

      // Pattern matching against labels
      if (criteria.patterns) {
        const patternMatch = this.matchPatterns(entry.concept.labels, criteria.patterns);
        confidence += patternMatch * 0.8;
        if (patternMatch > 0) {
          matchReasons.push('patterns');
        }
      }

      // Inference rules
      if (entry.concept.inference?.rules) {
        const inferenceMatch = this.evaluateInferenceRules(
          entry.concept.inference.rules,
          criteria
        );
        confidence += inferenceMatch * 0.9;
        if (inferenceMatch > 0) {
          matchReasons.push('inference');
        }
      }

      if (confidence > 0.3) {
        results.push({
          concept: entry.concept,
          pack: entry.pack,
          confidence: Math.min(confidence, 1.0),
          match_type: matchReasons.includes('inference') ? 'inference' : 'semantic'
        });
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  getLoadedPacks(): string[] {
    return Array.from(this.loadedPackNames);
  }

  getPack(packName: string): CIDPack | null {
    return this.packs.get(packName) || null;
  }

  getAllConcepts(): CIDConcept[] {
    return Array.from(this.concepts.values()).map(entry => entry.concept);
  }

  private normalizeLabel(label: string): string {
    return label.toLowerCase()
      .replace(/[_\-\s]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private fuzzyLabelSearch(normalizedLabel: string): CIDLookupResult[] {
    const results: CIDLookupResult[] = [];
    const searchTerms = normalizedLabel.split('_');

    for (const [label, cids] of this.labelIndex) {
      const labelTerms = label.split('_');
      const jaccardSim = this.calculateSimilarity(searchTerms, labelTerms);
      const stringSim = this.calculateStringSimilarity(normalizedLabel, label);
      const maxSimilarity = Math.max(jaccardSim, stringSim);

      if (maxSimilarity > 0.5) {
        for (const cid of cids) {
          const entry = this.concepts.get(cid);
          if (entry) {
            results.push({
              concept: entry.concept,
              pack: entry.pack,
              confidence: maxSimilarity,
              match_type: 'label'
            });
          }
        }
      }
    }

    return results;
  }

  private calculateSimilarity(terms1: string[], terms2: string[]): number {
    const set1 = new Set(terms1);
    const set2 = new Set(terms2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }

  private matchFacets(conceptFacets: CIDFacets, criteriaFacets: Partial<CIDFacets>): { score: number } {
    let matches = 0;
    let total = 0;

    for (const [key, value] of Object.entries(criteriaFacets)) {
      total++;
      if (conceptFacets[key as keyof CIDFacets] === value) {
        matches++;
      }
    }

    return { score: total > 0 ? matches / total : 0 };
  }

  private matchPatterns(labels: string[], patterns: string[]): number {
    let bestMatch = 0;

    for (const label of labels) {
      for (const pattern of patterns) {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(label)) {
            bestMatch = Math.max(bestMatch, 0.9);
          } else {
            const similarity = this.calculateStringSimilarity(label, pattern);
            bestMatch = Math.max(bestMatch, similarity);
          }
        } catch {
          const similarity = this.calculateStringSimilarity(label, pattern);
          bestMatch = Math.max(bestMatch, similarity);
        }
      }
    }

    return bestMatch;
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const maxLen = Math.max(len1, len2);

    if (maxLen === 0) return 1;

    const editDistance = this.levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    return (maxLen - editDistance) / maxLen;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() =>
      Array(str1.length + 1).fill(null)
    );

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + substitutionCost
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private evaluateInferenceRules(
    rules: CIDInferenceRule[],
    criteria: any
  ): number {
    let bestConfidence = 0;

    for (const rule of rules) {
      try {
        if (this.evaluateCondition(rule.condition, criteria)) {
          bestConfidence = Math.max(bestConfidence, rule.confidence);
        }
      } catch {
        continue;
      }
    }

    return bestConfidence;
  }

  private evaluateCondition(condition: string, context: any): boolean {
    try {
      const func = new Function('context', `
        with(context) {
          return ${condition};
        }
      `);
      return func(context);
    } catch {
      return false;
    }
  }
}