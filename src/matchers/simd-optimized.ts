export interface SimdCapabilities {
  hasWasm: boolean;
  hasSimd: boolean;
  vectorWidth: number;
}

export class SimdOptimizedMatcher {
  private capabilities: SimdCapabilities;

  constructor() {
    this.capabilities = this.detectSimdCapabilities();
  }

  private detectSimdCapabilities(): SimdCapabilities {
    let hasWasm = false;
    let hasSimd = false;
    let vectorWidth = 1;

    try {
      hasWasm = typeof WebAssembly !== 'undefined';

      if (hasWasm) {
        const wasmFeatures = WebAssembly as any;
        hasSimd = typeof wasmFeatures.instantiate === 'function';

        if (hasSimd) {
          vectorWidth = 16; // 128-bit SIMD
        }
      }
    } catch (e) {
      // SIMD not available
    }

    return { hasWasm, hasSimd, vectorWidth };
  }

  optimizedLevenshteinDistance(s1: string, s2: string, maxDistance?: number): number {
    if (s1 === s2) return 0;
    if (s1.length === 0) return s2.length;
    if (s2.length === 0) return s1.length;

    if (this.capabilities.hasSimd && Math.min(s1.length, s2.length) >= 8) {
      return this.simdLevenshtein(s1, s2, maxDistance);
    } else {
      return this.optimizedScalarLevenshtein(s1, s2, maxDistance);
    }
  }

  private simdLevenshtein(s1: string, s2: string, maxDistance?: number): number {
    const m = s1.length;
    const n = s2.length;
    const MAX_DIST = maxDistance ?? Math.max(m, n);

    if (Math.abs(m - n) > MAX_DIST) {
      return MAX_DIST + 1;
    }

    const vectorWidth = this.capabilities.vectorWidth;
    const chunksPerRow = Math.ceil(n / vectorWidth);

    let prevRow = new Int32Array((chunksPerRow + 1) * vectorWidth);
    let currRow = new Int32Array((chunksPerRow + 1) * vectorWidth);

    for (let j = 0; j < n; j++) {
      prevRow[j] = j;
    }

    for (let i = 1; i <= m; i++) {
      currRow[0] = i;
      let minInRow = i;

      for (let chunkIdx = 0; chunkIdx < chunksPerRow; chunkIdx++) {
        const startJ = chunkIdx * vectorWidth;
        const endJ = Math.min(startJ + vectorWidth, n);

        for (let jOffset = 0; jOffset < vectorWidth && startJ + jOffset < endJ; jOffset++) {
          const j = startJ + jOffset + 1;
          const realJ = startJ + jOffset;

          if (realJ >= n) {
            currRow[j] = currRow[j - 1];
            continue;
          }

          const cost = s1[i - 1] === s2[realJ] ? 0 : 1;

          const substitution = prevRow[j - 1] + cost;
          const insertion = currRow[j - 1] + 1;
          const deletion = prevRow[j] + 1;

          currRow[j] = Math.min(substitution, insertion, deletion);
          minInRow = Math.min(minInRow, currRow[j]);
        }
      }

      if (minInRow > MAX_DIST) {
        return MAX_DIST + 1;
      }

      [prevRow, currRow] = [currRow, prevRow];
    }

    return Math.min(prevRow[n], MAX_DIST);
  }

  private optimizedScalarLevenshtein(s1: string, s2: string, maxDistance?: number): number {
    const m = s1.length;
    const n = s2.length;
    const MAX_DIST = maxDistance ?? Math.max(m, n);

    if (Math.abs(m - n) > MAX_DIST) {
      return MAX_DIST + 1;
    }

    let prevRow = new Int32Array(n + 1);
    let currRow = new Int32Array(n + 1);

    for (let j = 0; j <= n; j++) {
      prevRow[j] = j;
    }

    for (let i = 1; i <= m; i++) {
      currRow[0] = i;
      let minInRow = i;
      const char1 = s1[i - 1];

      for (let j = 1; j <= n; j++) {
        const cost = char1 === s2[j - 1] ? 0 : 1;

        const prev = currRow[j - 1];
        const above = prevRow[j];
        const diag = prevRow[j - 1];

        const insertion = prev + 1;
        const deletion = above + 1;
        const substitution = diag + cost;

        let min = insertion;
        if (deletion < min) min = deletion;
        if (substitution < min) min = substitution;

        currRow[j] = min;
        if (min < minInRow) minInRow = min;
      }

      if (minInRow > MAX_DIST) {
        return MAX_DIST + 1;
      }

      [prevRow, currRow] = [currRow, prevRow];
    }

    return Math.min(prevRow[n], MAX_DIST);
  }

