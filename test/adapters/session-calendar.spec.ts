import {
  TemporalSessionCalendarAdapter,
} from '../../src/adapters/outbound/scheduling/temporal/participation/session-calendar.adapter.js';
import { seriesInput } from '../support/scheduling.js';

describe('IANA recurrence and seasonal clock transitions', () => {
  const calendar = new TemporalSessionCalendarAdapter();

  it('shifts missing times forward and chooses the later repeated time', () => {
    const pattern = { ...seriesInput().pattern, localTime: '02:30' };

    expect(calendar.resolve(pattern, '2026-03-29').startsAt.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(calendar.resolve(pattern, '2026-10-25').startsAt.toISOString()).toBe('2026-10-25T01:30:00.000Z');
  });
  it('preserves wall-clock time and stable occurrence numbers across generation windows', () => {
    const pattern = { ...seriesInput().pattern, startsOn: '2026-03-01', weekdays: [7], everyWeeks: 2 };
    const all = calendar.expand(pattern, '2026-03-01', '2026-05-01');
    const part = calendar.expand(pattern, '2026-04-01', '2026-05-01');

    expect(part).toEqual(all.filter((o) => o.localDate >= '2026-04-01'));
    expect(all.map((o) => o.localDate)).toEqual(['2026-03-01', '2026-03-15', '2026-03-29', '2026-04-12', '2026-04-26']);
    expect(all[0]?.startsAt.getUTCHours()).toBe(10);
    expect(part[0]?.startsAt.getUTCHours()).toBe(9);
  });
  it('validates real calendar dates and bounds generation to a year', () => {
    expect(() => calendar.expand({ ...seriesInput().pattern, startsOn: '2026-02-30' },
      '2026-01-01', '2027-01-01')).toThrow();
    expect(calendar.horizon(new Date('2028-02-29T12:00:00Z'), 'UTC')).toBe('2029-02-28');
  });
});
