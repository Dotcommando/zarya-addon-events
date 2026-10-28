import type { IBookingContact } from '../../../domain/participation/booking-contact.js';
import type { ParticipationOperation } from '../../../domain/participation/operation-receipt.js';

export interface IRequestSemanticInput {
  readonly siteId: string;
  readonly sessionId: string;
  readonly places: number;
  readonly contact: IBookingContact;
}

export interface IDecisionSemanticInput {
  readonly siteId: string;
  readonly actorId: string;
  readonly operation: ParticipationOperation.Confirm | ParticipationOperation.Decline;
  readonly requestId: string;
  readonly expectedRequestVersion: string;
}

export interface IParticipationIdentityPort {
  request(input: IRequestSemanticInput): string;
  decision(input: IDecisionSemanticInput): string;
}
