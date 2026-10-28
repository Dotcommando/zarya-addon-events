import { type ISessionState, Session, SessionStatus } from '../../../domain/participation/session.js';
import type { ISessionRule, ISessionSeriesState } from '../../../domain/participation/session-series.js';
import type {
  ISessionCalendarPort,
  ISessionScheduleValuesPort,
} from '../../../ports/outbound/participation/session-scheduling.port.js';

export class SessionGenerationService {
  constructor(private readonly calendar: ISessionCalendarPort, private readonly values: ISessionScheduleValuesPort) {}

  generate(series: ISessionSeriesState, existing: readonly ISessionState[], at: Date): ISessionState[] {
    const created: ISessionState[] = [];

    for (const rule of series.rules) {
      const from = this.calendar.localDate(at, rule.pattern.timeZone);
      const until = this.calendar.horizon(at, rule.pattern.timeZone);

      for (const occurrence of this.calendar.expand(rule.pattern, from, until)) {
        if (occurrence.startsAt <= at || rule.count !== null && occurrence.occurrenceNumber >= rule.count) {
          continue;
        }
        if (existing.some((s) => s.ruleId === rule.ruleId && s.occurrenceNumber === occurrence.occurrenceNumber)) {
          continue;
        }
        created.push(this.makeSession(series, rule, occurrence.occurrenceNumber,
          occurrence.startsAt, occurrence.endsAt));
      }
    }

    return created;
  }

  makeSession(series: ISessionSeriesState, rule: ISessionRule, occurrenceNumber: number,
    startsAt: Date, endsAt: Date): ISessionState {
    return new Session({
      sessionId: this.values.nextId(),
      siteId: series.siteId,
      pageId: series.pageId,
      seriesId: series.seriesId,
      ruleId: rule.ruleId,
      occurrenceNumber,
      startsAt,
      endsAt,
      timeZone: rule.pattern.timeZone,
      capacity: rule.capacity,
      heldPlaces: 0,
      confirmedPlaces: 0,
      status: SessionStatus.Scheduled,
      overridden: false,
      version: this.values.nextVersion(),
    }).toState();
  }
}
