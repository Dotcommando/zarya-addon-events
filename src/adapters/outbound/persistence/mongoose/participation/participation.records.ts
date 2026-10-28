import { createHash } from 'node:crypto';

import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { type Connection, type Model, Schema } from 'mongoose';

import { BookingRequest, type IBookingRequestState } from '../../../../../domain/participation/booking-request.js';
import {
  type IOperationIdentity, type OperationReceipt, ParticipationOperation,
} from '../../../../../domain/participation/operation-receipt.js';
import type {
  IConfirmedParticipation, IDeclinedParticipation, IParticipationReceipt,
} from '../../../../../domain/participation/participation-result.js';
import { ParticipationState } from '../../../../../domain/participation/participation-state.enum.js';

export interface IParticipationRequestRecord extends Omit<IBookingRequestState, 'requestId'> { readonly _id: string; }

export interface IParticipationOperationRecord {
  readonly _id: string;
  readonly siteId: string;
  readonly operation: ParticipationOperation;
  readonly actorId: string | null;
  readonly keyDigest: string;
  readonly inputIdentity: string;
  readonly result: IParticipationReceipt | IConfirmedParticipation | IDeclinedParticipation;
  readonly createdAt: Date;
}

export interface IParticipationModels {
  readonly requests: Model<IParticipationRequestRecord>;
  readonly operations: Model<IParticipationOperationRecord>;
}

const contact = new Schema({ name: String, phone: String, email: String }, { _id: false, strict: 'throw' });

const requestSchema = new Schema<IParticipationRequestRecord>({
  _id: { type: String, required: true },
  siteId: String,
  sessionId: String,
  requestReference: String,
  places: Number,
  contact,
  state: String,
  requestedAt: Date,
  decidedAt: { type: Date, default: null },
  decidedBy: { type: String, default: null },
  version: String,
}, { collection: 'participation_requests', autoCreate: false, autoIndex: false, versionKey: false, strict: 'throw' });

const operationSchema = new Schema<IParticipationOperationRecord>({
  _id: { type: String, required: true },
  siteId: String,
  operation: String,
  actorId: { type: String, default: null },
  keyDigest: String,
  inputIdentity: String,
  result: Schema.Types.Mixed,
  createdAt: Date,
}, { collection: 'participation_operations', autoCreate: false, autoIndex: false, versionKey: false, strict: 'throw' });

export function participationModels(connection: Connection): IParticipationModels {
  return {
    requests: connection.model<IParticipationRequestRecord>('ParticipationRequest', requestSchema),
    operations: connection.model<IParticipationOperationRecord>('ParticipationOperation', operationSchema),
  };
}

export function participationRequest(row: IParticipationRequestRecord): IBookingRequestState {
  const { _id, ...state } = row;

  return new BookingRequest({ ...state, requestId: _id }).toState();
}

export function operationKey(identity: IOperationIdentity): { readonly id: string; readonly keyDigest: string } {
  const keyDigest = createHash('sha256').update(identity.idempotencyKey).digest('hex');

  return {
    id: createHash('sha256').update(JSON.stringify([identity.siteId, identity.operation,
      identity.actorId, keyDigest])).digest('hex'),
    keyDigest,
  };
}

export function operationRecord(receipt: OperationReceipt): IParticipationOperationRecord {
  const key = operationKey(receipt.identity);

  return {
    _id: key.id,
    keyDigest: key.keyDigest,
    siteId: receipt.identity.siteId,
    operation: receipt.identity.operation,
    actorId: receipt.identity.actorId,
    inputIdentity: receipt.inputIdentity,
    result: structuredClone(receipt.result),
    createdAt: 'acceptedAt' in receipt.result ? receipt.result.acceptedAt : receipt.result.decidedAt,
  };
}

export function operationReceipt(row: IParticipationOperationRecord, identity: IOperationIdentity): OperationReceipt {
  const key = operationKey(identity);

  if (row._id !== key.id || row.keyDigest !== key.keyDigest || row.siteId !== identity.siteId
    || row.actorId !== identity.actorId || row.operation !== identity.operation) {
    throw new BusinessError(BusinessErrorCode.Scope, 'Foreign participation operation');
  }

  const common = { inputIdentity: row.inputIdentity };

  if (row.operation === ParticipationOperation.Request && row.actorId === null
    && row.result.state === ParticipationState.Pending) {
    return {
      ...common,
      identity: { ...identity, operation: ParticipationOperation.Request, actorId: null },
      result: structuredClone(row.result),
    };
  }
  if (row.operation === ParticipationOperation.Confirm && row.actorId !== null
    && row.result.state === ParticipationState.Confirmed) {
    return {
      ...common,
      identity: {
        ...identity,
        operation: ParticipationOperation.Confirm,
        actorId: row.actorId,
      },
      result: structuredClone(row.result),
    };
  }
  if (row.operation === ParticipationOperation.Decline && row.actorId !== null
    && row.result.state === ParticipationState.Declined) {
    return {
      ...common,
      identity: {
        ...identity,
        operation: ParticipationOperation.Decline,
        actorId: row.actorId,
      },
      result: structuredClone(row.result),
    };
  }
  throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent participation operation');
}
