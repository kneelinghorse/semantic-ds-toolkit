export * from './jaro-winkler';
export * from './levenshtein';
export * from './phonetic';
export * from './simd-optimized';

import { JaroWinklerMatcher, JaroWinklerOptions } from './jaro-winkler';
import { LevenshteinMatcher, LevenshteinOptions } from './levenshtein';
import { PhoneticMatcher, PhoneticOptions } from './phonetic';

export interface FuzzyMatcherOptions {
  jaroWinkler?: JaroWinklerOptions;
  levenshtein?: LevenshteinOptions;
  phonetic?: PhoneticOptions;
  weights?: {
    jaroWinkler?: number;
    levenshtein?: number;
    phonetic?: number;
  };
  threshold?: number;
}

export interface FuzzyMatchResult {
  similarity: number;
  distance: number;
  isMatch: boolean;
  confidence: number;
  details: {
    jaroWinkler: number;
    levenshtein: number;
    phonetic: number;
  };
  algorithm: 'hybrid' | 'jaro-winkler' | 'levenshtein' | 'phonetic';
}

export class FuzzyMatcher {
  private jaroWinklerMatcher: JaroWinklerMatcher;
  private levenshteinMatcher: LevenshteinMatcher;
  private phoneticMatcher: PhoneticMatcher;
  private weights: Required<NonNullable<FuzzyMatcherOptions['weights']>>;
  private threshold: number;

  constructor(options: FuzzyMatcherOptions = {}) {
    this.jaroWinklerMatcher = new JaroWinklerMatcher(options.jaroWinkler);
    this.levenshteinMatcher = new LevenshteinMatcher(options.levenshtein);
    this.phoneticMatcher = new PhoneticMatcher(options.phonetic);

    this.weights = {
      jaroWinkler: 0.4,
      levenshtein: 0.4,
      phonetic: 0.2,
      ...options.weights
    };

    this.threshold = options.threshold ?? 0.75;

    const totalWeight = this.weights.jaroWinkler + this.weights.levenshtein + this.weights.phonetic;
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      this.weights.jaroWinkler /= totalWeight;
      this.weights.levenshtein /= totalWeight;
      this.weights.phonetic /= totalWeight;
    }
  }

  compare(s1: string, s2: string): FuzzyMatchResult {
    if (s1 === s2) {
      return {
        similarity: 1.0,
        distance: 0.0,
        isMatch: true,
        confidence: 1.0,
        details: {
          jaroWinkler: 1.0,
          levenshtein: 1.0,
          phonetic: 1.0
        },
        algorithm: 'hybrid'
      };
    }

    const jaroWinklerResult = this.jaroWinklerMatcher.compare(s1, s2);
    const levenshteinResult = this.levenshteinMatcher.compare(s1, s2);
    const phoneticResult = this.phoneticMatcher.compare(s1, s2);

    const weightedSimilarity =
      (jaroWinklerResult.similarity * this.weights.jaroWinkler) +
      (levenshteinResult.similarity * this.weights.levenshtein) +
      (phoneticResult.similarity * this.weights.phonetic);

    const confidence = this.calculateConfidence(
      jaroWinklerResult.similarity,
      levenshteinResult.similarity,
      phoneticResult.similarity
    );

    return {
      similarity: weightedSimilarity,
      distance: 1 - weightedSimilarity,
      isMatch: weightedSimilarity >= this.threshold,
      confidence,
      details: {
        jaroWinkler: jaroWinklerResult.similarity,
        levenshtein: levenshteinResult.similarity,
        phonetic: phoneticResult.similarity
      },
      algorithm: 'hybrid'
    };
  }

  private calculateConfidence(jaroWinkler: number, levenshtein: number, phonetic: number): number {
    const scores = [jaroWinkler, levenshtein, phonetic];
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const standardDeviation = Math.sqrt(variance);

    const consistency = 1 - Math.min(standardDeviation, 1);

    const averageSimilarity = mean;

    return (averageSimilarity * 0.7) + (consistency * 0.3);
  }

  findBestMatch(target: string, candidates: string[]): { value: string; result: FuzzyMatchResult } | null {
    let bestMatch: { value: string; result: FuzzyMatchResult } | null = null;
    let bestSimilarity = 0;

    for (const candidate of candidates) {
      const result = this.compare(target, candidate);
      if (result.similarity > bestSimilarity) {
        bestSimilarity = result.similarity;
        bestMatch = { value: candidate, result };
      }
    }

    return bestMatch && bestMatch.result.isMatch ? bestMatch : null;
  }

  findMatches(target: string, candidates: string[], minSimilarity?: number): Array<{ value: string; result: FuzzyMatchResult }> {
    const threshold = minSimilarity ?? this.threshold;
    const matches: Array<{ value: string; result: FuzzyMatchResult }> = [];

    for (const candidate of candidates) {
      const result = this.compare(target, candidate);
      if (result.similarity >= threshold) {
        matches.push({ value: candidate, result });
      }
    }

    return matches.sort((a, b) => b.result.similarity - a.result.similarity);
  }

  findTopMatches(target: string, candidates: string[], limit: number = 5): Array<{ value: string; result: FuzzyMatchResult }> {
    const allMatches = candidates.map(candidate => ({
      value: candidate,
      result: this.compare(target, candidate)
    }));

    return allMatches
      .sort((a, b) => b.result.similarity - a.result.similarity)
      .slice(0, limit);
  }

  batchCompare(targets: string[], candidates: string[]): Map<string, Array<{ value: string; result: FuzzyMatchResult }>> {
    const results = new Map<string, Array<{ value: string; result: FuzzyMatchResult }>>();

    for (const target of targets) {
      results.set(target, this.findMatches(target, candidates));
    }

    return results;
  }

  optimizedCompare(s1: string, s2: string, fastMode: boolean = false): FuzzyMatchResult {
    if (s1 === s2) {
      return {
        similarity: 1.0,
        distance: 0.0,
        isMatch: true,
        confidence: 1.0,
        details: {
          jaroWinkler: 1.0,
          levenshtein: 1.0,
          phonetic: 1.0
        },
        algorithm: 'hybrid'
      };
    }

    if (fastMode) {
      const lengthDiff = Math.abs(s1.length - s2.length);
      const maxLength = Math.max(s1.length, s2.length);

      if (lengthDiff / maxLength > 0.5) {
        return {
          similarity: 0.0,
          distance: 1.0,
          isMatch: false,
          confidence: 0.0,
          details: {
            jaroWinkler: 0.0,
            levenshtein: 0.0,
            phonetic: 0.0
          },
          algorithm: 'hybrid'
        };
      }
    }

    return this.compare(s1, s2);
  }

  setThreshold(threshold: number): void {
    this.threshold = Math.max(0, Math.min(1, threshold));
  }

  setWeights(weights: Partial<FuzzyMatcherOptions['weights']>): void {
    Object.assign(this.weights, weights);

    const totalWeight = this.weights.jaroWinkler + this.weights.levenshtein + this.weights.phonetic;
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      this.weights.jaroWinkler /= totalWeight;
      this.weights.levenshtein /= totalWeight;
      this.weights.phonetic /= totalWeight;
    }
  }
}

export function fuzzyMatch(s1: string, s2: string, options?: FuzzyMatcherOptions): number {
  const matcher = new FuzzyMatcher(options);
  return matcher.compare(s1, s2).similarity;
}

export function fuzzyDistance(s1: string, s2: string, options?: FuzzyMatcherOptions): number {
  const matcher = new FuzzyMatcher(options);
  return matcher.compare(s1, s2).distance;
}