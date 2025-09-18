export interface JaroWinklerOptions {
  threshold?: number;
  prefixScale?: number;
  maxPrefixLength?: number;
}

export interface JaroWinklerResult {
  similarity: number;
  distance: number;
  isMatch: boolean;
  jaroSimilarity: number;
  prefixLength: number;
}

export class JaroWinklerMatcher {
  private threshold: number;
  private prefixScale: number;
  private maxPrefixLength: number;

  constructor(options: JaroWinklerOptions = {}) {
    this.threshold = options.threshold ?? 0.7;
    this.prefixScale = options.prefixScale ?? 0.1;
    this.maxPrefixLength = options.maxPrefixLength ?? 4;
  }

  compare(s1: string, s2: string): JaroWinklerResult {
    if (s1 === s2) {
      return {
        similarity: 1.0,
        distance: 0.0,
        isMatch: true,
        jaroSimilarity: 1.0,
        prefixLength: Math.min(s1.length, this.maxPrefixLength)
      };
    }

    if (s1.length === 0 || s2.length === 0) {
      return {
        similarity: 0.0,
        distance: 1.0,
        isMatch: false,
        jaroSimilarity: 0.0,
        prefixLength: 0
      };
    }

    const jaroSimilarity = this.calculateJaro(s1, s2);
    const prefixLength = this.calculateCommonPrefix(s1, s2);

    const jaroWinklerSimilarity = jaroSimilarity + (prefixLength * this.prefixScale * (1 - jaroSimilarity));

    return {
      similarity: jaroWinklerSimilarity,
      distance: 1 - jaroWinklerSimilarity,
      isMatch: jaroWinklerSimilarity >= this.threshold,
      jaroSimilarity,
      prefixLength
    };
  }

  private calculateJaro(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;

    if (len1 === 0 && len2 === 0) return 1.0;
    if (len1 === 0 || len2 === 0) return 0.0;

    const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
    if (matchWindow < 0) return s1 === s2 ? 1.0 : 0.0;

    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);

    let matches = 0;

    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, len2);

      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;

        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0.0;

    let transpositions = 0;
    let k = 0;

    for (let i = 0; i < len1; i++) {
      if (!s1Matches[i]) continue;

      while (!s2Matches[k]) k++;

      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }

    return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0;
  }

  private calculateCommonPrefix(s1: string, s2: string): number {
    let prefixLength = 0;
    const maxLength = Math.min(Math.min(s1.length, s2.length), this.maxPrefixLength);

    for (let i = 0; i < maxLength; i++) {
      if (s1[i] === s2[i]) {
        prefixLength++;
      } else {
        break;
      }
    }

    return prefixLength;
  }

  findBestMatch(target: string, candidates: string[]): { value: string; result: JaroWinklerResult } | null {
    let bestMatch: { value: string; result: JaroWinklerResult } | null = null;
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

  findMatches(target: string, candidates: string[], minSimilarity?: number): Array<{ value: string; result: JaroWinklerResult }> {
    const threshold = minSimilarity ?? this.threshold;
    const matches: Array<{ value: string; result: JaroWinklerResult }> = [];

    for (const candidate of candidates) {
      const result = this.compare(target, candidate);
      if (result.similarity >= threshold) {
        matches.push({ value: candidate, result });
      }
    }

    return matches.sort((a, b) => b.result.similarity - a.result.similarity);
  }

  batchCompare(targets: string[], candidates: string[]): Map<string, Array<{ value: string; result: JaroWinklerResult }>> {
    const results = new Map<string, Array<{ value: string; result: JaroWinklerResult }>>();

    for (const target of targets) {
      results.set(target, this.findMatches(target, candidates));
    }

    return results;
  }
}

export function jaroWinklerSimilarity(s1: string, s2: string, options?: JaroWinklerOptions): number {
  const matcher = new JaroWinklerMatcher(options);
  return matcher.compare(s1, s2).similarity;
}

export function jaroWinklerDistance(s1: string, s2: string, options?: JaroWinklerOptions): number {
  const matcher = new JaroWinklerMatcher(options);
  return matcher.compare(s1, s2).distance;
}

export function jaroSimilarity(s1: string, s2: string): number {
  const matcher = new JaroWinklerMatcher({ prefixScale: 0 });
  return matcher.compare(s1, s2).jaroSimilarity;
}