import { TimezoneHandler } from '../../src/operators/timezone-handler';

describe('Operators: TimezoneHandler', () => {
  const handler = new TimezoneHandler();

  it('validates known and unknown timezones', () => {
    expect(handler.validateTimezone('UTC')).toBe(true);
    expect(handler.validateTimezone('Invalid/Zone')).toBe(false);
  });

  it('getTimezoneInfo returns fallback for unknown zones', () => {
    const info = handler.getTimezoneInfo('Invalid/Zone');
    expect(info.name).toBe('Invalid/Zone');
    expect(info.abbreviation).toBe('Invalid/Zone');
  });

  it('normalizeToUTC returns a copy for UTC/no source', () => {
    const now = new Date();
    const res = handler.normalizeToUTC([now]);
    expect(res[0].getTime()).toBe(now.getTime());
  });
});

