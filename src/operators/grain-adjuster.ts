export type TimeGrain = 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year' | 'auto';

export type AdjustmentStrategy = 'floor' | 'ceil' | 'round' | 'nearest';

export interface GrainAdjustmentResult {
  originalTimestamps: Date[];
  adjustedTimestamps: Date[];
  sourceGrain: TimeGrain;
  targetGrain: TimeGrain;
  strategy: AdjustmentStrategy;
  gapsFound: number;
  statisticsPreserved: boolean;
}

export interface GrainStatistics {
  mostCommonInterval: number;
  intervalVariance: number;
  detectedGrain: TimeGrain;
  confidence: number;
  regularityScore: number;
}

export class GrainAdjuster {
  private grainMilliseconds: Record<TimeGrain, number> = {
    millisecond: 1,
    second: 1000,
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000, // Approximate
    quarter: 90 * 24 * 60 * 60 * 1000, // Approximate
    year: 365 * 24 * 60 * 60 * 1000, // Approximate
    auto: 0
  };

  detectGrain(timestamps: Date[]): TimeGrain {
    if (timestamps.length < 2) return 'second';

    const sortedTimestamps = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];

    // Calculate intervals between consecutive timestamps
    for (let i = 1; i < sortedTimestamps.length; i++) {
      const interval = sortedTimestamps[i].getTime() - sortedTimestamps[i - 1].getTime();
      if (interval > 0) {
        intervals.push(interval);
      }
    }

    if (intervals.length === 0) return 'second';

    // Find the most common interval
    const intervalCounts = new Map<number, number>();
    intervals.forEach(interval => {
      intervalCounts.set(interval, (intervalCounts.get(interval) || 0) + 1);
    });

