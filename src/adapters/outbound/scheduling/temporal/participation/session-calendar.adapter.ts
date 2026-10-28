import { Temporal } from '@js-temporal/polyfill';

import {
  type IScheduledOccurrence,
  type ISessionPattern,
  validateSessionPattern,
} from '../../../../../domain/participation/session-series.js';
import type { ISessionCalendarPort } from '../../../../../ports/outbound/participation/session-scheduling.port.js';

export class TemporalSessionCalendarAdapter implements ISessionCalendarPort {
  localDate(at: Date, timeZone: string): string {
    return Temporal.Instant.fromEpochMilliseconds(at.getTime()).toZonedDateTimeISO(timeZone).toPlainDate().toString();
  }

  horizon(at: Date, timeZone: string): string {
    return Temporal.PlainDate.from(this.localDate(at, timeZone)).add({ years: 1 }).toString();
  }

  resolve(pattern: ISessionPattern, date: string): { startsAt: Date; endsAt: Date } {
    validateSessionPattern(pattern);
    const day = Temporal.PlainDate.from(date, { overflow: 'reject' });
    const time = Temporal.PlainTime.from(pattern.localTime);
    const zoned = day.toPlainDateTime(time).toZonedDateTime(pattern.timeZone, { disambiguation: 'later' });
    const startsAt = new Date(zoned.epochMilliseconds);

    return { startsAt, endsAt: new Date(startsAt.getTime() + pattern.durationMinutes * 60_000) };
  }

  expand(pattern: ISessionPattern, fromDate: string, untilDate: string): readonly IScheduledOccurrence[] {
    validateSessionPattern(pattern);
    const start = Temporal.PlainDate.from(pattern.startsOn, { overflow: 'reject' });
    const from = Temporal.PlainDate.from(fromDate, { overflow: 'reject' });
    const until = Temporal.PlainDate.from(untilDate, { overflow: 'reject' });
    const end = pattern.endsOn === null ? null : Temporal.PlainDate.from(pattern.endsOn, { overflow: 'reject' });

    if (Temporal.PlainDate.compare(until, from.add({ years: 1, days: 1 })) > 0) {
      throw new RangeError('Calendar generation window exceeds one year');
    }

    const anchor = start.subtract({ days: start.dayOfWeek - 1 });
    const weekdays = [...pattern.weekdays].sort((a, b) => a - b);
    const firstDays = weekdays.filter((day) => day >= start.dayOfWeek);
    const result: IScheduledOccurrence[] = [];
    let day = Temporal.PlainDate.compare(start, from) > 0 ? start : from;

    while (Temporal.PlainDate.compare(day, until) < 0 && (!end || Temporal.PlainDate.compare(day, end) <= 0)) {
      const week = Math.floor(anchor.until(day).days / 7);

      if (week % pattern.everyWeeks === 0 && weekdays.includes(day.dayOfWeek)) {
        const occurrenceNumber = week === 0 ? firstDays.indexOf(day.dayOfWeek)
          : firstDays.length + (week / pattern.everyWeeks - 1) * weekdays.length + weekdays.indexOf(day.dayOfWeek);

        result.push({ occurrenceNumber, localDate: day.toString(), ...this.resolve(pattern, day.toString()) });
      }
      day = day.add({ days: 1 });
    }

    return result;
  }
}
