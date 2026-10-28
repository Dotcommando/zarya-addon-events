import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import type { ICursorPage } from '@zarya/addon-contracts/cursor-page';
import type { ClientSession, Connection } from 'mongoose';

import { BookingRequest, type IBookingRequestState } from '../../../../../domain/participation/booking-request.js';
import type { IOperationIdentity, OperationReceipt } from '../../../../../domain/participation/operation-receipt.js';
import { ParticipationPolicy } from '../../../../../domain/participation/participation.policy.js';
import type { IRequestListQuery } from '../../../../../domain/participation/participation-query.js';
import { validateRequestList } from '../../../../../domain/participation/participation-query.policy.js';
import type {
  ICommitParticipationDecision, ICommitParticipationRequest, IParticipationStorePort,
} from '../../../../../ports/outbound/participation/participation-store.port.js';
import type { IAddonWriteFence } from './addon-write-fence.js';
import {
  operationKey, operationReceipt, operationRecord, participationModels, participationRequest,
} from './participation.records.js';
import { sessionModel, sessionState } from './session.records.js';

function queryScope(query: IRequestListQuery): string {
  return createHash('sha256').update(JSON.stringify([query.siteId, query.sessionId, query.state])).digest('hex');
}

function decodeCursor(encoded: string, query: IRequestListQuery): {
  readonly requestedAt: Date;
  readonly requestId: string;
} {
  try {
    if (encoded.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
      throw new Error();
    }

    const value: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));

    if (!value || typeof value !== 'object' || !('scope' in value) || value.scope !== queryScope(query)
      || !('requestedAt' in value) || typeof value.requestedAt !== 'string'
      || !('requestId' in value) || typeof value.requestId !== 'string' || !value.requestId) {
      throw new Error();
    }

    const requestedAt = new Date(value.requestedAt);

    if (!Number.isFinite(requestedAt.getTime()) || requestedAt.toISOString() !== value.requestedAt) {
      throw new Error();
    }

    return { requestedAt, requestId: value.requestId };
  } catch {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid request-list cursor');
  }
}

export class MongooseParticipationStore implements IParticipationStorePort {
  readonly requests;
  readonly operations;
  readonly sessions;

  constructor(private readonly connection: Connection, private readonly fence: IAddonWriteFence) {
    const models = participationModels(connection);

    this.requests = models.requests;
    this.operations = models.operations;
    this.sessions = sessionModel(connection);
  }

  async findRequest(siteId: string, requestId: string): Promise<IBookingRequestState | null> {
    const row = await this.requests.findOne({ siteId, _id: requestId }).lean().exec();

    return row ? participationRequest(row) : null;
  }

  async listRequests(query: IRequestListQuery): Promise<ICursorPage<IBookingRequestState>> {
    validateRequestList(query);
    const after = query.cursor === null ? null : decodeCursor(query.cursor, query);
    const rows = await this.requests.find({
      siteId: query.siteId,
      sessionId: query.sessionId,
      ...(query.state === null ? {} : { state: query.state }),
      ...(after ? {
        $or: [{ requestedAt: { $gt: after.requestedAt } },
          { requestedAt: after.requestedAt, _id: { $gt: after.requestId } }],
      } : {}),
    }).sort({ requestedAt: 1, _id: 1 }).limit(query.limit + 1).lean().exec();
    const items = rows.slice(0, query.limit).map(participationRequest);
    const last = items.at(-1);

    return {
      items,
      nextCursor: rows.length > query.limit && last ? Buffer.from(JSON.stringify({
        scope: queryScope(query), requestedAt: last.requestedAt.toISOString(), requestId: last.requestId,
      })).toString('base64url') : null,
    };
  }

  async findOperationReceipt(identity: IOperationIdentity): Promise<OperationReceipt | null> {
    const key = operationKey(identity);
    const row = await this.operations.findOne({
      _id: key.id,
      siteId: identity.siteId,
      operation: identity.operation,
      actorId: identity.actorId,
      keyDigest: key.keyDigest,
    }).readConcern('majority').lean().exec();

    return row ? operationReceipt(row, identity) : null;
  }

