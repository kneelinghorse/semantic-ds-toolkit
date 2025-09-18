import { TimezoneHandler } from './timezone-handler';
import { GrainAdjuster, TimeGrain } from './grain-adjuster';

export interface TimeAlignmentConfig {
  targetTimezone?: string;
  targetGrain?: TimeGrain;
  preserveStatistics?: boolean;
  fillMethod?: 'forward' | 'backward' | 'interpolate' | 'zero' | 'drop';
  alignmentStrategy?: 'floor' | 'ceil' | 'round' | 'nearest';
}

export interface TimeSeriesData {
  timestamp: Date;
  value: number;
  metadata?: Record<string, any>;
}

export interface AlignmentResult {
  originalData: TimeSeriesData[];
  alignedData: TimeSeriesData[];
  alignment: {
    sourceTimezone?: string;
    targetTimezone?: string;
    sourceGrain?: TimeGrain;
    targetGrain?: TimeGrain;
    strategy: string;
    fillMethod: string;
    dataLoss: number; // percentage of data lost/interpolated
  };
  statistics: {
    originalCount: number;
    alignedCount: number;
    duplicatesRemoved: number;
    gapsfilled: number;
  };
}

export class TimeAligner {
  private timezoneHandler: TimezoneHandler;
  private grainAdjuster: GrainAdjuster;

  constructor() {
    this.timezoneHandler = new TimezoneHandler();
    this.grainAdjuster = new GrainAdjuster();
  }

  async alignTimeSeries(
    data: TimeSeriesData[],
    config: TimeAlignmentConfig = {}
  ): Promise<AlignmentResult> {
    const {
      targetTimezone,
      targetGrain,
      preserveStatistics = true,
      fillMethod = 'forward',
      alignmentStrategy = 'floor'
    } = config;

    // Sort data by timestamp
    const sortedData = [...data].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    let processedData = sortedData;
    let sourceTimezone: string | undefined;
    let sourceGrain: TimeGrain | undefined;

    // Step 1: Detect source timezone and grain
    if (sortedData.length > 0) {
      sourceTimezone = this.timezoneHandler.detectTimezone(sortedData.map(d => d.timestamp));
      sourceGrain = this.grainAdjuster.detectGrain(sortedData.map(d => d.timestamp));
    }

    // Step 2: Convert timezone if needed
    if (targetTimezone && sourceTimezone !== targetTimezone) {
      processedData = await this.convertTimezone(processedData, sourceTimezone, targetTimezone);
    }

    // Step 3: Adjust grain if needed
    let duplicatesRemoved = 0;
    let gapsFound = 0;

    if (targetGrain && sourceGrain !== targetGrain) {
      const grainResult = await this.adjustGrain(
        processedData,
        sourceGrain || 'auto',
        targetGrain,
        alignmentStrategy,
        preserveStatistics
      );
      processedData = grainResult.data;
      duplicatesRemoved = grainResult.duplicatesRemoved;
      gapsFound = grainResult.gapsFound;
    }

    // Step 4: Fill gaps if requested
    let gapsFilledCount = 0;
    if (fillMethod !== 'drop' && targetGrain) {
      const fillResult = this.fillGaps(processedData, targetGrain, fillMethod);
      processedData = fillResult.data;
      gapsFilledCount = fillResult.gapsFilled;
    }

    // Calculate statistics
    const dataLoss = data.length > 0
      ? Math.max(0, (data.length - processedData.length) / data.length * 100)
      : 0;

    return {
      originalData: data,
      alignedData: processedData,
      alignment: {
        sourceTimezone,
        targetTimezone,
        sourceGrain,
        targetGrain,
        strategy: alignmentStrategy,
        fillMethod,
        dataLoss
      },
      statistics: {
        originalCount: data.length,
        alignedCount: processedData.length,
        duplicatesRemoved,
        gapsfilled: gapsFilledCount
      }
    };
  }

  private async convertTimezone(
    data: TimeSeriesData[],
    sourceTimezone: string | undefined,
    targetTimezone: string
  ): Promise<TimeSeriesData[]> {
    return Promise.all(
      data.map(async (item) => {
        const convertedTimestamp = await this.timezoneHandler.convertTimezone(
          item.timestamp,
          sourceTimezone || 'UTC',
          targetTimezone
        );

        return {
          ...item,
          timestamp: convertedTimestamp,
          metadata: {
            ...item.metadata,
            originalTimezone: sourceTimezone,
            convertedTimezone: targetTimezone
          }
        };
      })
    );
  }

