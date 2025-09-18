export interface LevenshteinOptions {
  threshold?: number;
  caseSensitive?: boolean;
  insertionCost?: number;
  deletionCost?: number;
  substitutionCost?: number;
}

export interface LevenshteinResult {
  distance: number;
  similarity: number;
  isMatch: boolean;
  operations: Array<{
    type: 'insert' | 'delete' | 'substitute' | 'match';
    position: number;
    char?: string;
    oldChar?: string;
  }>;
}

export class LevenshteinMatcher {
  private threshold: number;
  private caseSensitive: boolean;
  private insertionCost: number;
  private deletionCost: number;
  private substitutionCost: number;

  constructor(options: LevenshteinOptions = {}) {
    this.threshold = options.threshold ?? 0.7;
    this.caseSensitive = options.caseSensitive ?? true;
    this.insertionCost = options.insertionCost ?? 1;
    this.deletionCost = options.deletionCost ?? 1;
    this.substitutionCost = options.substitutionCost ?? 1;
  }

  compare(s1: string, s2: string): LevenshteinResult {
    const str1 = this.caseSensitive ? s1 : s1.toLowerCase();
    const str2 = this.caseSensitive ? s2 : s2.toLowerCase();

    if (str1 === str2) {
      return {
        distance: 0,
        similarity: 1.0,
        isMatch: true,
        operations: Array.from({ length: str1.length }, (_, i) => ({
          type: 'match' as const,
          position: i,
          char: str1[i]
        }))
      };
    }

    const result = this.calculateDistanceWithOperations(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    const similarity = maxLength === 0 ? 1.0 : 1 - (result.distance / maxLength);

    return {
      distance: result.distance,
      similarity,
      isMatch: similarity >= this.threshold,
      operations: result.operations
    };
  }

  private calculateDistanceWithOperations(s1: string, s2: string): { distance: number; operations: LevenshteinResult['operations'] } {
    const m = s1.length;
    const n = s2.length;

    if (m === 0) {
      return {
        distance: n * this.insertionCost,
        operations: Array.from({ length: n }, (_, i) => ({
          type: 'insert',
          position: i,
          char: s2[i]
        }))
      };
    }

    if (n === 0) {
      return {
        distance: m * this.deletionCost,
        operations: Array.from({ length: m }, (_, i) => ({
          type: 'delete',
          position: i,
          char: s1[i]
        }))
      };
    }

    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    const operations = Array(m + 1).fill(null).map(() => Array(n + 1).fill(null));

    for (let i = 0; i <= m; i++) {
      dp[i][0] = i * this.deletionCost;
      operations[i][0] = 'delete';
    }

    for (let j = 0; j <= n; j++) {
      dp[0][j] = j * this.insertionCost;
      operations[0][j] = 'insert';
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : this.substitutionCost;

        const substitute = dp[i - 1][j - 1] + cost;
        const insert = dp[i][j - 1] + this.insertionCost;
        const delete_ = dp[i - 1][j] + this.deletionCost;

        const minCost = Math.min(substitute, insert, delete_);
        dp[i][j] = minCost;

        if (minCost === substitute) {
          operations[i][j] = cost === 0 ? 'match' : 'substitute';
        } else if (minCost === insert) {
          operations[i][j] = 'insert';
        } else {
          operations[i][j] = 'delete';
        }
      }
    }

    const reconstructedOperations = this.reconstructOperations(s1, s2, operations, m, n);

    return {
      distance: dp[m][n],
      operations: reconstructedOperations
    };
  }

  private reconstructOperations(
    s1: string,
    s2: string,
    operations: string[][],
    i: number,
    j: number
  ): LevenshteinResult['operations'] {
    const result: LevenshteinResult['operations'] = [];

    while (i > 0 || j > 0) {
      const op = operations[i][j];

      switch (op) {
        case 'match':
          result.unshift({
            type: 'match',
            position: i - 1,
            char: s1[i - 1]
          });
          i--;
          j--;
          break;

        case 'substitute':
          result.unshift({
            type: 'substitute',
            position: i - 1,
            char: s2[j - 1],
            oldChar: s1[i - 1]
          });
          i--;
          j--;
          break;

        case 'insert':
          result.unshift({
            type: 'insert',
            position: i,
            char: s2[j - 1]
          });
          j--;
          break;

        case 'delete':
          result.unshift({
            type: 'delete',
            position: i - 1,
            char: s1[i - 1]
          });
          i--;
          break;
      }
    }

    return result;
  }