  async commitRequest(change: ICommitParticipationRequest): Promise<void> {
    this.requireCommitScope(change);
    await this.inTransaction(async (transaction) => {
      await this.fence.check(change.addonPermit, transaction);
      await this.operations.create([operationRecord(change.receipt)], { session: transaction });
      const row = await this.sessions.findOne({
        siteId: change.session.siteId,
        _id: change.session.sessionId,
        version: change.expectedSessionVersion,
      }).session(transaction).lean().exec();

      if (!row) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Session changed');
      }

      const request = new BookingRequest(change.request).toState();
      const calculated = ParticipationPolicy.reserve(sessionState(row), request, change.session.version);

      if (!isDeepStrictEqual(calculated, { session: change.session, request: change.request })
        || change.receipt.result.sessionId !== request.sessionId || change.receipt.result.places !== request.places
        || change.receipt.result.requestReference !== request.requestReference
        || change.receipt.result.acceptedAt.getTime() !== request.requestedAt.getTime()) {
        throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent participation commit');
      }

      const updated = await this.sessions.updateOne({
        siteId: row.siteId,
        _id: row._id,
        version: change.expectedSessionVersion,
        $expr: { $gt: ['$startsAt', '$$NOW'] },
      },
      {
        $set: {
          heldPlaces: change.session.heldPlaces,
          version: change.session.version,
        },
      }, { session: transaction }).exec();

      if (updated.matchedCount !== 1) {
        throw new BusinessError(BusinessErrorCode.NotBookable, 'Booking has closed');
      }

      const { requestId, ...fields } = request;

      await this.requests.create([{ ...fields, _id: requestId }], { session: transaction });
    });
  }

  async commitDecision(change: ICommitParticipationDecision): Promise<void> {
    this.requireCommitScope(change);
    await this.inTransaction(async (transaction) => {
      await this.fence.check(change.addonPermit, transaction);
      await this.operations.create([operationRecord(change.receipt)], { session: transaction });
      const row = await this.sessions.findOne({
        siteId: change.session.siteId,
        _id: change.session.sessionId,
        version: change.expectedSessionVersion,
      }).session(transaction).lean().exec();
      const request = await this.requests.findOne({
        siteId: change.request.siteId,
        _id: change.request.requestId,
        version: change.expectedRequestVersion,
      }).session(transaction).lean().exec();

      if (!row || !request) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Participation changed');
      }

      const calculated = ParticipationPolicy.decide(sessionState(row), participationRequest(request),
        change.receipt.result.state,
        {
          actorId: change.receipt.identity.actorId,
          decidedAt: change.receipt.result.decidedAt,
          requestVersion: change.request.version,
          sessionVersion: change.session.version,
        });

      if (!isDeepStrictEqual(calculated, { session: change.session, request: change.request })
        || change.receipt.result.requestId !== change.request.requestId
        || change.receipt.result.requestVersion !== change.request.version
        || change.receipt.result.sessionId !== change.session.sessionId
          || change.receipt.result.places !== change.request.places) {
        throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent decision commit');
      }

      const sessionResult = await this.sessions.updateOne({
        siteId: row.siteId,
        _id: row._id,
        version: change.expectedSessionVersion,
      },
      {
        $set: {
          heldPlaces: change.session.heldPlaces,
          confirmedPlaces: change.session.confirmedPlaces,
          version: change.session.version,
        },
      }, { session: transaction }).exec();
      const requestResult = await this.requests.updateOne({
        siteId: request.siteId,
        _id: request._id,
        version: change.expectedRequestVersion,
      }, {
        $set: {
          state: change.request.state,
          decidedBy: change.request.decidedBy,
          decidedAt: change.request.decidedAt,
          version: change.request.version,
        },
      }, { session: transaction }).exec();

      if (sessionResult.matchedCount !== 1 || requestResult.matchedCount !== 1) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Participation changed');
      }
    });
  }

  private requireCommitScope(change: ICommitParticipationRequest | ICommitParticipationDecision): void {
    if (change.receipt.identity.siteId !== change.session.siteId || change.request.siteId !== change.session.siteId
      || change.request.sessionId !== change.session.sessionId) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign participation commit');
    }
  }

  private async inTransaction(work: (transaction: ClientSession) => Promise<void>): Promise<void> {
    const transaction = await this.connection.startSession();
    let committing = false;

    try {
      transaction.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      await work(transaction);
      committing = true;
      await transaction.commitTransaction();
    } catch (error) {
      if (!committing) {
        await transaction.abortTransaction().catch(() => undefined);

        if (error instanceof Error && 'code' in error && [11000, 112, 244].includes(Number(error.code))) {
          throw new BusinessError(BusinessErrorCode.StaleWrite, 'Concurrent participation operation');
        }
      }
      throw error;
    } finally {
      await transaction.endSession();
    }
  }
}
