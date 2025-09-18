export interface KolmogorovSmirnovResult {
  statistic: number;
  p_value: number;
  critical_value: number;
  is_significant: boolean;
}

export interface PopulationStabilityResult {
  psi_score: number;
  stability_category: 'stable' | 'minor_shift' | 'major_shift' | 'significant_shift';
  bin_contributions: Array<{
    bin: string;
    expected_pct: number;
    actual_pct: number;
    contribution: number;
  }>;
}

export interface ChiSquareResult {
  statistic: number;
  p_value: number;
  degrees_of_freedom: number;
  is_significant: boolean;
}

export class StatisticalTests {
  private readonly DEFAULT_BINS = 10;
  private readonly PSI_THRESHOLDS = {
    stable: 0.1,
    minor_shift: 0.15,
    major_shift: 0.25
  };

  /**
   * Kolmogorov-Smirnov test for distribution comparison
   * Tests whether two datasets come from the same distribution
   */
  kolmogorovSmirnovTest(
    sample1: number[],
    sample2: number[],
    alpha: number = 0.05
  ): KolmogorovSmirnovResult {
    if (sample1.length === 0 || sample2.length === 0) {
      throw new Error('Both samples must contain at least one element');
    }

    // Sort samples
    const sorted1 = [...sample1].sort((a, b) => a - b);
    const sorted2 = [...sample2].sort((a, b) => a - b);

    // Combine and get unique values
    const combined = [...new Set([...sorted1, ...sorted2])].sort((a, b) => a - b);

    let maxDifference = 0;
    const n1 = sorted1.length;
    const n2 = sorted2.length;

    // Calculate empirical distribution functions and find max difference
    for (let i = 0; i < combined.length; i++) {
      const value = combined[i];

      // Count values <= current value in each sample
      const count1 = this.countLessEqual(sorted1, value);
      const count2 = this.countLessEqual(sorted2, value);

      // Calculate empirical CDFs
      const cdf1 = count1 / n1;
      const cdf2 = count2 / n2;

      // Update maximum difference
      const difference = Math.abs(cdf1 - cdf2);
      if (difference > maxDifference) {
        maxDifference = difference;
      }
    }

    // Calculate critical value
    const criticalValue = this.getKSCriticalValue(n1, n2, alpha);

    // Approximate p-value calculation (simplified)
    const pValue = this.calculateKSPValue(maxDifference, n1, n2);

    return {
      statistic: maxDifference,
      p_value: pValue,
      critical_value: criticalValue,
      is_significant: maxDifference > criticalValue
    };
  }

  /**
   * Population Stability Index (PSI) calculation
   * Measures distribution shift between expected and actual datasets
   */
  populationStabilityIndex(
    expected: number[],
    actual: number[],
    bins: number = this.DEFAULT_BINS
  ): number {
    if (expected.length === 0 || actual.length === 0) {
      throw new Error('Both datasets must contain at least one element');
    }

    const psiResult = this.calculatePSIDetailed(expected, actual, bins);
    return psiResult.psi_score;
  }

