import type { IBookingContact } from '../../../domain/participation/booking-contact.js';
import type { IParticipationReceipt } from '../../../domain/participation/participation-result.js';

export interface IRequestParticipationInput {

  readonly siteId: string;
  readonly sessionId: string;
  readonly places: number;
  readonly contact: IBookingContact;
  readonly idempotencyKey: string;
}

export interface IRequestParticipation {
  execute(input: IRequestParticipationInput): Promise<IParticipationReceipt>;
}
