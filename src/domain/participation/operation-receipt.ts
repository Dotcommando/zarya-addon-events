import type { IConfirmedParticipation, IDeclinedParticipation, IParticipationReceipt } from './participation-result.js';

export enum ParticipationOperation {
  Request = 'Request',
  Confirm = 'Confirm',
  Decline = 'Decline',
}

export interface IOperationIdentity {
  readonly siteId: string;
  readonly operation: ParticipationOperation;
  readonly actorId: string | null;
  readonly idempotencyKey: string;
}

export interface IRequestOperationIdentity extends IOperationIdentity {
  readonly operation: ParticipationOperation.Request;
  readonly actorId: null;
}

export interface IConfirmOperationIdentity extends IOperationIdentity {
  readonly operation: ParticipationOperation.Confirm;
  readonly actorId: string;
}

export interface IDeclineOperationIdentity extends IOperationIdentity {
  readonly operation: ParticipationOperation.Decline;
  readonly actorId: string;
}

export interface IRequestOperationReceipt {
  readonly identity: IRequestOperationIdentity;
  readonly inputIdentity: string;
  readonly result: IParticipationReceipt;
}

export interface IConfirmOperationReceipt {
  readonly identity: IConfirmOperationIdentity;
  readonly inputIdentity: string;
  readonly result: IConfirmedParticipation;
}

export interface IDeclineOperationReceipt {
  readonly identity: IDeclineOperationIdentity;
  readonly inputIdentity: string;
  readonly result: IDeclinedParticipation;
}

export type DecisionOperationReceipt = IConfirmOperationReceipt | IDeclineOperationReceipt;

export type OperationReceipt = IRequestOperationReceipt | DecisionOperationReceipt;