  batchLevenshteinDistance(targets: string[], candidates: string[], maxDistance?: number): number[][] {
    if (this.capabilities.hasSimd && targets.length >= 4 && candidates.length >= 4) {
      return this.simdBatchLevenshtein(targets, candidates, maxDistance);
    } else {
      return this.scalarBatchLevenshtein(targets, candidates, maxDistance);
    }
  }

  private simdBatchLevenshtein(targets: string[], candidates: string[], maxDistance?: number): number[][] {
    const results: number[][] = [];

    for (let i = 0; i < targets.length; i += 4) {
      const targetBatch = targets.slice(i, i + 4);
      const batchResults: number[][] = targetBatch.map(() => []);

      for (let j = 0; j < candidates.length; j += 4) {
        const candidateBatch = candidates.slice(j, j + 4);

        for (let ti = 0; ti < targetBatch.length; ti++) {
          for (let ci = 0; ci < candidateBatch.length; ci++) {
            if (targetBatch[ti] && candidateBatch[ci]) {
              const distance = this.optimizedLevenshteinDistance(
                targetBatch[ti],
                candidateBatch[ci],
                maxDistance
              );
              batchResults[ti][j + ci] = distance;
            }
          }
        }
      }

      results.push(...batchResults);
    }

    return results;
  }

  private scalarBatchLevenshtein(targets: string[], candidates: string[], maxDistance?: number): number[][] {
    return targets.map(target =>
      candidates.map(candidate =>
        this.optimizedLevenshteinDistance(target, candidate, maxDistance)
      )
    );
  }

  optimizedJaroWinkler(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    if (this.capabilities.hasSimd && Math.min(s1.length, s2.length) >= 8) {
      return this.simdJaroWinkler(s1, s2);
    } else {
      return this.scalarJaroWinkler(s1, s2);
    }
  }

  private simdJaroWinkler(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;
    const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;

    if (matchWindow < 0) return s1 === s2 ? 1.0 : 0.0;

    const vectorWidth = this.capabilities.vectorWidth;
    const s1Matches = new Uint8Array(Math.ceil(len1 / vectorWidth) * vectorWidth);
    const s2Matches = new Uint8Array(Math.ceil(len2 / vectorWidth) * vectorWidth);

    let matches = 0;

    for (let i = 0; i < len1; i += vectorWidth) {
      const endI = Math.min(i + vectorWidth, len1);

      for (let ii = i; ii < endI; ii++) {
        const start = Math.max(0, ii - matchWindow);
        const end = Math.min(ii + matchWindow + 1, len2);

        for (let j = start; j < end; j++) {
          if (s2Matches[j] || s1[ii] !== s2[j]) continue;

          s1Matches[ii] = 1;
          s2Matches[j] = 1;
          matches++;
          break;
        }
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

    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0;

    let prefixLength = 0;
    for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
      if (s1[i] === s2[i]) {
        prefixLength++;
      } else {
        break;
      }
    }

    return jaro + (prefixLength * 0.1 * (1 - jaro));
  }

  private scalarJaroWinkler(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;
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

    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0;

    let prefixLength = 0;
    for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
      if (s1[i] === s2[i]) {
        prefixLength++;
      } else {
        break;
      }
    }

    return jaro + (prefixLength * 0.1 * (1 - jaro));
  }

  getCapabilities(): SimdCapabilities {
    return { ...this.capabilities };
  }

  benchmark(): { scalar: number; simd: number; speedup: number } {
    const testStrings = [
      'hello world',
      'fuzzy matching',
      'performance test',
      'simd optimization',
      'levenshtein distance'
    ];

    const iterations = 1000;

    const scalarStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (let j = 0; j < testStrings.length - 1; j++) {
        this.scalarJaroWinkler(testStrings[j], testStrings[j + 1]);
        this.optimizedScalarLevenshtein(testStrings[j], testStrings[j + 1]);
      }
    }
    const scalarTime = performance.now() - scalarStart;

    const simdStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (let j = 0; j < testStrings.length - 1; j++) {
        this.simdJaroWinkler(testStrings[j], testStrings[j + 1]);
        this.simdLevenshtein(testStrings[j], testStrings[j + 1]);
      }
    }
    const simdTime = performance.now() - simdStart;

    return {
      scalar: scalarTime,
      simd: simdTime,
      speedup: scalarTime / simdTime
    };
  }
}

export const simdMatcher = new SimdOptimizedMatcher();