    let mostCommonInterval = 0;
    let maxCount = 0;
    intervalCounts.forEach((count, interval) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonInterval = interval;
      }
    });

    // Map interval to grain
    return this.intervalToGrain(mostCommonInterval);
  }

  private intervalToGrain(intervalMs: number): TimeGrain {
    const toleranceFactor = 0.1; // 10% tolerance

    for (const [grain, expectedMs] of Object.entries(this.grainMilliseconds)) {
      if (grain === 'auto') continue;

      const tolerance = expectedMs * toleranceFactor;
      if (Math.abs(intervalMs - expectedMs) <= tolerance) {
        return grain as TimeGrain;
      }
    }

    // If no exact match, find the closest
    let closestGrain: TimeGrain = 'second';
    let smallestDifference = Infinity;

    for (const [grain, expectedMs] of Object.entries(this.grainMilliseconds)) {
      if (grain === 'auto') continue;

      const difference = Math.abs(intervalMs - expectedMs);
      if (difference < smallestDifference) {
        smallestDifference = difference;
        closestGrain = grain as TimeGrain;
      }
    }

    return closestGrain;
  }

  async adjustGrain(
    timestamps: Date[],
    sourceGrain: TimeGrain,
    targetGrain: TimeGrain,
    strategy: AdjustmentStrategy = 'floor'
  ): Promise<GrainAdjustmentResult> {
    if (sourceGrain === targetGrain) {
      return {
        originalTimestamps: timestamps,
        adjustedTimestamps: [...timestamps],
        sourceGrain,
        targetGrain,
        strategy,
        gapsFound: 0,
        statisticsPreserved: true
      };
    }

    // Auto-detect source grain if needed
    const actualSourceGrain = sourceGrain === 'auto' ? this.detectGrain(timestamps) : sourceGrain;

    const adjustedTimestamps = timestamps.map(ts =>
      this.adjustSingleTimestamp(ts, targetGrain, strategy)
    );

    // Detect gaps in the adjusted timeline
    const gapsFound = this.countGaps(adjustedTimestamps, targetGrain);

    return {
      originalTimestamps: timestamps,
      adjustedTimestamps,
      sourceGrain: actualSourceGrain,
      targetGrain,
      strategy,
      gapsFound,
      statisticsPreserved: this.checkStatisticsPreservation(timestamps, adjustedTimestamps)
    };
  }

  private adjustSingleTimestamp(
    timestamp: Date,
    targetGrain: TimeGrain,
    strategy: AdjustmentStrategy
  ): Date {
    const targetMs = this.grainMilliseconds[targetGrain];

    if (targetMs === 0) {
      throw new Error(`Invalid target grain: ${targetGrain}`);
    }

    const timestampMs = timestamp.getTime();

    switch (strategy) {
      case 'floor':
        return new Date(Math.floor(timestampMs / targetMs) * targetMs);

      case 'ceil':
        return new Date(Math.ceil(timestampMs / targetMs) * targetMs);

      case 'round':
        return new Date(Math.round(timestampMs / targetMs) * targetMs);

      case 'nearest':
        // More sophisticated nearest alignment considering calendar boundaries
        return this.alignToNearestCalendarBoundary(timestamp, targetGrain);

      default:
        throw new Error(`Unknown adjustment strategy: ${strategy}`);
    }
  }

  private alignToNearestCalendarBoundary(timestamp: Date, grain: TimeGrain): Date {
    const date = new Date(timestamp);

    switch (grain) {
      case 'second':
        date.setMilliseconds(0);
        return date;

      case 'minute':
        date.setSeconds(0, 0);
        return date;

      case 'hour':
        date.setMinutes(0, 0, 0);
        return date;

      case 'day':
        date.setHours(0, 0, 0, 0);
        return date;

      case 'week': {
        // Align to Monday (assuming week starts on Monday)
        const dayOfWeek = date.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        date.setDate(date.getDate() + mondayOffset);
        date.setHours(0, 0, 0, 0);
        return date;
      }

      case 'month':
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        return date;

      case 'quarter': {
        const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
        date.setMonth(quarterMonth, 1);
        date.setHours(0, 0, 0, 0);
        return date;
      }

      case 'year':
        date.setMonth(0, 1);
        date.setHours(0, 0, 0, 0);
        return date;

      default:
        return this.adjustSingleTimestamp(timestamp, grain, 'round');
    }
  }

  private countGaps(timestamps: Date[], grain: TimeGrain): number {
    if (timestamps.length < 2) return 0;

    const sortedTimestamps = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
    const expectedInterval = this.grainMilliseconds[grain];
    let gaps = 0;

    for (let i = 1; i < sortedTimestamps.length; i++) {
      const actualInterval = sortedTimestamps[i].getTime() - sortedTimestamps[i - 1].getTime();
      const expectedIntervals = Math.round(actualInterval / expectedInterval);

      if (expectedIntervals > 1) {
        gaps += expectedIntervals - 1;
      }
    }

    return gaps;
  }

  private checkStatisticsPreservation(original: Date[], adjusted: Date[]): boolean {
    if (original.length !== adjusted.length) return false;

    // Check if the relative ordering is preserved
    for (let i = 1; i < original.length; i++) {
      const originalOrder = original[i].getTime() - original[i - 1].getTime();
      const adjustedOrder = adjusted[i].getTime() - adjusted[i - 1].getTime();

      if ((originalOrder > 0) !== (adjustedOrder >= 0)) {
        return false;
      }
    }

    return true;
  }

  getGrainStatistics(timestamps: Date[]): GrainStatistics {
    if (timestamps.length < 2) {
      return {
        mostCommonInterval: 0,
        intervalVariance: 0,
        detectedGrain: 'second',
        confidence: 0,
        regularityScore: 0
      };
    }

    const sortedTimestamps = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];

    for (let i = 1; i < sortedTimestamps.length; i++) {
      const interval = sortedTimestamps[i].getTime() - sortedTimestamps[i - 1].getTime();
      if (interval > 0) {
        intervals.push(interval);
      }
    }

    if (intervals.length === 0) {
      return {
        mostCommonInterval: 0,
        intervalVariance: 0,
        detectedGrain: 'second',
        confidence: 0,
        regularityScore: 0
      };
    }

    // Calculate statistics
    const mostCommonInterval = this.getMostCommonInterval(intervals);
    const intervalVariance = this.calculateVariance(intervals);
    const detectedGrain = this.intervalToGrain(mostCommonInterval);
    const confidence = this.calculateConfidence(intervals, mostCommonInterval);
    const regularityScore = this.calculateRegularityScore(intervals);

    return {
      mostCommonInterval,
      intervalVariance,
      detectedGrain,
      confidence,
      regularityScore
    };
  }

  private getMostCommonInterval(intervals: number[]): number {
    const intervalCounts = new Map<number, number>();
    intervals.forEach(interval => {
      intervalCounts.set(interval, (intervalCounts.get(interval) || 0) + 1);
    });

    let mostCommon = 0;
    let maxCount = 0;
    intervalCounts.forEach((count, interval) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = interval;
      }
    });

    return mostCommon;
  }

  private calculateVariance(intervals: number[]): number {
    if (intervals.length === 0) return 0;

    const mean = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const squaredDifferences = intervals.map(interval => Math.pow(interval - mean, 2));
    return squaredDifferences.reduce((sum, sq) => sum + sq, 0) / intervals.length;
  }

  private calculateConfidence(intervals: number[], mostCommonInterval: number): number {
    if (intervals.length === 0) return 0;

    const tolerance = mostCommonInterval * 0.1; // 10% tolerance
    const matchingIntervals = intervals.filter(interval =>
      Math.abs(interval - mostCommonInterval) <= tolerance
    );

    return matchingIntervals.length / intervals.length;
  }

  private calculateRegularityScore(intervals: number[]): number {
    if (intervals.length === 0) return 0;

    // Calculate coefficient of variation (CV)
    const mean = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const variance = this.calculateVariance(intervals);
    const standardDeviation = Math.sqrt(variance);

    if (mean === 0) return 0;

    const cv = standardDeviation / mean;

    // Convert CV to regularity score (lower CV = higher regularity)
    return Math.max(0, 1 - cv);
  }

  createTimeGrid(startTime: Date, endTime: Date, grain: TimeGrain): Date[] {
    const grid: Date[] = [];
    const grainMs = this.grainMilliseconds[grain];

    if (grainMs === 0) {
      throw new Error(`Invalid grain for grid creation: ${grain}`);
    }

    // Align start time to grain boundary
    const alignedStart = this.adjustSingleTimestamp(startTime, grain, 'floor');
    let currentTime = alignedStart.getTime();
    const endTimeMs = endTime.getTime();

    while (currentTime <= endTimeMs) {
      grid.push(new Date(currentTime));
      currentTime += grainMs;
    }

    return grid;
  }

  getGrainMilliseconds(grain: TimeGrain): number {
    return this.grainMilliseconds[grain] || 0;
  }

  isValidGrain(grain: string): grain is TimeGrain {
    return Object.keys(this.grainMilliseconds).includes(grain);
  }

  getAvailableGrains(): TimeGrain[] {
    return Object.keys(this.grainMilliseconds).filter(g => g !== 'auto') as TimeGrain[];
  }

  compareGrains(grain1: TimeGrain, grain2: TimeGrain): number {
    const ms1 = this.grainMilliseconds[grain1];
    const ms2 = this.grainMilliseconds[grain2];

    if (ms1 < ms2) return -1;
    if (ms1 > ms2) return 1;
    return 0;
  }

  async optimizeGrainForDataset(
    timestamps: Date[],
    targetDataPoints?: number
  ): Promise<{ recommendedGrain: TimeGrain, reasoning: string }> {
    if (timestamps.length === 0) {
      return {
        recommendedGrain: 'hour',
        reasoning: 'No data points provided, defaulting to hourly grain'
      };
    }

    const stats = this.getGrainStatistics(timestamps);
    const currentGrain = stats.detectedGrain;

    // If no target data points specified, recommend current grain if regular
    if (!targetDataPoints) {
      if (stats.regularityScore > 0.8 && stats.confidence > 0.8) {
        return {
          recommendedGrain: currentGrain,
          reasoning: `Current ${currentGrain} grain is highly regular (${(stats.regularityScore * 100).toFixed(1)}% regularity)`
        };
      } else {
        // Suggest a coarser grain for better regularity
        const coarserGrain = this.getCoarserGrain(currentGrain);
        return {
          recommendedGrain: coarserGrain,
          reasoning: `Current grain has low regularity (${(stats.regularityScore * 100).toFixed(1)}%), suggesting coarser ${coarserGrain} grain`
        };
      }
    }

    // Calculate time span
    const sortedTimestamps = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
    const timeSpanMs = sortedTimestamps[sortedTimestamps.length - 1].getTime() - sortedTimestamps[0].getTime();

    // Find grain that would produce approximately target data points
    const grains = this.getAvailableGrains().sort((a, b) => this.compareGrains(a, b));

    for (const grain of grains) {
      const grainMs = this.grainMilliseconds[grain];
      const estimatedPoints = Math.floor(timeSpanMs / grainMs) + 1;

      if (estimatedPoints <= targetDataPoints * 1.2 && estimatedPoints >= targetDataPoints * 0.8) {
        return {
          recommendedGrain: grain,
          reasoning: `${grain} grain would produce approximately ${estimatedPoints} data points (target: ${targetDataPoints})`
        };
      }
    }

    // Fallback to current grain
    return {
      recommendedGrain: currentGrain,
      reasoning: `No grain produces exactly ${targetDataPoints} points, keeping detected ${currentGrain} grain`
    };
  }

  private getCoarserGrain(grain: TimeGrain): TimeGrain {
    const grainOrder: TimeGrain[] = ['millisecond', 'second', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'];
    const currentIndex = grainOrder.indexOf(grain);

    if (currentIndex === -1 || currentIndex === grainOrder.length - 1) {
      return grain;
    }

    return grainOrder[currentIndex + 1];
  }
}