import { calendarDays, displayPattern, monthRange, parseLocation, toUtcPattern } from '../../admin/src/calendar.js';

describe('site calendar and UTC schedules', () => {
  it('builds complete Monday-first month weeks and validates deep links', () => {
    const days = calendarDays('2026-10');

    expect(days).toHaveLength(35);
    expect(days[0]).toBe('2026-09-28');
    expect(days.at(-1)).toBe('2026-11-01');
    expect(calendarDays('2026-03')).toHaveLength(42);
    expect(parseLocation('?view=day&date=2026-02-30&month=evil', '2026-10-28').view).toBe('calendar');
    expect(parseLocation('?view=event&id=event-1&date=2026-10-28&month=2026-10', '2026-10-28'))
      .toMatchObject({ view: 'event', id: 'event-1', date: '2026-10-28', month: '2026-10' });
  });
  it('queries exact site-local month boundaries across seasonal changes', () => {
    expect(monthRange('2026-10', 'Asia/Nicosia')).toEqual({
      rangeStart: '2026-09-30T21:00:00Z', rangeEnd: '2026-10-31T22:00:00Z',
    });
  });
  it('converts local entry to a fixed UTC rule, including weekdays crossing midnight', () => {
    const input = {
      startsOn: '2026-10-28',
      endsOn: '',
      localTime: '01:30',
      weekdays: [3, 5],
      everyWeeks: 1,
      durationMinutes: 60,
    };
    const rule = toUtcPattern(input, 'Asia/Nicosia');

    expect(rule).toMatchObject({ startsOn: '2026-10-27', localTime: '23:30', weekdays: [2, 4], timeZone: 'UTC' });
    expect(displayPattern(rule, 'Asia/Nicosia')).toMatchObject({ ...input, endsOn: '' });
    expect(displayPattern(rule, 'UTC').localTime).toBe('23:30');
    expect(rule.localTime).toBe('23:30');
  });
});
