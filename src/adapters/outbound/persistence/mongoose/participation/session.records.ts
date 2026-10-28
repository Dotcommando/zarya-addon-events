import { type Connection, type Model, Schema } from 'mongoose';

import { type ISessionState, Session } from '../../../../../domain/participation/session.js';

export interface ISessionRecord extends Omit<ISessionState, 'sessionId'> { readonly _id: string; }

const schema = new Schema<ISessionRecord>({
  _id: { type: String, required: true },
  siteId: String,
  pageId: String,
  seriesId: { type: String, default: null },
  ruleId: { type: String, default: null },
  occurrenceNumber: { type: Number, default: null },
  startsAt: Date,
  endsAt: Date,
  timeZone: String,
  capacity: Number,
  heldPlaces: Number,
  confirmedPlaces: Number,
  status: String,
  overridden: Boolean,
  version: String,
}, { collection: 'sessions', versionKey: false, autoCreate: false, autoIndex: false, strict: 'throw' });

export function sessionModel(connection: Connection): Model<ISessionRecord> {
  return connection.model<ISessionRecord>('Session', schema);
}

export function sessionRecord(state: ISessionState): ISessionRecord {
  const { sessionId, ...fields } = new Session(state).toState();

  return { ...fields, _id: sessionId };
}

export function sessionState(row: ISessionRecord): ISessionState {
  const { _id, ...fields } = row;

  return new Session({ ...fields, sessionId: _id }).toState();
}

export function removedSessionModel(connection: Connection): Model<ISessionRecord> {
  return connection.model<ISessionRecord>('RemovedSession', schema, 'session_exclusions');
}