  private async adjustGrain(
    data: TimeSeriesData[],
    sourceGrain: TimeGrain,
    targetGrain: TimeGrain,
    strategy: string,
    preserveStatistics: boolean
  ): Promise<{data: TimeSeriesData[], duplicatesRemoved: number, gapsFound: number}> {
    const adjustResult = await this.grainAdjuster.adjustGrain(
      data.map(d => d.timestamp),
      sourceGrain,
      targetGrain,
      strategy as any
    );

    // Map adjusted timestamps back to data
    const timestampValueMap = new Map<number, TimeSeriesData[]>();

    // Group data by original timestamp
    data.forEach(item => {
      const key = item.timestamp.getTime();
      if (!timestampValueMap.has(key)) {
        timestampValueMap.set(key, []);
      }
      timestampValueMap.get(key)!.push(item);
    });

    const adjustedData: TimeSeriesData[] = [];
    let duplicatesRemoved = 0;

    adjustResult.adjustedTimestamps.forEach((adjustedTs, index) => {
      const originalTs = data[index]?.timestamp.getTime();
      const originalItems = timestampValueMap.get(originalTs) || [];

      if (originalItems.length === 0) return;

      if (originalItems.length > 1) {
        // Handle duplicates - aggregate if preserving statistics
        if (preserveStatistics) {
          const aggregatedValue = this.aggregateValues(originalItems);
          adjustedData.push({
            timestamp: adjustedTs,
            value: aggregatedValue,
            metadata: {
              ...originalItems[0].metadata,
              aggregated: true,
              originalCount: originalItems.length,
              aggregationMethod: 'mean'
            }
          });
        } else {
          // Take first value
          adjustedData.push({
            ...originalItems[0],
            timestamp: adjustedTs
          });
        }
        duplicatesRemoved += originalItems.length - 1;
      } else {
        adjustedData.push({
          ...originalItems[0],
          timestamp: adjustedTs
        });
      }
    });

    return {
      data: adjustedData,
      duplicatesRemoved,
      gapsFound: adjustResult.gapsFound
    };
  }

  private aggregateValues(items: TimeSeriesData[]): number {
    const values = items.map(item => item.value).filter(v => !isNaN(v));
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private fillGaps(
    data: TimeSeriesData[],
    grain: TimeGrain,
    method: 'forward' | 'backward' | 'interpolate' | 'zero'
  ): {data: TimeSeriesData[], gapsFilled: number} {
    if (data.length === 0) return { data, gapsFilled: 0 };

    const sortedData = [...data].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const result: TimeSeriesData[] = [];
    let gapsFilled = 0;

    const grainMs = this.grainAdjuster.getGrainMilliseconds(grain);
    const startTime = sortedData[0].timestamp.getTime();
    const endTime = sortedData[sortedData.length - 1].timestamp.getTime();

    let currentTime = startTime;
    let dataIndex = 0;

    while (currentTime <= endTime) {
      const currentDate = new Date(currentTime);

      // Check if we have data for this timestamp
      if (dataIndex < sortedData.length &&
          sortedData[dataIndex].timestamp.getTime() === currentTime) {
        result.push(sortedData[dataIndex]);
        dataIndex++;
      } else {
        // Fill the gap
        const filledValue = this.calculateFilledValue(
          result,
          sortedData,
          dataIndex,
          method
        );

        result.push({
          timestamp: currentDate,
          value: filledValue,
          metadata: {
            filled: true,
            fillMethod: method
          }
        });
        gapsFilled++;
      }

      currentTime += grainMs;
    }

    return { data: result, gapsFilled };
  }

  private calculateFilledValue(
    processedData: TimeSeriesData[],
    originalData: TimeSeriesData[],
    nextIndex: number,
    method: 'forward' | 'backward' | 'interpolate' | 'zero'
  ): number {
    switch (method) {
      case 'zero':
        return 0;

      case 'forward':
        return processedData.length > 0
          ? processedData[processedData.length - 1].value
          : 0;

      case 'backward':
        return nextIndex < originalData.length
          ? originalData[nextIndex].value
          : (processedData.length > 0 ? processedData[processedData.length - 1].value : 0);

      case 'interpolate': {
        if (processedData.length === 0) return 0;
        if (nextIndex >= originalData.length) {
          return processedData[processedData.length - 1].value;
        }

        const prevValue = processedData[processedData.length - 1].value;
        const nextValue = originalData[nextIndex].value;
        return (prevValue + nextValue) / 2;
      }

      default:
        return 0;
    }
  }

  async alignMultipleSeries(
    seriesData: Record<string, TimeSeriesData[]>,
    config: TimeAlignmentConfig = {}
  ): Promise<Record<string, AlignmentResult>> {
    const results: Record<string, AlignmentResult> = {};

    // Process each series
    for (const [seriesName, data] of Object.entries(seriesData)) {
      results[seriesName] = await this.alignTimeSeries(data, config);
    }

    return results;
  }

  async createCommonTimeGrid(
    seriesData: Record<string, TimeSeriesData[]>,
    config: TimeAlignmentConfig = {}
  ): Promise<{
    timeGrid: Date[];
    alignedSeries: Record<string, TimeSeriesData[]>;
    statistics: Record<string, any>;
  }> {
    // Find common time range and grain
    const allTimestamps: Date[] = [];
    Object.values(seriesData).forEach(series => {
      series.forEach(point => allTimestamps.push(point.timestamp));
    });

    if (allTimestamps.length === 0) {
      return { timeGrid: [], alignedSeries: {}, statistics: {} };
    }

    allTimestamps.sort((a, b) => a.getTime() - b.getTime());

    const commonGrain = config.targetGrain ||
      this.grainAdjuster.detectGrain(allTimestamps);

    const startTime = allTimestamps[0];
    const endTime = allTimestamps[allTimestamps.length - 1];

    // Create time grid
    const timeGrid = this.grainAdjuster.createTimeGrid(startTime, endTime, commonGrain);

    // Align all series to this grid
    const alignedSeries: Record<string, TimeSeriesData[]> = {};
    const statistics: Record<string, any> = {};

    for (const [seriesName, data] of Object.entries(seriesData)) {
      const alignmentResult = await this.alignTimeSeries(data, {
        ...config,
        targetGrain: commonGrain
      });

      alignedSeries[seriesName] = alignmentResult.alignedData;
      statistics[seriesName] = alignmentResult.statistics;
    }

    return { timeGrid, alignedSeries, statistics };
  }
}