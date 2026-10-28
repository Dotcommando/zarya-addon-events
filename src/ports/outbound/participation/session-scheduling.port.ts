import type { IScheduledOccurrence, ISessionPattern } from '../../../domain/participation/session-series.js';

export interface ISessionCalendarPort {
  localDate(at: Date, timeZone: string): string;
  horizon(at: Date, timeZone: string): string;
  expand(pattern: ISessionPattern, fromDate: string, untilDate: string): readonly IScheduledOccurrence[];
  resolve(pattern: ISessionPattern, date: string): { readonly startsAt: Date; readonly endsAt: Date };
}

export interface ISessionSeriesPagePort {
  requirePage(siteId: string, pageId: string): Promise<void>;
}

export interface ISessionScheduleValuesPort {
  nextId(): string;
  nextVersion(): string;
  now(): Date;
}

export interface ISessionScheduleAccessPort {
  requireEditor(siteId: string, actorId: string): Promise<void>;
}
