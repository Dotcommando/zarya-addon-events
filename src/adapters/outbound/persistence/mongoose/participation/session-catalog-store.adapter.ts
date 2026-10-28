import { createHash } from 'node:crypto';

import type { IAddonOperationPermit } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import type { ICursorPage } from '@zarya/addon-contracts/cursor-page';
import type { Connection, Model } from 'mongoose';

import { type ISessionState, SessionStatus } from '../../../../../domain/participation/session.js';
import {
  type ISessionCatalogQuery, SessionAvailabilityFilter,
  SessionStatusFilter, SessionTimeFilter, validateSessionQuery,
} from '../../../../../domain/participation/session-catalog.js';
import type { ISessionStorePort } from '../../../../../ports/outbound/participation/session-store.port.js';
import { guardedWrite, type IAddonWriteFence } from './addon-write-fence.js';
import { type ISessionRecord, sessionModel, sessionRecord, sessionState } from './session.records.js';

interface ISessionCursor { readonly startsAt: Date; readonly sessionId: string; }

function scope(query: ISessionCatalogQuery): string {
  return createHash('sha256').update(JSON.stringify({
    siteId: query.siteId,
    pageId: query.pageId,
    rangeStart: query.rangeStart.toISOString(),
    rangeEnd: query.rangeEnd.toISOString(),
    time: query.time,
    status: query.status,
    availability: query.availability,
  })).digest('hex');
}

function cursor(encoded: string, query: ISessionCatalogQuery): ISessionCursor {
  try {
    if (encoded.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
      throw new Error();
    }

    const value: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));

    if (value === null || typeof value !== 'object' || !('scope' in value) || value.scope !== scope(query)
      || !('startsAt' in value) || typeof value.startsAt !== 'string'
      || !('sessionId' in value) || typeof value.sessionId !== 'string' || !value.sessionId) {
      throw new Error();
    }

    const startsAt = new Date(value.startsAt);

    if (!Number.isFinite(startsAt.getTime()) || startsAt.toISOString() !== value.startsAt) {
      throw new Error();
    }

    return { startsAt, sessionId: value.sessionId };
  } catch {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid session cursor');
  }
}

export class MongooseSessionCatalogStore implements ISessionStorePort {
  readonly sessions: Model<ISessionRecord>;

  constructor(private readonly connection: Connection, private readonly fence: IAddonWriteFence) {
    this.sessions = sessionModel(connection);
  }

  async create(state: ISessionState, addonPermit?: IAddonOperationPermit): Promise<void> {
    try {
      await guardedWrite(this.connection, this.fence, addonPermit, async(transaction) => {
        await this.sessions.create([sessionRecord(state)], { session: transaction });
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 11000) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Session identity already exists');
      }
      throw error;
    }
  }

  async find(siteId: string, sessionId: string): Promise<ISessionState | null> {
    const row = await this.sessions.findOne({ _id: sessionId, siteId }).lean().exec();

    return row ? sessionState(row) : null;
  }

  async list(query: ISessionCatalogQuery): Promise<ICursorPage<ISessionState>> {
    validateSessionQuery(query);
    const after = query.cursor === null ? null : cursor(query.cursor, query);
    const rows = await this.sessions.find({
      siteId: query.siteId,
      ...(query.pageId === null ? {} : { pageId: query.pageId }),
      startsAt: { $lt: query.rangeEnd },
      endsAt: { $gt: query.rangeStart },
      ...(query.status === SessionStatusFilter.All ? {} : {
        status: query.status === SessionStatusFilter.Scheduled ? SessionStatus.Scheduled : SessionStatus.Cancelled,
      }),
      $and: [
        ...(query.time === SessionTimeFilter.All ? [] : [{
          startsAt: query.time === SessionTimeFilter.Future
            ? { $gt: query.at } : { $lte: query.at },
        }]),
        ...(after ? [{
          $or: [{ startsAt: { $gt: after.startsAt } },
            { startsAt: after.startsAt, _id: { $gt: after.sessionId } }],
        }] : []),
        {
          $expr: query.availability === SessionAvailabilityFilter.All ? { $literal: true }
            : {
              [query.availability === SessionAvailabilityFilter.Available ? '$gt' : '$eq']:
            [{ $subtract: ['$capacity', { $add: ['$heldPlaces', '$confirmedPlaces'] }] }, 0],
            },
        },
      ],
    }).sort({ startsAt: 1, _id: 1 }).limit(query.limit + 1).lean().exec();
    const items = rows.slice(0, query.limit).map(sessionState);
    const last = items.at(-1);

    return {
      items,
      nextCursor: rows.length > query.limit && last ? Buffer.from(JSON.stringify({
        scope: scope(query), startsAt: last.startsAt.toISOString(), sessionId: last.sessionId,
      })).toString('base64url') : null,
    };
  }

  async cancel(state: ISessionState, expectedVersion: string, addonPermit?: IAddonOperationPermit): Promise<void> {
    const row = sessionRecord(state);

    if (state.status !== SessionStatus.Cancelled || state.version === expectedVersion) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid cancellation write');
    }

    const result = await guardedWrite(this.connection, this.fence, addonPermit, async (transaction) =>
      this.sessions.updateOne(
        { _id: row._id, siteId: state.siteId, version: expectedVersion },
        { $set: { status: state.status, overridden: state.overridden, version: state.version } },
        { session: transaction },
      ).exec());

    if (result.matchedCount !== 1) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Session changed');
    }
  }

  async changePage(siteId: string, sessionId: string, expectedVersion: string, pageId: string,
    nextVersion: string, addonPermit?: IAddonOperationPermit): Promise<void> {
    const result = await guardedWrite(this.connection, this.fence, addonPermit, async (transaction) =>
      this.sessions.updateOne(
        { siteId, _id: sessionId, version: expectedVersion },
        { $set: { pageId, version: nextVersion } },
        { session: transaction },
      ).exec());

    if (result.matchedCount !== 1) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Session changed');
    }
  }
}