  /**
   * Detailed PSI calculation with bin-level analysis
   */
  calculatePSIDetailed(
    expected: number[],
    actual: number[],
    bins: number = this.DEFAULT_BINS
  ): PopulationStabilityResult {
    // Determine bin boundaries based on expected data quantiles
    const sortedExpected = [...expected].sort((a, b) => a - b);
    const binBoundaries = this.calculateBinBoundaries(sortedExpected, bins);

    // Calculate bin counts for both datasets
    const expectedBinCounts = this.binData(expected, binBoundaries);
    const actualBinCounts = this.binData(actual, binBoundaries);

    let psiScore = 0;
    const binContributions: Array<{
      bin: string;
      expected_pct: number;
      actual_pct: number;
      contribution: number;
    }> = [];

    for (let i = 0; i < bins; i++) {
      // Calculate percentages (add small epsilon to avoid log(0))
      const expectedPct = Math.max(expectedBinCounts[i] / expected.length, 0.0001);
      const actualPct = Math.max(actualBinCounts[i] / actual.length, 0.0001);

      // PSI contribution for this bin
      const contribution = (actualPct - expectedPct) * Math.log(actualPct / expectedPct);
      psiScore += contribution;

      binContributions.push({
        bin: i < bins - 1
          ? `${binBoundaries[i].toFixed(2)}-${binBoundaries[i + 1].toFixed(2)}`
          : `${binBoundaries[i].toFixed(2)}+`,
        expected_pct: expectedPct,
        actual_pct: actualPct,
        contribution: contribution
      });
    }

    // Determine stability category
    let stabilityCategory: 'stable' | 'minor_shift' | 'major_shift' | 'significant_shift';
    if (psiScore < this.PSI_THRESHOLDS.stable) {
      stabilityCategory = 'stable';
    } else if (psiScore < this.PSI_THRESHOLDS.minor_shift) {
      stabilityCategory = 'minor_shift';
    } else if (psiScore < this.PSI_THRESHOLDS.major_shift) {
      stabilityCategory = 'major_shift';
    } else {
      stabilityCategory = 'significant_shift';
    }

    return {
      psi_score: psiScore,
      stability_category: stabilityCategory,
      bin_contributions: binContributions
    };
  }

  /**
   * Chi-square test for categorical distribution comparison
   */
  chiSquareTest(
    observed: number[],
    expected: number[],
    alpha: number = 0.05
  ): ChiSquareResult {
    if (observed.length !== expected.length) {
      throw new Error('Observed and expected arrays must have the same length');
    }

    if (observed.length === 0) {
      throw new Error('Arrays must contain at least one element');
    }

    let chiSquareStatistic = 0;
    for (let i = 0; i < observed.length; i++) {
      if (expected[i] === 0) {
        throw new Error('Expected frequencies must be greater than 0');
      }
      chiSquareStatistic += Math.pow(observed[i] - expected[i], 2) / expected[i];
    }

    const degreesOfFreedom = observed.length - 1;
    const pValue = this.calculateChiSquarePValue(chiSquareStatistic, degreesOfFreedom);

    return {
      statistic: chiSquareStatistic,
      p_value: pValue,
      degrees_of_freedom: degreesOfFreedom,
      is_significant: pValue < alpha
    };
  }

  /**
   * Anderson-Darling test for distribution comparison
   * More sensitive to tail differences than KS test
   */
  andersonDarlingTest(
    sample1: number[],
    sample2: number[]
  ): { statistic: number; is_significant: boolean } {
    const n1 = sample1.length;
    const n2 = sample2.length;

    if (n1 === 0 || n2 === 0) {
      throw new Error('Both samples must contain at least one element');
    }

    // Sort samples
    const sorted1 = [...sample1].sort((a, b) => a - b);
    const sorted2 = [...sample2].sort((a, b) => a - b);

    // Combine samples
    const combined = [...sorted1, ...sorted2].sort((a, b) => a - b);
    const N = n1 + n2;

    let adStatistic = 0;

    for (let i = 0; i < N; i++) {
      const rank = i + 1;
      const value = combined[i];

      // Find ranks in original samples
      const rank1 = this.countLessEqual(sorted1, value);
      const rank2 = this.countLessEqual(sorted2, value);

      if (rank1 > 0 && rank1 < n1 && rank2 > 0 && rank2 < n2) {
        const term1 = Math.log(rank1 / n1);
        const term2 = Math.log(rank2 / n2);
        adStatistic += (2 * rank - N - 1) * (term1 + term2);
      }
    }

    adStatistic = -N - adStatistic / N;
    adStatistic *= (n1 * n2) / (N * N);

    // Critical value for 5% significance (simplified)
    const criticalValue = 2.5;

    return {
      statistic: adStatistic,
      is_significant: adStatistic > criticalValue
    };
  }

