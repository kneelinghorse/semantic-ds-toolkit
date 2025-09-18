export interface TimezoneConversionResult {
  convertedTimestamp: Date;
  sourceTimezone: string;
  targetTimezone: string;
  offsetDifference: number; // in minutes
  isDST: boolean;
}

export interface TimezoneInfo {
  name: string;
  abbreviation: string;
  offset: number; // in minutes from UTC
  isDST: boolean;
  dstStart?: Date;
  dstEnd?: Date;
}

export class TimezoneHandler {
  private timezoneCache: Map<string, TimezoneInfo>;
  private offsetCache: Map<string, number>;

  constructor() {
    this.timezoneCache = new Map();
    this.offsetCache = new Map();
    this.initializeCommonTimezones();
  }

  private initializeCommonTimezones(): void {
    const commonTimezones = [
      { name: 'UTC', abbr: 'UTC', offset: 0 },
      { name: 'America/New_York', abbr: 'EST/EDT', offset: -300 },
      { name: 'America/Chicago', abbr: 'CST/CDT', offset: -360 },
      { name: 'America/Denver', abbr: 'MST/MDT', offset: -420 },
      { name: 'America/Los_Angeles', abbr: 'PST/PDT', offset: -480 },
      { name: 'Europe/London', abbr: 'GMT/BST', offset: 0 },
      { name: 'Europe/Paris', abbr: 'CET/CEST', offset: 60 },
      { name: 'Europe/Berlin', abbr: 'CET/CEST', offset: 60 },
      { name: 'Asia/Tokyo', abbr: 'JST', offset: 540 },
      { name: 'Asia/Shanghai', abbr: 'CST', offset: 480 },
      { name: 'Australia/Sydney', abbr: 'AEST/AEDT', offset: 600 },
    ];

    commonTimezones.forEach(tz => {
      this.timezoneCache.set(tz.name, {
        name: tz.name,
        abbreviation: tz.abbr,
        offset: tz.offset,
        isDST: false
      });
    });
  }

  async convertTimezone(
    timestamp: Date,
    sourceTimezone: string,
    targetTimezone: string
  ): Promise<Date> {
    if (sourceTimezone === targetTimezone) {
      return new Date(timestamp);
    }

    try {
      const sourceOffset = this.getTimezoneOffset(timestamp, sourceTimezone);
      const targetOffset = this.getTimezoneOffset(timestamp, targetTimezone);
      const offsetDifferenceMs = (targetOffset - sourceOffset) * 60 * 1000;
      return new Date(timestamp.getTime() + offsetDifferenceMs);
    } catch (error) {
      throw new Error(`Failed to convert timezone from ${sourceTimezone} to ${targetTimezone}: ${error}`);
    }
  }

  private getTimezoneOffset(date: Date, timezone: string): number {
    try {
      const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
      const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
      const offsetMs = utcDate.getTime() - tzDate.getTime();
      return offsetMs / (60 * 1000);
    } catch (error) {
      const cached = this.timezoneCache.get(timezone);
      if (cached) {
        return cached.offset;
      }
      throw new Error(`Unknown timezone: ${timezone}`);
    }
  }

