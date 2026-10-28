import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import type { ICursorInput, ICursorPage } from '@zarya/addon-contracts/cursor-page';
import { requireCondition, requireInstant, requireText } from '@zarya/addon-contracts/validation';

import type { IAdminSession, IBookableSession } from './participation-query.js';
import { type ISessionState, Session, SessionStatus } from './session.js';

export enum SessionTimeFilter { Future = 'Future', Past = 'Past', All = 'All' }

export enum SessionStatusFilter { Scheduled = 'Scheduled', Cancelled = 'Cancelled', All = 'All' }

export enum SessionAvailabilityFilter { All = 'All', Available = 'Available', Full = 'Full' }

export interface ISessionFilters {
  readonly time?: SessionTimeFilter;
  readonly status?: SessionStatusFilter;
  readonly availability?: SessionAvailabilityFilter;
}

export interface ISessionCatalogQuery extends ICursorInput {
  readonly siteId: string;
  readonly pageId: string | null;
  readonly rangeStart: Date;
  readonly rangeEnd: Date;
  readonly time: SessionTimeFilter;
  readonly status: SessionStatusFilter;
  readonly availability: SessionAvailabilityFilter;
  readonly at: Date;
}

export function validateSessionQuery(query: ISessionCatalogQuery): void {
  requireText(query.siteId, 'siteId');

  if (query.pageId !== null) {
    requireText(query.pageId, 'pageId');
  }
  requireInstant(query.rangeStart, 'rangeStart');
  requireInstant(query.rangeEnd, 'rangeEnd');
  requireInstant(query.at, 'at');
  requireCondition(query.rangeEnd > query.rangeStart, 'Invalid calendar interval');
  requireCondition(Number.isSafeInteger(query.limit) && query.limit >= 1 && query.limit <= 100,
    'Invalid session limit');
  requireCondition(Object.values(SessionTimeFilter).includes(query.time), 'Invalid session time filter');
  requireCondition(Object.values(SessionStatusFilter).includes(query.status), 'Invalid session status filter');
  requireCondition(Object.values(SessionAvailabilityFilter).includes(query.availability),
    'Invalid availability filter');
}

export function requireOwnedSession(state: ISessionState, siteId: string, sessionId?: string): Session {
  if (state.siteId !== siteId || sessionId !== undefined && state.sessionId !== sessionId) {
    throw new BusinessError(BusinessErrorCode.Scope, 'Foreign session');
  }

  return new Session(state);
}

export function matchesSessionQuery(state: ISessionState, query: ISessionCatalogQuery): boolean {
  const session = requireOwnedSession(state, query.siteId);

  return (query.pageId === null || state.pageId === query.pageId) && session.overlaps(query.rangeStart, query.rangeEnd)
    && (query.time === SessionTimeFilter.All
      || (state.startsAt > query.at) === (query.time === SessionTimeFilter.Future))
    && (query.status === SessionStatusFilter.All || state.status === (query.status === SessionStatusFilter.Scheduled
      ? SessionStatus.Scheduled : SessionStatus.Cancelled))
    && (query.availability === SessionAvailabilityFilter.All
      || (session.availablePlaces > 0) === (query.availability === SessionAvailabilityFilter.Available));
}

export function publicSession(state: ISessionState, at: Date): IBookableSession {
  const session = new Session(state);

  return {
    sessionId: state.sessionId,
    pageId: state.pageId,
    startsAt: state.startsAt,
    endsAt: state.endsAt,
    timeZone: state.timeZone,
    availablePlaces: session.availablePlaces,
    status: state.status,
    bookable: state.status === SessionStatus.Scheduled && state.startsAt > at && session.availablePlaces > 0,
  };
}

export function adminSession(state: ISessionState, at: Date): IAdminSession {
  return {
    ...publicSession(state, at),
    capacity: state.capacity,
    heldPlaces: state.heldPlaces,
    confirmedPlaces: state.confirmedPlaces,
    version: state.version,
    seriesId: state.seriesId,
  };
}

export function validateSessionPage(page: ICursorPage<ISessionState>, query: ISessionCatalogQuery): void {
  if (page.items.length > query.limit) {
    throw new BusinessError(BusinessErrorCode.Scope, 'Session page exceeds its limit');
  }

  let previous: ISessionState | undefined;

  for (const item of page.items) {
    if (!matchesSessionQuery(item, query) || previous && (previous.startsAt > item.startsAt
      || previous.startsAt.getTime() === item.startsAt.getTime() && previous.sessionId >= item.sessionId)) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent session page');
    }
    previous = item;
  }
}