  calculateDistance(s1: string, s2: string): number {
    const str1 = this.caseSensitive ? s1 : s1.toLowerCase();
    const str2 = this.caseSensitive ? s2 : s2.toLowerCase();

    if (str1 === str2) return 0;

    const m = str1.length;
    const n = str2.length;

    if (m === 0) return n * this.insertionCost;
    if (n === 0) return m * this.deletionCost;

    let prevRow = new Array(n + 1);
    let currRow = new Array(n + 1);

    for (let j = 0; j <= n; j++) {
      prevRow[j] = j * this.insertionCost;
    }

    for (let i = 1; i <= m; i++) {
      currRow[0] = i * this.deletionCost;

      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : this.substitutionCost;

        currRow[j] = Math.min(
          prevRow[j - 1] + cost,
          currRow[j - 1] + this.insertionCost,
          prevRow[j] + this.deletionCost
        );
      }

      [prevRow, currRow] = [currRow, prevRow];
    }

    return prevRow[n];
  }

  calculateSimilarity(s1: string, s2: string): number {
    const distance = this.calculateDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    return maxLength === 0 ? 1.0 : 1 - (distance / maxLength);
  }

  findBestMatch(target: string, candidates: string[]): { value: string; result: LevenshteinResult } | null {
    let bestMatch: { value: string; result: LevenshteinResult } | null = null;
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

  findMatches(target: string, candidates: string[], minSimilarity?: number): Array<{ value: string; result: LevenshteinResult }> {
    const threshold = minSimilarity ?? this.threshold;
    const matches: Array<{ value: string; result: LevenshteinResult }> = [];

    for (const candidate of candidates) {
      const result = this.compare(target, candidate);
      if (result.similarity >= threshold) {
        matches.push({ value: candidate, result });
      }
    }

    return matches.sort((a, b) => b.result.similarity - a.result.similarity);
  }

  batchCompare(targets: string[], candidates: string[]): Map<string, Array<{ value: string; result: LevenshteinResult }>> {
    const results = new Map<string, Array<{ value: string; result: LevenshteinResult }>>();

    for (const target of targets) {
      results.set(target, this.findMatches(target, candidates));
    }

    return results;
  }

  optimizedDistance(s1: string, s2: string, maxDistance?: number): number {
    const str1 = this.caseSensitive ? s1 : s1.toLowerCase();
    const str2 = this.caseSensitive ? s2 : s2.toLowerCase();

    if (str1 === str2) return 0;

    const m = str1.length;
    const n = str2.length;

    if (Math.abs(m - n) > (maxDistance ?? Infinity)) {
      return maxDistance ?? Math.abs(m - n);
    }

    if (m === 0) return Math.min(n, maxDistance ?? Infinity);
    if (n === 0) return Math.min(m, maxDistance ?? Infinity);

    const MAX_DIST = maxDistance ?? Math.max(m, n);

    let prevRow = new Array(n + 1);
    let currRow = new Array(n + 1);

    for (let j = 0; j <= n; j++) {
      prevRow[j] = j;
    }

    for (let i = 1; i <= m; i++) {
      currRow[0] = i;

      let minInRow = i;

      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;

        currRow[j] = Math.min(
          prevRow[j - 1] + cost,
          currRow[j - 1] + 1,
          prevRow[j] + 1
        );

        minInRow = Math.min(minInRow, currRow[j]);
      }

      if (minInRow > MAX_DIST) {
        return MAX_DIST + 1;
      }

      [prevRow, currRow] = [currRow, prevRow];
    }

    return Math.min(prevRow[n], MAX_DIST);
  }
}

export function levenshteinDistance(s1: string, s2: string, options?: LevenshteinOptions): number {
  const matcher = new LevenshteinMatcher(options);
  return matcher.calculateDistance(s1, s2);
}

export function levenshteinSimilarity(s1: string, s2: string, options?: LevenshteinOptions): number {
  const matcher = new LevenshteinMatcher(options);
  return matcher.calculateSimilarity(s1, s2);
}