  /**
   * Wasserstein (Earth Mover's) distance between two distributions
   */
  wassersteinDistance(sample1: number[], sample2: number[]): number {
    if (sample1.length === 0 || sample2.length === 0) {
      throw new Error('Both samples must contain at least one element');
    }

    const sorted1 = [...sample1].sort((a, b) => a - b);
    const sorted2 = [...sample2].sort((a, b) => a - b);

    const combined = [...new Set([...sorted1, ...sorted2])].sort((a, b) => a - b);

    let distance = 0;
    let cdf1 = 0;
    let cdf2 = 0;

    for (let i = 0; i < combined.length - 1; i++) {
      const value = combined[i];
      const nextValue = combined[i + 1];

      // Update CDFs
      cdf1 += this.countEqual(sorted1, value) / sorted1.length;
      cdf2 += this.countEqual(sorted2, value) / sorted2.length;

      // Add to distance
      distance += Math.abs(cdf1 - cdf2) * (nextValue - value);
    }

    return distance;
  }

  /**
   * Performance-optimized PSI for large datasets
   */
  fastPSI(
    expected: number[],
    actual: number[],
    sampleSize: number = 10000
  ): number {
    // Sample data if too large
    const sampledExpected = this.sampleArray(expected, sampleSize);
    const sampledActual = this.sampleArray(actual, sampleSize);

    return this.populationStabilityIndex(sampledExpected, sampledActual);
  }

  // Helper methods

  private countLessEqual(sortedArray: number[], value: number): number {
    let count = 0;
    for (const item of sortedArray) {
      if (item <= value) count++;
      else break;
    }
    return count;
  }

  private countEqual(sortedArray: number[], value: number): number {
    return sortedArray.filter(x => x === value).length;
  }

  private calculateBinBoundaries(sortedData: number[], bins: number): number[] {
    const boundaries: number[] = [];
    const n = sortedData.length;

    for (let i = 0; i <= bins; i++) {
      const index = Math.floor((i * (n - 1)) / bins);
      boundaries.push(sortedData[index]);
    }

    // Ensure boundaries are unique and sorted
    return [...new Set(boundaries)].sort((a, b) => a - b);
  }

  private binData(data: number[], boundaries: number[]): number[] {
    const bins = new Array(boundaries.length - 1).fill(0);

    for (const value of data) {
      let binIndex = boundaries.length - 2; // Default to last bin

      for (let i = 0; i < boundaries.length - 1; i++) {
        if (value <= boundaries[i + 1]) {
          binIndex = i;
          break;
        }
      }

      bins[binIndex]++;
    }

    return bins;
  }

  private getKSCriticalValue(n1: number, n2: number, alpha: number): number {
    // Simplified critical value calculation
    const n = (n1 * n2) / (n1 + n2);
    const criticalValues: { [key: number]: number } = {
      0.01: 1.63,
      0.05: 1.36,
      0.10: 1.22
    };

    const c = criticalValues[alpha] || 1.36;
    return c * Math.sqrt((n1 + n2) / (n1 * n2));
  }

  private calculateKSPValue(statistic: number, n1: number, n2: number): number {
    // Simplified p-value calculation using asymptotic approximation
    const n = (n1 * n2) / (n1 + n2);
    const lambda = statistic * Math.sqrt(n);

    // Approximation using series expansion
    let pValue = 0;
    for (let k = 1; k <= 100; k++) {
      pValue += Math.pow(-1, k - 1) * Math.exp(-2 * k * k * lambda * lambda);
    }

    return Math.max(0, Math.min(1, 2 * pValue));
  }

  private calculateChiSquarePValue(statistic: number, df: number): number {
    // Simplified chi-square p-value calculation
    // This is a basic approximation - in production, use a proper statistical library
    if (df === 1) {
      const z = Math.sqrt(statistic);
      return 2 * (1 - this.normalCDF(z));
    }

    // For higher df, use gamma function approximation
    const x = statistic / 2;
    const a = df / 2;

    // Incomplete gamma function approximation
    return 1 - this.incompleteGamma(a, x);
  }

  private normalCDF(x: number): number {
    // Standard normal CDF approximation
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  }

