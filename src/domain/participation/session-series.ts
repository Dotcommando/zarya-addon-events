import {
  requireCondition, requireInstant, requireInteger, requireText, requireTimeZone,
} from '@zarya/addon-contracts/validation';

import type { ISessionState } from './session.js';

export interface ISessionPattern {
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly everyWeeks: number;
  readonly weekdays: readonly number[];
  readonly localTime: string;
  readonly timeZone: string;
  readonly durationMinutes: number;
}

export interface ISessionRule {
  readonly ruleId: string;
  readonly pattern: ISessionPattern;
  readonly capacity: number;
  readonly count: number | null;
}

export interface ISessionSeriesState {
  readonly seriesId: string;
  readonly siteId: string;
  readonly pageId: string;
  readonly rules: readonly ISessionRule[];
  readonly generatedThrough: string;
  readonly nextExpansionAt: Date;
  readonly version: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IScheduledOccurrence {
  readonly occurrenceNumber: number;
  readonly localDate: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface ISessionWrite {
  readonly session: ISessionState;
  readonly expectedVersion: string | null;
}

export interface ISessionSeriesResult {
  readonly series: ISessionSeriesState;
  readonly generatedCount: number;
}

export enum SessionEditScope {
  Occurrence = 'Occurrence',
  Following = 'Following',
  Series = 'Series',
}

export function validateSessionPattern(pattern: ISessionPattern): void {
  requireCondition(isCalendarDate(pattern.startsOn), 'Invalid start date');
  requireCondition(pattern.endsOn === null || isCalendarDate(pattern.endsOn)
    && pattern.endsOn >= pattern.startsOn, 'Invalid end date');
  requireCondition(/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(pattern.localTime), 'Invalid local time');
  requireTimeZone(pattern.timeZone);
  requireInteger(pattern.everyWeeks, 1, 'everyWeeks');
  requireInteger(pattern.durationMinutes, 1, 'durationMinutes');
  requireCondition(pattern.weekdays.length > 0 && pattern.weekdays.length <= 7
    && new Set(pattern.weekdays).size === pattern.weekdays.length, 'Invalid weekdays');

  for (const weekday of pattern.weekdays) {
    requireInteger(weekday, 1, 'weekday');
    requireCondition(weekday <= 7, 'Invalid weekday');
  }
}

export function validateSeries(state: ISessionSeriesState): void {
  for (const value of [state.seriesId, state.siteId, state.pageId, state.version]) {
    requireText(value, 'Series identity');
  }
  requireCondition(state.rules.length > 0, 'Missing series rules');
  requireInstant(state.createdAt, 'createdAt');
  requireInstant(state.updatedAt, 'updatedAt');
  requireInstant(state.nextExpansionAt, 'nextExpansionAt');
  requireCondition(state.updatedAt >= state.createdAt, 'Series update predates creation');
  requireCondition(isCalendarDate(state.generatedThrough), 'Invalid generation horizon');
  requireCondition(new Set(state.rules.map((r) => r.ruleId)).size === state.rules.length, 'Duplicate rule');

  for (const rule of state.rules) {
    requireText(rule.ruleId, 'ruleId');
    validateSessionPattern(rule.pattern);
    requireInteger(rule.capacity, 1, 'capacity');

    if (rule.count !== null) {
      requireInteger(rule.count, 0, 'rule count');
    }
  }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(value + 'T00:00:00.000Z');

  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
