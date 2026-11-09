import { AddonOperationAccess, type IAddonObject } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import {
  CmsExtensionOperationKind, type ICmsAddonExtension, type ICmsExtensionContext,
} from '@zarya/addon-contracts/cms-extensions';

import type { IBookableSession } from '../../../domain/participation/participation-query.js';
import {
  type ISessionFilters, SessionAvailabilityFilter, SessionStatusFilter, SessionTimeFilter,
} from '../../../domain/participation/session-catalog.js';
import { SESSION_PAGE_BATCH_LIMIT } from '../../../domain/participation/session-page-batch.js';
import type { IListBookableSessions } from '../../../ports/inbound/participation/list-bookable-sessions.port.js';
import type {
  IListBookableSessionsForPages,
} from '../../../ports/inbound/participation/list-bookable-sessions-for-pages.port.js';

function invalid(): never {
  throw new BusinessError(BusinessErrorCode.Validation, 'Invalid sessions query');
}

function instant(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return invalid();
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date : invalid();
}

function choice<T extends string>(value: unknown, values: readonly T[]): T {
  return values.find(item => item === value) ?? invalid();
}

function filters(value: unknown): ISessionFilters {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).some(key => !['time', 'status', 'availability'].includes(key))
  ) {
    return invalid();
  }

  const row = Object.fromEntries(Object.entries(value));

  return {
    ...(row.time !== undefined ? { time: choice(row.time, Object.values(SessionTimeFilter)) } : {}),
    ...(row.status !== undefined ? { status: choice(row.status, Object.values(SessionStatusFilter)) } : {}),
    ...(row.availability !== undefined
      ? { availability: choice(row.availability, Object.values(SessionAvailabilityFilter)) } : {}),
  };
}

function publicData(item: IBookableSession): IAddonObject {
  return {
    sessionId: item.sessionId,
    pageId: item.pageId,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt.toISOString(),
    timeZone: item.timeZone,
    availablePlaces: item.availablePlaces,
    status: item.status,
    bookable: item.bookable,
  };
}

function batchOperation(batch: IListBookableSessionsForPages): ICmsAddonExtension['objects'][string][string] {
  return {
    kind: CmsExtensionOperationKind.Query,
    access: AddonOperationAccess.PublicEnabled,
    execute: async (input: IAddonObject, context: ICmsExtensionContext) => {
      const ids = input.pageIds;
      const limit = input.limitPerPage;

      if (
        Object.keys(input).some((key) =>
          !['pageIds', 'rangeStart', 'rangeEnd', 'limitPerPage', 'cursors', 'filter'].includes(key))
        || !Array.isArray(ids)
        || ids.length > SESSION_PAGE_BATCH_LIMIT
        || ids.some((id) => typeof id !== 'string' || !id.trim())
        || new Set(ids).size !== ids.length
        || limit !== undefined
        && (typeof limit !== 'number'
        || !Number.isSafeInteger(limit)
          || limit < 1
        || limit > 100)
      ) {
        return invalid();
      }

      const pageIds = ids.map((id) => typeof id === 'string' ? id : invalid());
      let cursors: Record<string, string | null> | undefined;

      if (input.cursors !== undefined) {
        if (!input.cursors || typeof input.cursors !== 'object' || Array.isArray(input.cursors)) {
          return invalid();
        }
        cursors = Object.fromEntries(Object.entries(input.cursors).map(([id, cursor]) => {
          if (!pageIds.includes(id) || cursor !== null && (typeof cursor !== 'string' || cursor.length > 2048)) {
            return invalid();
          }

          return [id, cursor];
        }));
      }

      const result = await batch.execute({
        siteId: context.siteId,
        pageIds,
        rangeStart: instant(input.rangeStart),
        rangeEnd: instant(input.rangeEnd),
        ...(typeof limit === 'number' ? { limitPerPage: limit } : {}),
        ...(cursors === undefined ? {} : { cursors }),
        ...(input.filter === undefined ? {} : { filter: filters(input.filter) }),
      });

      return {
        pages: result.pages.map((group) => ({
          pageId: group.pageId, items: group.items.map(publicData), nextCursor: group.nextCursor,
        })),
      };
    },
  };
}

/** The same public query as REST; host context supplies site identity. */
export function eventsCmsExtension(list: IListBookableSessions,
  batch?: IListBookableSessionsForPages): ICmsAddonExtension {
  return {
    version: 1,
    objects: {
      sessions: {
        ...(batch ? { listForPages: batchOperation(batch) } : {}),
        list: {
          kind: CmsExtensionOperationKind.Query,
          access: AddonOperationAccess.PublicEnabled,
          execute: async (input: IAddonObject, context) => {
            const cursor = input.cursor;
            const limit = input.limit;

            if (
              Object.keys(input).some(key =>
                !['pageId', 'rangeStart', 'rangeEnd', 'cursor', 'limit', 'filter'].includes(key))
              || typeof input.pageId !== 'string'
              || !input.pageId
              || input.cursor !== undefined
              && input.cursor !== null
              && typeof input.cursor !== 'string'
              || input.limit !== undefined
              && (typeof input.limit !== 'number'
              || !Number.isSafeInteger(input.limit))
            ) {
              return invalid();
            }

            const result = await list.execute({
              siteId: context.siteId,
              pageId: input.pageId,
              rangeStart: instant(input.rangeStart),
              rangeEnd: instant(input.rangeEnd),
              ...(cursor === null || typeof cursor === 'string' ? { cursor } : {}),
              ...(typeof limit === 'number' ? { limit } : {}),
              ...(input.filter !== undefined ? { filter: filters(input.filter) } : {}),
            });

            return {
              items: result.items.map(publicData),
              nextCursor: result.nextCursor,
            };
          },
        },
      },
    },
  };
}
