import { Temporal } from '@js-temporal/polyfill';

export enum EventsView { Calendar = 'calendar', Day = 'day', Event = 'event', NewEvent = 'new-event',
  Schedule = 'schedule', Series = 'series', NewSeries = 'new-series', Settings = 'settings' }

export interface IEventsLocation { view: EventsView; month: string; date: string; id: string; }

export interface IPatternForm { startsOn: string;
  endsOn: string;
  localTime: string;
  weekdays: number[];
  everyWeeks: number;
  durationMinutes: number; }

export interface IUtcPattern extends Omit<IPatternForm, 'endsOn'> { endsOn: string | null; timeZone: string; }

export function parseLocation(query: string, today: string): IEventsLocation {
  const params = new URLSearchParams(query);
  const result = { view: EventsView.Calendar, month: today.slice(0, 7), date: today, id: '' };

  try {
    const month = params.get('month');
    const date = params.get('date');
    const view = Object.values(EventsView).find((item) => item === params.get('view')) ?? EventsView.Calendar;

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      result.month = Temporal.PlainYearMonth.from(month, { overflow: 'reject' }).toString();
    }
    if (date) {
      result.date = Temporal.PlainDate.from(date, { overflow: 'reject' }).toString();
    }
    result.view = view;
    const id = params.get('id') ?? '';

    if (id && !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
      throw new Error('Invalid identity');
    }
    result.id = id;

    if ([EventsView.Event, EventsView.Series].includes(view) && !id) {
      result.view = EventsView.Calendar;
    }

    return result;
  } catch {
    return { view: EventsView.Calendar, month: today.slice(0, 7), date: today, id: '' };
  }
}

export function calendarDays(month: string): string[] {
  const first = Temporal.PlainYearMonth.from(month).toPlainDate({ day: 1 });
  const start = first.subtract({ days: first.dayOfWeek - 1 });
  const length = Math.ceil((first.dayOfWeek - 1 + first.daysInMonth) / 7) * 7;

  return Array.from({ length }, (_, index) => start.add({ days: index }).toString());
}

export function monthRange(month: string, zone: string): { rangeStart: string; rangeEnd: string } {
  const start = Temporal.PlainYearMonth.from(month).toPlainDate({ day: 1 });

  return {
    rangeStart: start.toZonedDateTime(zone).toInstant().toString(),
    rangeEnd: start.add({ months: 1 }).toZonedDateTime(zone).toInstant().toString(),
  };
}

export function localDate(instant: string, zone: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(zone).toPlainDate().toString();
}

export function localInput(instant: string, zone: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(zone).toPlainDateTime()
    .toString({ smallestUnit: 'minute' });
}

export function utcInstant(local: string, zone: string): Temporal.Instant {
  return Temporal.PlainDateTime.from(local).toZonedDateTime(zone, { disambiguation: 'later' }).toInstant();
}

function shiftedWeekdays(days: readonly number[], shift: number): number[] {
  return days.map((day) => ((day - 1 + shift + 7) % 7) + 1).sort((a, b) => a - b);
}

export function toUtcPattern(form: IPatternForm, zone: string): IUtcPattern {
  const local = Temporal.PlainDate.from(form.startsOn);
  const utc = utcInstant(form.startsOn + 'T' + form.localTime, zone).toZonedDateTimeISO('UTC');
  const shift = local.until(utc.toPlainDate()).days;

  return {
    startsOn: utc.toPlainDate().toString(),
    endsOn: form.endsOn ? Temporal.PlainDate.from(form.endsOn).add({ days: shift }).toString() : null,
    localTime: utc.toPlainTime().toString({ smallestUnit: 'minute' }),
    weekdays: shiftedWeekdays(form.weekdays, shift),
    everyWeeks: form.everyWeeks,
    durationMinutes: form.durationMinutes,
    timeZone: 'UTC',
  };
}

export function displayPattern(pattern: IUtcPattern, zone: string): IPatternForm {
  const from = Temporal.PlainDate.from(pattern.startsOn);
  const instant = utcInstant(pattern.startsOn + 'T' + pattern.localTime, pattern.timeZone);
  const local = instant.toZonedDateTimeISO(zone);
  const shift = from.until(local.toPlainDate()).days;

  return {
    startsOn: local.toPlainDate().toString(),
    endsOn: pattern.endsOn ? Temporal.PlainDate.from(pattern.endsOn).add({ days: shift }).toString() : '',
    localTime: local.toPlainTime().toString({ smallestUnit: 'minute' }),
    weekdays: shiftedWeekdays(pattern.weekdays, shift),
    everyWeeks: pattern.everyWeeks,
    durationMinutes: pattern.durationMinutes,
  };
}
