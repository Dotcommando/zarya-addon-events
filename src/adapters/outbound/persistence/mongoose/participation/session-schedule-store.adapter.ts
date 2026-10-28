import type { IAddonOperationPermit } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { type Connection, type Model, Schema } from 'mongoose';

import { type ISessionState, Session } from '../../../../../domain/participation/session.js';
import {
  type ISessionSeriesState,
  type ISessionWrite,
  validateSeries,
} from '../../../../../domain/participation/session-series.js';
import type {
  ISessionScheduleStorePort,
} from '../../../../../ports/outbound/participation/session-schedule-store.port.js';
import { guardedWrite, type IAddonWriteFence } from './addon-write-fence.js';
import { removedSessionModel, sessionState } from './session.records.js';
import { type ISessionRecord, sessionModel } from './session.records.js';

interface ISeriesRecord extends Omit<ISessionSeriesState, 'seriesId'> { readonly _id: string; }

const pattern = new Schema({
  startsOn: String,
  endsOn: { type: String, default: null },
  everyWeeks: Number,
  weekdays: [Number],
  localTime: String,
  timeZone: String,
  durationMinutes: Number,
}, { _id: false });

const rule = new Schema({
  ruleId: String,
  pattern,
  capacity: Number,
  count: { type: Number, default: null },
}, { _id: false });

const seriesSchema = new Schema<ISeriesRecord>({
  _id: { type: String, required: true },
  siteId: String,
  pageId: String,
  rules: [rule],
  generatedThrough: String,
  nextExpansionAt: Date,
  version: String,
  createdAt: Date,
  updatedAt: Date,
}, { collection: 'session_series', versionKey: false, autoCreate: false, autoIndex: false, strict: 'throw' });

export class MongooseSessionScheduleStore implements ISessionScheduleStorePort {
  readonly series: Model<ISeriesRecord>;
  readonly sessions: Model<ISessionRecord>;

  constructor(private readonly connection: Connection, private readonly fence: IAddonWriteFence) {
    this.series = connection.model<ISeriesRecord>('SessionSeries', seriesSchema);
    this.sessions = sessionModel(connection);
  }

  async findSeries(siteId: string, seriesId: string): Promise<ISessionSeriesState | null> {
    const record = await this.series.findOne({ _id: seriesId, siteId }).lean().exec();

    if (!record) {
      return null;
    }

    const { _id, ...state } = record;
    const result = { ...state, seriesId: _id };

    validateSeries(result);

    return result;
  }

  async findSessions(siteId: string, seriesId: string, from?: Date): Promise<readonly ISessionState[]> {
    const records = await this.sessions.find({ siteId, seriesId, ...(from ? { startsAt: { $gte: from } } : {}) })
      .sort({ startsAt: 1, _id: 1 }).lean().exec();
    const removed = await removedSessionModel(this.connection).find({
      siteId,
      seriesId,
      ...(from ? { startsAt: { $gte: from } } : {}),
    }).lean().exec();

    return [...records, ...removed].map(sessionState);
  }

  async create(series: ISessionSeriesState, sessions: readonly ISessionState[],
    addonPermit?: IAddonOperationPermit): Promise<void> {
    validateSeries(series);

    for (const state of sessions) {
      this.assertOwned(series, state);
    }
    await guardedWrite(this.connection, this.fence, addonPermit, async (transaction) => {
      const { seriesId, ...state } = series;

      await this.series.create([{ ...state, _id: seriesId }], { session: transaction });

      if (sessions.length) {
        await this.sessions.create(sessions.map(({ sessionId, ...state }) => ({ ...state, _id: sessionId })),
          { session: transaction, ordered: true });
      }
    });
  }

  async findOccurrences(siteId: string, seriesId: string,
    keys: readonly { readonly ruleId: string; readonly occurrenceNumber: number }[],
  ): Promise<readonly ISessionState[]> {
    if (!keys.length) {
      return [];
    }

    const records = await this.sessions.find({
      siteId,
      seriesId,
      $or: keys.map((key) => ({
        ruleId: key.ruleId, occurrenceNumber: key.occurrenceNumber,
      })),
    }).lean().exec();
    const removed = await removedSessionModel(this.connection).find({
      siteId,
      seriesId,
      $or: keys.map(key => ({ ruleId: key.ruleId, occurrenceNumber: key.occurrenceNumber })),
    }).lean().exec();

    return [...records, ...removed].map(sessionState);
  }

  async commit(series: ISessionSeriesState, expectedVersion: string, writes: readonly ISessionWrite[],
    addonPermit?: IAddonOperationPermit): Promise<void> {
    validateSeries(series);

    for (const write of writes) {
      this.assertOwned(series, write.session);
    }
    await guardedWrite(this.connection, this.fence, addonPermit, async (transaction) => {
      const { seriesId, ...state } = series;
      const result = await this.series.updateOne({ _id: seriesId, siteId: series.siteId, version: expectedVersion },
        { $set: state }, { session: transaction }).exec();

      if (result.matchedCount !== 1) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Series changed');
      }

      for (const write of writes) {
        const { sessionId, ...state } = write.session;

        if (write.expectedVersion === null) {
          await this.sessions.create([{ ...state, _id: sessionId }], { session: transaction });
        } else {
          const excluded = await removedSessionModel(this.connection)
            .findOne({ _id: sessionId, siteId: series.siteId }).session(transaction).lean().exec();
          const target = excluded ? removedSessionModel(this.connection) : this.sessions;
          const result = await target.updateOne({
            _id: sessionId,
            siteId: series.siteId,
            seriesId,
            version: write.expectedVersion,
          }, { $set: state }, { session: transaction }).exec();

          if (result.matchedCount !== 1) {
            throw new BusinessError(BusinessErrorCode.StaleWrite, 'Session changed');
          }
        }
      }
    });
  }

  async listDue(at: Date, afterSeriesId: string | null, limit: number): Promise<readonly ISessionSeriesState[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError('Invalid expansion batch');
    }

    const records = await this.series.find({
      nextExpansionAt: { $lte: at },
      ...(afterSeriesId === null ? {} : { _id: { $gt: afterSeriesId } }),
    }).sort({ _id: 1 }).limit(limit).lean().exec();

    return records.map(({ _id, ...state }) => {
      const result = { ...state, seriesId: _id };

      validateSeries(result);

      return result;
    });
  }

  private assertOwned(series: ISessionSeriesState, state: ISessionState): void {
    new Session(state);

    if (state.siteId !== series.siteId || state.seriesId !== series.seriesId) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign session write');
    }
  }
}