  private erf(x: number): number {
    // Error function approximation
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  private incompleteGamma(a: number, x: number): number {
    // Simplified incomplete gamma function
    if (x === 0) return 0;
    if (a === 0) return 1;

    // Use series expansion for small x
    let sum = 1;
    let term = 1;

    for (let n = 1; n <= 100; n++) {
      term *= x / (a + n - 1);
      sum += term;
      if (Math.abs(term) < 1e-10) break;
    }

    return Math.pow(x, a) * Math.exp(-x) * sum / this.gamma(a);
  }

  private gamma(x: number): number {
    // Stirling's approximation for gamma function
    if (x === 1) return 1;
    if (x === 0.5) return Math.sqrt(Math.PI);

    return Math.sqrt(2 * Math.PI / x) * Math.pow(x / Math.E, x);
  }

  private sampleArray(array: number[], sampleSize: number): number[] {
    if (array.length <= sampleSize) return array;

    const sampled: number[] = [];
    const step = array.length / sampleSize;

    for (let i = 0; i < sampleSize; i++) {
      const index = Math.floor(i * step);
      sampled.push(array[index]);
    }

    return sampled;
  }

  /**
   * Batch processing for multiple distribution comparisons
   */
  batchKSTest(
    referenceSamples: number[][],
    testSamples: number[][],
    alpha: number = 0.05
  ): KolmogorovSmirnovResult[] {
    const results: KolmogorovSmirnovResult[] = [];

    for (let i = 0; i < Math.min(referenceSamples.length, testSamples.length); i++) {
      try {
        const result = this.kolmogorovSmirnovTest(referenceSamples[i], testSamples[i], alpha);
        results.push(result);
      } catch (error) {
        // Handle individual test failures gracefully
        results.push({
          statistic: 0,
          p_value: 1,
          critical_value: 0,
          is_significant: false
        });
      }
    }

    return results;
  }

  /**
   * Comprehensive distribution comparison report
   */
  compareDistributions(
    expected: number[],
    actual: number[],
    options: {
      alpha?: number;
      bins?: number;
      includePSI?: boolean;
      includeWasserstein?: boolean;
    } = {}
  ): {
    ks_test: KolmogorovSmirnovResult;
    psi_analysis?: PopulationStabilityResult;
    wasserstein_distance?: number;
    summary: {
      drift_detected: boolean;
      severity: 'none' | 'low' | 'medium' | 'high';
      primary_indicator: string;
    };
  } {
    const {
      alpha = 0.05,
      bins = this.DEFAULT_BINS,
      includePSI = true,
      includeWasserstein = false
    } = options;

    const ksTest = this.kolmogorovSmirnovTest(expected, actual, alpha);

    let psiAnalysis: PopulationStabilityResult | undefined;
    if (includePSI) {
      psiAnalysis = this.calculatePSIDetailed(expected, actual, bins);
    }

    let wassersteinDistance: number | undefined;
    if (includeWasserstein) {
      wassersteinDistance = this.wassersteinDistance(expected, actual);
    }

    // Determine overall assessment
    let driftDetected = ksTest.is_significant;
    let severity: 'none' | 'low' | 'medium' | 'high' = 'none';
    let primaryIndicator = 'KS test';

    if (psiAnalysis) {
      switch (psiAnalysis.stability_category) {
        case 'significant_shift':
          driftDetected = true;
          severity = 'high';
          primaryIndicator = 'PSI';
          break;
        case 'major_shift':
          driftDetected = true;
          severity = severity === 'none' ? 'medium' : severity;
          primaryIndicator = severity === 'medium' ? 'PSI' : primaryIndicator;
          break;
        case 'minor_shift':
          if (severity === 'none') {
            severity = 'low';
            primaryIndicator = 'PSI';
          }
          break;
      }
    }

    if (ksTest.is_significant && severity === 'none') {
      severity = 'medium';
      driftDetected = true;
    }

    return {
      ks_test: ksTest,
      psi_analysis: psiAnalysis,
      wasserstein_distance: wassersteinDistance,
      summary: {
        drift_detected: driftDetected,
        severity: severity,
        primary_indicator: primaryIndicator
      }
    };
  }
}