  detectTimezone(timestamps: Date[]): string {
    if (timestamps.length === 0) return 'UTC';

    const offsets = new Map<number, number>();
    timestamps.forEach(ts => {
      const offset = ts.getTimezoneOffset();
      offsets.set(offset, (offsets.get(offset) || 0) + 1);
    });

    let mostCommonOffset = 0;
    let maxCount = 0;
    offsets.forEach((count, offset) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonOffset = offset;
      }
    });

    return this.offsetToTimezone(mostCommonOffset);
  }

  private offsetToTimezone(offsetMinutes: number): string {
    const standardOffset = -offsetMinutes;
    const offsetMap: Record<number, string> = {
      0: 'UTC',
      60: 'Europe/Paris',
      [-300]: 'America/New_York',
      [-360]: 'America/Chicago',
      [-420]: 'America/Denver',
      [-480]: 'America/Los_Angeles',
      540: 'Asia/Tokyo',
      480: 'Asia/Shanghai',
      600: 'Australia/Sydney'
    };
    return offsetMap[standardOffset] || 'UTC';
  }

  async convertBatch(
    timestamps: Date[],
    sourceTimezone: string,
    targetTimezone: string
  ): Promise<Date[]> {
    return Promise.all(
      timestamps.map(ts => this.convertTimezone(ts, sourceTimezone, targetTimezone))
    );
  }

  getTimezoneInfo(timezone: string, date?: Date): TimezoneInfo {
    const referenceDate = date || new Date();
    try {
      const offset = this.getTimezoneOffset(referenceDate, timezone);
      const isDST = this.isDaylightSavingTime(referenceDate, timezone);
      return {
        name: timezone,
        abbreviation: this.getTimezoneAbbreviation(timezone, isDST),
        offset,
        isDST
      };
    } catch (error) {
      return this.timezoneCache.get(timezone) || {
        name: timezone,
        abbreviation: timezone,
        offset: 0,
        isDST: false
      };
    }
  }

  private isDaylightSavingTime(date: Date, timezone: string): boolean {
    try {
      const winter = new Date(date.getFullYear(), 0, 1);
      const summer = new Date(date.getFullYear(), 6, 1);
      const winterOffset = this.getTimezoneOffset(winter, timezone);
      const currentOffset = this.getTimezoneOffset(date, timezone);
      return currentOffset !== winterOffset;
    } catch (error) {
      return false;
    }
  }

  private getTimezoneAbbreviation(timezone: string, isDST: boolean): string {
    const abbreviationMap: Record<string, { standard: string, dst: string }> = {
      'America/New_York': { standard: 'EST', dst: 'EDT' },
      'America/Chicago': { standard: 'CST', dst: 'CDT' },
      'America/Denver': { standard: 'MST', dst: 'MDT' },
      'America/Los_Angeles': { standard: 'PST', dst: 'PDT' },
      'Europe/London': { standard: 'GMT', dst: 'BST' },
      'Europe/Paris': { standard: 'CET', dst: 'CEST' },
      'Europe/Berlin': { standard: 'CET', dst: 'CEST' },
      'Asia/Tokyo': { standard: 'JST', dst: 'JST' },
      'Asia/Shanghai': { standard: 'CST', dst: 'CST' },
      'Australia/Sydney': { standard: 'AEST', dst: 'AEDT' }
    };

    const abbr = abbreviationMap[timezone];
    if (abbr) {
      return isDST ? abbr.dst : abbr.standard;
    }
    return timezone.split('/').pop() || timezone;
  }

  normalizeToUTC(timestamps: Date[], sourceTimezone?: string): Date[] {
    if (!sourceTimezone || sourceTimezone === 'UTC') {
      return timestamps.map(ts => new Date(ts));
    }

    return timestamps.map(ts => {
      try {
        const offset = this.getTimezoneOffset(ts, sourceTimezone);
        return new Date(ts.getTime() - (offset * 60 * 1000));
      } catch (error) {
        console.warn(`Failed to normalize timestamp ${ts} from ${sourceTimezone}: ${error}`);
        return ts;
      }
    });
  }

  getSupportedTimezones(): string[] {
    return [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Toronto',
      'America/Vancouver',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Rome',
      'Europe/Madrid',
      'Europe/Amsterdam',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Hong_Kong',
      'Asia/Singapore',
      'Asia/Mumbai',
      'Asia/Dubai',
      'Australia/Sydney',
      'Australia/Melbourne',
      'Pacific/Auckland'
    ];
  }

  validateTimezone(timezone: string): boolean {
    try {
      new Date().toLocaleString('en-US', { timeZone: timezone });
      return true;
    } catch (error) {
      return false;
    }
  }

  async findClosestTimezone(targetOffset: number): Promise<string> {
    const supportedTimezones = this.getSupportedTimezones();
    let closestTimezone = 'UTC';
    let smallestDifference = Infinity;
    const referenceDate = new Date();

    for (const timezone of supportedTimezones) {
      try {
        const offset = this.getTimezoneOffset(referenceDate, timezone);
        const difference = Math.abs(offset - targetOffset);
        if (difference < smallestDifference) {
          smallestDifference = difference;
          closestTimezone = timezone;
        }
      } catch (error) {
        continue;
      }
    }
    return closestTimezone;
  }

  formatTimestamp(
    timestamp: Date,
    timezone: string,
    format: 'iso' | 'locale' | 'short' = 'iso'
  ): string {
    try {
      switch (format) {
        case 'iso':
          return timestamp.toLocaleString('sv-SE', {
            timeZone: timezone,
            timeZoneName: 'short'
          });
        case 'locale':
          return timestamp.toLocaleString('en-US', {
            timeZone: timezone,
            timeZoneName: 'short',
            dateStyle: 'medium',
            timeStyle: 'medium'
          });
        case 'short':
          return timestamp.toLocaleString('en-US', {
            timeZone: timezone,
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        default:
          return timestamp.toISOString();
      }
    } catch (error) {
      return timestamp.toISOString();
    }
  }
}