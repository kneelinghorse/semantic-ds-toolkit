import { UnitConverter } from '../src/operators/unit-convert';
import { FXCache } from '../src/operators/fx-cache';
import { TimeAligner } from '../src/operators/align-time';
import { TimezoneHandler } from '../src/operators/timezone-handler';
import { GrainAdjuster } from '../src/operators/grain-adjuster';

describe('Unit Conversion & Time Alignment', () => {
  let unitConverter: UnitConverter;
  let fxCache: FXCache;
  let timeAligner: TimeAligner;
  let timezoneHandler: TimezoneHandler;
  let grainAdjuster: GrainAdjuster;

  beforeEach(() => {
    unitConverter = new UnitConverter();
    fxCache = new FXCache(3600000); // 1 hour TTL
    timeAligner = new TimeAligner();
    timezoneHandler = new TimezoneHandler();
    grainAdjuster = new GrainAdjuster();
  });

  describe('UnitConverter', () => {
    test('should convert same units', async () => {
      const result = await unitConverter.convert(100, 'USD', 'USD');
      expect(result.value).toBe(100);
      expect(result.fromUnit).toBe('USD');
      expect(result.toUnit).toBe('USD');
    });

    test('should convert temperature units', async () => {
      const result = await unitConverter.convert(0, 'C', 'F');
      expect(result.value).toBe(32);
      expect(result.fromUnit).toBe('C');
      expect(result.toUnit).toBe('F');
    });

    test('should convert distance units', async () => {
      const result = await unitConverter.convert(1000, 'm', 'km');
      expect(result.value).toBe(1);
      expect(result.fromUnit).toBe('m');
      expect(result.toUnit).toBe('km');
    });

    test('should convert time units', async () => {
      const result = await unitConverter.convert(3600, 's', 'h');
      expect(result.value).toBe(1);
    });

    test('should convert mass units', async () => {
      const result = await unitConverter.convert(1000, 'g', 'kg');
      expect(result.value).toBe(1);
    });

    test('should handle batch conversions', async () => {
      const conversions = [
        { value: 100, fromUnit: 'cm', toUnit: 'm' },
        { value: 1, fromUnit: 'kg', toUnit: 'g' },
        { value: 32, fromUnit: 'F', toUnit: 'C' }
      ];

      const results = await unitConverter.convertBatch(conversions);
      expect(results).toHaveLength(3);
      expect(results[0].value).toBe(1); // 100cm = 1m
      expect(results[1].value).toBe(1000); // 1kg = 1000g
      expect(results[2].value).toBe(0); // 32F = 0C
    });

    test('should complete conversion within performance target', async () => {
      const start = Date.now();
      await unitConverter.convert(100, 'ft', 'm');
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50); // < 50ms target
    });

    test('should reject conversions between different categories', async () => {
      await expect(unitConverter.convert(100, 'USD', 'C'))
        .rejects.toThrow('Cannot convert between different unit categories');
    });

    test('should provide unit information', () => {
      const unitInfo = unitConverter.getUnitInfo('USD');
      expect(unitInfo).toBeDefined();
      expect(unitInfo?.category).toBe('currency');

      const supportedUnits = unitConverter.getSupportedUnits('temperature');
      expect(supportedUnits).toContain('°C');
      expect(supportedUnits).toContain('°F');
      expect(supportedUnits).toContain('K');
    });
  });

  describe('FXCache', () => {
    test('should handle same currency exchange', async () => {
      const result = await fxCache.getExchangeRate('USD', 'USD');
      expect(result.rate).toBe(1);
      expect(result.fromCurrency).toBe('USD');
      expect(result.toCurrency).toBe('USD');
    });

    test('should cache exchange rates', async () => {
      // First call - should fetch
      const result1 = await fxCache.getExchangeRate('USD', 'EUR');
      expect(result1.rate).toBeGreaterThan(0);

      // Second call - should use cache
      const result2 = await fxCache.getExchangeRate('USD', 'EUR');
      expect(result2.rate).toBe(result1.rate);
      expect(['cache', 'fallback', 'ecb']).toContain(result2.source);
    });

    test('should support major currency pairs', () => {
      const supportedCurrencies = fxCache.getSupportedCurrencies();
      expect(supportedCurrencies).toContain('USD');
      expect(supportedCurrencies).toContain('EUR');
      expect(supportedCurrencies).toContain('GBP');
      expect(supportedCurrencies).toContain('JPY');
    });

    test('should provide cache statistics', () => {
      const stats = fxCache.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitRate');
    });

    test('should clear cache', () => {
      fxCache.clearCache();
      const stats = fxCache.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('TimezoneHandler', () => {
    test('should detect timezone from timestamps', () => {
      const timestamps = [
        new Date('2023-01-01T12:00:00Z'),
        new Date('2023-01-01T13:00:00Z'),
        new Date('2023-01-01T14:00:00Z')
      ];

      const detectedTz = timezoneHandler.detectTimezone(timestamps);
      expect(detectedTz).toBeDefined();
    });

    test('should convert between timezones', async () => {
      const utcTime = new Date('2023-01-01T12:00:00Z');
      const nyTime = await timezoneHandler.convertTimezone(utcTime, 'UTC', 'America/New_York');

      expect(nyTime).not.toEqual(utcTime);
      expect(nyTime.getTime()).not.toBe(utcTime.getTime());
    });

    test('should handle same timezone conversion', async () => {
      const timestamp = new Date();
      const result = await timezoneHandler.convertTimezone(timestamp, 'UTC', 'UTC');
      expect(result.getTime()).toBe(timestamp.getTime());
    });

    test('should provide timezone information', () => {
      const tzInfo = timezoneHandler.getTimezoneInfo('America/New_York');
      expect(tzInfo.name).toBe('America/New_York');
      expect(tzInfo.offset).toBeDefined();
    });

    test('should validate timezones', () => {
      expect(timezoneHandler.validateTimezone('UTC')).toBe(true);
      expect(timezoneHandler.validateTimezone('America/New_York')).toBe(true);
      expect(timezoneHandler.validateTimezone('Invalid/Timezone')).toBe(false);
    });

    test('should normalize to UTC', () => {
      const timestamps = [
        new Date('2023-01-01T12:00:00-05:00'),
        new Date('2023-01-01T13:00:00-05:00')
      ];

      const utcTimestamps = timezoneHandler.normalizeToUTC(timestamps, 'America/New_York');
      expect(utcTimestamps).toHaveLength(2);
    });
  });

  describe('GrainAdjuster', () => {
    test('should detect time grain from regular intervals', () => {
      const hourlyTimestamps = [
        new Date('2023-01-01T00:00:00Z'),
        new Date('2023-01-01T01:00:00Z'),
        new Date('2023-01-01T02:00:00Z'),
        new Date('2023-01-01T03:00:00Z')
      ];

      const detectedGrain = grainAdjuster.detectGrain(hourlyTimestamps);
      expect(detectedGrain).toBe('hour');
    });

    test('should adjust grain with different strategies', async () => {
      const timestamps = [
        new Date('2023-01-01T00:30:00Z'),
        new Date('2023-01-01T01:30:00Z')
      ];

      const floorResult = await grainAdjuster.adjustGrain(timestamps, 'auto', 'hour', 'floor');
      expect(floorResult.adjustedTimestamps[0].getMinutes()).toBe(0);

      const ceilResult = await grainAdjuster.adjustGrain(timestamps, 'auto', 'hour', 'ceil');
      expect(ceilResult.adjustedTimestamps[0].getMinutes()).toBe(0); // Should be aligned to hour boundary
    });

    test('should provide grain statistics', () => {
      const regularTimestamps = [
        new Date('2023-01-01T00:00:00Z'),
        new Date('2023-01-01T01:00:00Z'),
        new Date('2023-01-01T02:00:00Z')
      ];

      const stats = grainAdjuster.getGrainStatistics(regularTimestamps);
      expect(stats.detectedGrain).toBe('hour');
      expect(stats.confidence).toBeGreaterThan(0.9);
      expect(stats.regularityScore).toBeGreaterThan(0.9);
    });

    test('should create time grids', () => {
      const start = new Date('2023-01-01T00:00:00Z');
      const end = new Date('2023-01-01T03:00:00Z');

      const grid = grainAdjuster.createTimeGrid(start, end, 'hour');
      expect(grid).toHaveLength(4); // 0, 1, 2, 3 hours
      expect(grid[0].getTime()).toBe(start.getTime());
    });

    test('should optimize grain for dataset', async () => {
      const timestamps = Array.from({ length: 100 }, (_, i) =>
        new Date(Date.now() + i * 60 * 60 * 1000) // Hourly data
      );

      const optimization = await grainAdjuster.optimizeGrainForDataset(timestamps, 50);
      expect(optimization.recommendedGrain).toBeDefined();
      expect(optimization.reasoning).toBeDefined();
    });
  });

  describe('TimeAligner Integration', () => {
    test('should align time series with timezone conversion', async () => {
      const data = [
        { timestamp: new Date('2023-01-01T12:00:00Z'), value: 100 },
        { timestamp: new Date('2023-01-01T13:00:00Z'), value: 200 },
        { timestamp: new Date('2023-01-01T14:00:00Z'), value: 300 }
      ];

      const result = await timeAligner.alignTimeSeries(data, {
        targetTimezone: 'America/New_York',
        targetGrain: 'hour',
        fillMethod: 'forward'
      });

      expect(result.alignedData).toHaveLength(3);
      expect(result.alignment.targetTimezone).toBe('America/New_York');
      expect(result.alignment.targetGrain).toBe('hour');
    });

    test('should fill gaps in time series', async () => {
      const dataWithGaps = [
        { timestamp: new Date('2023-01-01T00:00:00Z'), value: 100 },
        { timestamp: new Date('2023-01-01T02:00:00Z'), value: 200 }, // 1 hour gap
        { timestamp: new Date('2023-01-01T03:00:00Z'), value: 300 }
      ];

      const result = await timeAligner.alignTimeSeries(dataWithGaps, {
        targetGrain: 'hour',
        fillMethod: 'interpolate'
      });

      expect(result.alignedData.length).toBeGreaterThan(3);
      expect(result.statistics.gapsfilled).toBeGreaterThan(0);
    });

    test('should handle multiple time series alignment', async () => {
      const seriesData = {
        series1: [
          { timestamp: new Date('2023-01-01T00:00:00Z'), value: 100 },
          { timestamp: new Date('2023-01-01T01:00:00Z'), value: 200 }
        ],
        series2: [
          { timestamp: new Date('2023-01-01T00:30:00Z'), value: 150 },
          { timestamp: new Date('2023-01-01T01:30:00Z'), value: 250 }
        ]
      };

      const results = await timeAligner.alignMultipleSeries(seriesData, {
        targetGrain: 'hour',
        alignmentStrategy: 'floor'
      });

      expect(results.series1).toBeDefined();
      expect(results.series2).toBeDefined();
    });

    test('should create common time grid', async () => {
      const seriesData = {
        temperature: [
          { timestamp: new Date('2023-01-01T00:00:00Z'), value: 20 },
          { timestamp: new Date('2023-01-01T01:00:00Z'), value: 21 }
        ],
        humidity: [
          { timestamp: new Date('2023-01-01T00:30:00Z'), value: 60 },
          { timestamp: new Date('2023-01-01T01:30:00Z'), value: 65 }
        ]
      };

      const result = await timeAligner.createCommonTimeGrid(seriesData, {
        targetGrain: 'hour'
      });

      expect(result.timeGrid.length).toBeGreaterThan(0);
      expect(result.alignedSeries.temperature).toBeDefined();
      expect(result.alignedSeries.humidity).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    test('unit conversion should be fast', async () => {
      const conversions = Array.from({ length: 1000 }, (_, i) => ({
        value: i,
        fromUnit: 'm',
        toUnit: 'ft'
      }));

      const start = Date.now();
      await unitConverter.convertBatch(conversions);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000); // Should complete 1000 conversions in under 1 second
    });

    test('timezone conversion should be efficient', async () => {
      const timestamps = Array.from({ length: 1000 }, (_, i) =>
        new Date(Date.now() + i * 60000)
      );

      const start = Date.now();
      await timezoneHandler.convertBatch(timestamps, 'UTC', 'America/New_York');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
    });

    test('grain adjustment should scale well', async () => {
      const timestamps = Array.from({ length: 10000 }, (_, i) =>
        new Date(Date.now() + i * 1000)
      );

      const start = Date.now();
      await grainAdjuster.adjustGrain(timestamps, 'second', 'minute');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(2000); // Should handle 10k timestamps in under 2 seconds
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid unit conversions', async () => {
      await expect(unitConverter.convert(100, 'INVALID', 'USD'))
        .rejects.toThrow('Unsupported unit conversion');
    });

    test('should handle invalid timezone conversions', async () => {
      await expect(timezoneHandler.convertTimezone(
        new Date(), 'INVALID/TIMEZONE', 'UTC'
      )).rejects.toThrow();
    });

    test('should handle empty datasets gracefully', () => {
      const emptyGrain = grainAdjuster.detectGrain([]);
      expect(emptyGrain).toBe('second');

      const emptyStats = grainAdjuster.getGrainStatistics([]);
      expect(emptyStats.confidence).toBe(0);
    });
  });
});
