import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';

import type { IBookingRequestState } from './booking-request.js';
import { BookingRequest } from './booking-request.js';
import { ParticipationState } from './participation-state.enum.js';
import type { ISessionState } from './session.js';
import { Session, SessionStatus } from './session.js';

export interface IParticipationChange {
  readonly session: ISessionState;
  readonly request: IBookingRequestState;
}

export interface IParticipationDecisionValues {
  readonly actorId: string;
  readonly decidedAt: Date;
  readonly sessionVersion: string;
  readonly requestVersion: string;
}

export class ParticipationPolicy {
  static reserve(sessionState: ISessionState, requestState: IBookingRequestState,
    nextSessionVersion: string): IParticipationChange {
    this.requireMatchingReferences(sessionState, requestState);
    const session = new Session(sessionState);
    const request = new BookingRequest(requestState);

    if (requestState.state !== ParticipationState.Pending) {
      throw new BusinessError(BusinessErrorCode.InvalidTransition, 'A new reservation must be pending');
    }
    session.hold(requestState.places, nextSessionVersion);

    return { session: session.toState(), request: request.toState() };
  }

  static decide(sessionState: ISessionState, requestState: IBookingRequestState,
    target: ParticipationState.Confirmed | ParticipationState.Declined,
    values: IParticipationDecisionValues): IParticipationChange {
    this.requireMatchingReferences(sessionState, requestState);
    const session = new Session(sessionState);
    const request = new BookingRequest(requestState);

    if (target === ParticipationState.Confirmed && sessionState.status === SessionStatus.Cancelled) {
      throw new BusinessError(BusinessErrorCode.NotBookable, 'Cancelled meetings cannot be confirmed');
    }
    request.decide(target, values.actorId, values.decidedAt, values.requestVersion);

    if (target === ParticipationState.Confirmed) {
      session.confirmHeld(requestState.places, values.sessionVersion);
    } else {
      session.releaseHeld(requestState.places, values.sessionVersion);
    }

    return { session: session.toState(), request: request.toState() };
  }

  private static requireMatchingReferences(session: ISessionState, request: IBookingRequestState): void {
    if (session.siteId !== request.siteId || session.sessionId !== request.sessionId) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Request and session do not share site and session');
    }
  }
}
