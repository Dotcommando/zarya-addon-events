import { vi } from 'vitest';

import { type ISessionState, Session, SessionStatus } from '../../src/domain/participation/session.js';
import { matchesSessionQuery } from '../../src/domain/participation/session-catalog.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { IPublicSessionPagePort } from '../../src/ports/outbound/participation/public-session-page.port.js';
import type { ISessionCatalogAccessPort } from '../../src/ports/outbound/participation/session-catalog-access.port.js';
import type {
  ISessionScheduleValuesPort, ISessionSeriesPagePort,
} from '../../src/ports/outbound/participation/session-scheduling.port.js';
import type { ISessionStorePort } from '../../src/ports/outbound/participation/session-store.port.js';

export function sessionState(id = 'session-1'): ISessionState {
  return {
    sessionId: id,
    siteId: 'site-1',
    pageId: 'page-1',
    seriesId: null,
    ruleId: null,
    occurrenceNumber: null,
    status: SessionStatus.Scheduled,
    overridden: false,
    startsAt: new Date('2026-11-01T10:00:00Z'),
    endsAt: new Date('2026-11-01T11:00:00Z'),
    timeZone: 'Europe/Paris',
    capacity: 10,
    heldPlaces: 2,
    confirmedPlaces: 3,
    version: id + '-v1',
  };
}

interface ISessionFixture {
  readonly states: Map<string, ISessionState>;
  readonly store: ISessionStorePort;
  readonly access: ISessionCatalogAccessPort;
  readonly pages: ISessionSeriesPagePort;
  readonly publicPages: IPublicSessionPagePort;
  readonly values: ISessionScheduleValuesPort;
}

export function sessionFixture(): ISessionFixture {
  const states = new Map<string, ISessionState>();
  let sequence = 0;
  const store: ISessionStorePort = {
    create: vi.fn(async (state) => {
      states.set(state.sessionId, structuredClone(state));
    }),
    find: vi.fn(async (siteId, id) => {
      const state = states.get(id);

      return state && state.siteId === siteId ? structuredClone(state) : null;
    }),
    list: vi.fn(async (query) => {
      const rows = [...states.values()].filter((s) => s.siteId === query.siteId && matchesSessionQuery(s, query))
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.sessionId.localeCompare(b.sessionId))
        .filter((s) => query.cursor === null || s.sessionId > query.cursor);
      const items = rows.slice(0, query.limit).map((s) => structuredClone(s));

      return { items, nextCursor: rows.length > query.limit ? items.at(-1)?.sessionId ?? null : null };
    }),
    cancel: vi.fn(async (state, expectedVersion) => {
      if (states.get(state.sessionId)?.version !== expectedVersion) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Session changed');
      }
      states.set(state.sessionId, new Session(state).toState());
    }),
    changePage: vi.fn(async (siteId, id, expectedVersion, pageId, version) => {
      const state = states.get(id);

      if (!state || state.siteId !== siteId || state.version !== expectedVersion) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Session changed');
      }
      states.set(id, { ...state, pageId, version });
    }),
  };

  return {
    states,
    store,
    access: {
      requireAdministrator: vi.fn(async (siteId, actorId) => {
        if (!siteId || actorId !== 'operator') {
          throw new BusinessError(BusinessErrorCode.Forbidden, 'Untrusted actor');
        }
      }),
    },
    pages: {
      requirePage: vi.fn(async (siteId, pageId) => {
        if (siteId !== 'site-1' || pageId !== 'page-1') {
          throw new BusinessError(BusinessErrorCode.NotFound, 'Page not found');
        }
      }),
    },
    publicPages: { isPublished: vi.fn(async (siteId, pageId) => siteId === 'site-1' && pageId === 'page-1') },
    values: {
      now: () => new Date('2026-10-25T11:00:00Z'),
      nextId: () => 'session-' + ++sequence,
      nextVersion: () => 'version-' + ++sequence,
    },
  };
}

export const oneOffInput = {
  actorId: 'operator',
  siteId: 'site-1',
  pageId: 'page-1',
  startsAt: new Date('2026-11-01T10:00:00Z'),
  endsAt: new Date('2026-11-01T11:00:00Z'),
  timeZone: 'Europe/Paris',
  capacity: 10,
};
