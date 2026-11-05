import { AddonOperationAccess, type IAddonObject } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { CmsExtensionOperationKind, type ICmsAddonExtension } from '@zarya/addon-contracts/cms-extensions';

import {
  type ISessionFilters, SessionAvailabilityFilter, SessionStatusFilter, SessionTimeFilter,
} from '../../../domain/participation/session-catalog.js';
import type { IListBookableSessions } from '../../../ports/inbound/participation/list-bookable-sessions.port.js';

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
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['time', 'status', 'availability'].includes(key))) {
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

/** The same public query as REST; host context supplies site identity. */
export function eventsCmsExtension(list: IListBookableSessions): ICmsAddonExtension {
  return {
    version: 1,
    objects: {
      sessions: {
        list: {
          kind: CmsExtensionOperationKind.Query,
          access: AddonOperationAccess.PublicEnabled,
          execute: async (input: IAddonObject, context) => {
            const cursor = input.cursor;
            const limit = input.limit;

            if (Object.keys(input).some(key =>
              !['pageId', 'rangeStart', 'rangeEnd', 'cursor', 'limit', 'filter'].includes(key))
              || typeof input.pageId !== 'string' || !input.pageId
              || input.cursor !== undefined && input.cursor !== null && typeof input.cursor !== 'string'
              || input.limit !== undefined && (typeof input.limit !== 'number' || !Number.isSafeInteger(input.limit))) {
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
              items: result.items.map(item => ({
                sessionId: item.sessionId,
                pageId: item.pageId,
                startsAt: item.startsAt.toISOString(),
                endsAt: item.endsAt.toISOString(),
                timeZone: item.timeZone,
                availablePlaces: item.availablePlaces,
                status: item.status,
                bookable: item.bookable,
              })),
              nextCursor: result.nextCursor,
            };
          },
        },
      },
    },
  };
}
