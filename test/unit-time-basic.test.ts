import { UnitConverter } from '../src/operators/unit-convert';
import { FXCache } from '../src/operators/fx-cache';
import { TimezoneHandler } from '../src/operators/timezone-handler';
import { GrainAdjuster } from '../src/operators/grain-adjuster';

describe('Basic Unit Conversion & Time Alignment Tests', () => {
  describe('UnitConverter', () => {
    test('should convert same units', async () => {
      const converter = new UnitConverter();
      const result = await converter.convert(100, 'USD', 'USD');
      expect(result.value).toBe(100);
      expect(result.fromUnit).toBe('USD');
      expect(result.toUnit).toBe('USD');
    });

    test('should convert temperature units', async () => {
      const converter = new UnitConverter();
      const result = await converter.convert(0, 'C', 'F');
      expect(result.value).toBe(32);
    });

    test('should convert distance units', async () => {
      const converter = new UnitConverter();
      const result = await converter.convert(1000, 'm', 'km');
      expect(result.value).toBe(1);
    });

    test('should handle performance target', async () => {
      const converter = new UnitConverter();
      const start = Date.now();
      await converter.convert(100, 'ft', 'm');
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('FXCache', () => {
    test('should handle same currency', async () => {
      const cache = new FXCache();
      const result = await cache.getExchangeRate('USD', 'USD');
      expect(result.rate).toBe(1);
      expect(result.fromCurrency).toBe('USD');
      expect(result.toCurrency).toBe('USD');
    });

    test('should provide cache stats', () => {
      const cache = new FXCache();
      const stats = cache.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitRate');
    });
  });

  describe('TimezoneHandler', () => {
    test('should detect timezone from timestamps', () => {
      const handler = new TimezoneHandler();
      const timestamps = [
        new Date('2023-01-01T12:00:00Z'),
        new Date('2023-01-01T13:00:00Z')
      ];
      const timezone = handler.detectTimezone(timestamps);
      expect(typeof timezone).toBe('string');
    });

    test('should convert between timezones', async () => {
      const handler = new TimezoneHandler();
      const utcTime = new Date('2023-01-01T12:00:00Z');
      const result = await handler.convertTimezone(utcTime, 'UTC', 'America/New_York');
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).not.toBe(utcTime.getTime());
    });

    test('should validate timezones', () => {
      const handler = new TimezoneHandler();
      expect(handler.validateTimezone('UTC')).toBe(true);
      expect(handler.validateTimezone('Invalid/Timezone')).toBe(false);
    });
  });

  describe('GrainAdjuster', () => {
    test('should detect time grain', () => {
      const adjuster = new GrainAdjuster();
      const hourlyTimestamps = [
        new Date('2023-01-01T00:00:00Z'),
        new Date('2023-01-01T01:00:00Z'),
        new Date('2023-01-01T02:00:00Z')
      ];
      const grain = adjuster.detectGrain(hourlyTimestamps);
      expect(grain).toBe('hour');
    });

    test('should adjust grain', async () => {
      const adjuster = new GrainAdjuster();
      const timestamps = [
        new Date('2023-01-01T00:30:00Z'),
        new Date('2023-01-01T01:30:00Z')
      ];
      const result = await adjuster.adjustGrain(timestamps, 'auto', 'hour', 'floor');
      expect(result.adjustedTimestamps).toHaveLength(2);
      expect(result.adjustedTimestamps[0].getMinutes()).toBe(0);
    });

    test('should create time grids', () => {
      const adjuster = new GrainAdjuster();
      const start = new Date('2023-01-01T00:00:00Z');
      const end = new Date('2023-01-01T03:00:00Z');
      const grid = adjuster.createTimeGrid(start, end, 'hour');
      expect(grid).toHaveLength(4);
    });
  });
});