import type { ISessionState } from '../../src/domain/participation/session.js';
import type {
  IScheduledOccurrence,
  ISessionPattern,
  ISessionSeriesState,
} from '../../src/domain/participation/session-series.js';
import type { ICreateSessionSeriesInput } from '../../src/ports/inbound/participation/create-session-series.port.js';
import type { ISessionScheduleStorePort } from '../../src/ports/outbound/participation/session-schedule-store.port.js';
import type { ISessionCalendarPort } from '../../src/ports/outbound/participation/session-scheduling.port.js';
import type {
  ISessionScheduleAccessPort, ISessionScheduleValuesPort, ISessionSeriesPagePort,
} from '../../src/ports/outbound/participation/session-scheduling.port.js';

export interface IScheduleFixture {
  series: ISessionSeriesState[];
  sessions: ISessionState[];
  occurrences: IScheduledOccurrence[];
  store: ISessionScheduleStorePort;
  calendar: ISessionCalendarPort;
  values: ISessionScheduleValuesPort;
  pages: ISessionSeriesPagePort;
  access: ISessionScheduleAccessPort;
  setNow(value: Date): void;
}

export function seriesInput(): ICreateSessionSeriesInput {
  const pattern: ISessionPattern = {
    startsOn: '2026-01-03',
    endsOn: null,
    everyWeeks: 1,
    weekdays: [6],
    localTime: '11:00',
    timeZone: 'Europe/Berlin',
    durationMinutes: 60,
  };

  return { siteId: 'site', actorId: 'operator', pageId: 'page', pattern, capacity: 10 };
}

export function scheduleFixture(): IScheduleFixture {
  const series: ISessionSeriesState[] = [];
  const sessions: ISessionState[] = [];
  let sequence = 0;
  let instant = new Date('2026-01-01T00:00:00Z');
  const values = { nextId: () => 'id' + ++sequence, nextVersion: () => 'v' + ++sequence, now: () => instant };
  const occurrences: IScheduledOccurrence[] = [0, 1].map((n) => ({
    occurrenceNumber: n,
    localDate: '2026-01-' + (n === 0 ? '03' : '10'),
    startsAt: new Date(Date.UTC(2026, 0, 3 + n * 7, 10)),
    endsAt: new Date(Date.UTC(2026, 0, 3 + n * 7, 11)),
  }));
  const calendar: ISessionCalendarPort = {
    localDate: () => '2026-01-01',
    horizon: () => '2027-01-01',
    expand: () => structuredClone(occurrences),
    resolve: (_p, date) => ({ startsAt: new Date(date + 'T10:00:00Z'), endsAt: new Date(date + 'T11:00:00Z') }),
  };
  const store: ISessionScheduleStorePort = {
    listSeries: async (siteId) => structuredClone(series.filter((item) => item.siteId === siteId)),
    findOccurrences: async (siteId, seriesId, keys) => structuredClone(sessions.filter((s) => s.siteId === siteId
      && s.seriesId === seriesId
      && keys.some((k) => k.ruleId === s.ruleId && k.occurrenceNumber === s.occurrenceNumber))),
    findSeries: async (siteId, id) =>
      structuredClone(series.find((s) => s.siteId === siteId && s.seriesId === id) ?? null),
    findSessions: async (siteId, id) =>
      structuredClone(sessions.filter((s) => s.siteId === siteId && s.seriesId === id)),
    create: async (state, rows) => {
      series.push(structuredClone(state));
      sessions.push(...structuredClone(rows));
    },
    commit: async (state, expected, writes) => {
      const index = series.findIndex((s) => s.siteId === state.siteId && s.seriesId === state.seriesId);

      if (index < 0 || series[index]?.version !== expected) {
        throw new Error('stale series');
      }

      for (const w of writes) {
        const existing = sessions.find((s) => s.sessionId === w.session.sessionId);

        if (w.expectedVersion !== (existing?.version ?? null)) {
          throw new Error('stale session');
        }
      }
      series[index] = structuredClone(state);

      for (const w of writes) {
        const index = sessions.findIndex((s) => s.sessionId === w.session.sessionId);

        if (index < 0) {
          sessions.push(structuredClone(w.session));
        } else {
          sessions[index] = structuredClone(w.session);
        }
      }
    },
    listDue: async (at, after, limit) => structuredClone(series.filter((s) => s.nextExpansionAt <= at
      && (after === null || s.seriesId > after)).sort((a, b) => a.seriesId.localeCompare(b.seriesId)).slice(0, limit)),
  };

  return {
    series,
    sessions,
    occurrences,
    store,
    calendar,
    values,
    pages: { requirePage: async (): Promise<void> => {} },
    access: { requireEditor: async (): Promise<void> => {} },
    setNow: (value: Date): void => {
      instant = value;
    },
  };
}
