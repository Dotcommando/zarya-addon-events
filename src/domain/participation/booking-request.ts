import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { SnapshotEntity } from '@zarya/addon-contracts/snapshot-entity';
import {
  requireCondition, requireInstant, requireInteger, requireNewVersion, requireText,
} from '@zarya/addon-contracts/validation';

import type { IBookingContact } from './booking-contact.js';
import { BookingContact } from './booking-contact.js';
import { ParticipationState } from './participation-state.enum.js';

export interface IBookingRequestState {
  readonly requestId: string;
  readonly requestReference: string;
  readonly siteId: string;
  readonly sessionId: string;
  readonly places: number;
  readonly contact: IBookingContact;
  readonly state: ParticipationState;
  readonly requestedAt: Date;
  readonly decidedAt: Date | null;
  readonly decidedBy: string | null;
  readonly version: string;
}

export class BookingRequest extends SnapshotEntity<IBookingRequestState> {
  constructor(state: IBookingRequestState) {
    for (const value of [state.requestId, state.requestReference, state.siteId,
      state.sessionId, state.version]) {
      requireText(value, 'Request identity or version');
    }
    requireInteger(state.places, 1, 'places');
    requireInstant(state.requestedAt, 'requestedAt');
    requireCondition(Object.values(ParticipationState).includes(state.state), 'Invalid participation state');

    if (state.state === ParticipationState.Pending) {
      requireCondition(state.decidedAt === null && state.decidedBy === null, 'Pending request has a decision');
    } else {
      requireCondition(state.decidedAt !== null && state.decidedBy !== null, 'Terminal request requires a decision');

      if (state.decidedAt !== null && state.decidedBy !== null) {
        requireInstant(state.decidedAt, 'decidedAt');
        requireCondition(state.decidedAt >= state.requestedAt, 'Decision predates request');
        requireText(state.decidedBy, 'decidedBy');
      }
    }
    super({ ...state, contact: new BookingContact(state.contact) });
  }

  decide(target: ParticipationState.Confirmed | ParticipationState.Declined,
    actorId: string, decidedAt: Date, nextVersion: string): void {
    const state = this.toState();

    if (state.state !== ParticipationState.Pending) {
      throw new BusinessError(BusinessErrorCode.InvalidTransition, 'Only pending requests can be decided');
    }
    requireCondition(target === ParticipationState.Confirmed || target === ParticipationState.Declined,
      'Invalid terminal decision');
    const next = new BookingRequest({ ...state, state: target, decidedAt, decidedBy: actorId, version: nextVersion });

    requireNewVersion(state.version, nextVersion);
    this.replaceState(next.toState());
  }
}
