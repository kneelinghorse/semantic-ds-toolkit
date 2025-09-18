import { TimezoneHandler } from '../../src/operators/timezone-handler';

describe('Operators: TimezoneHandler (extra)', () => {
  const handler = new TimezoneHandler();

  it('convertBatch converts between timezones', async () => {
    const dates = [new Date('2024-01-01T12:00:00Z'), new Date('2024-06-01T12:00:00Z')];
    const res = await handler.convertBatch(dates, 'UTC', 'Europe/Paris');
    expect(res).toHaveLength(2);
    // Paris is +60 min in winter, +120 in summer relative to UTC offset mapping
    expect(res[0].getTime()).not.toBe(dates[0].getTime());
  });

  it('findClosestTimezone returns a supported timezone name', async () => {
    // Offset close to New York (~ -300 min)
    const tz = await handler.findClosestTimezone(-300);
    expect(typeof tz).toBe('string');
    expect(handler.getSupportedTimezones()).toContain(tz);
  });
});

