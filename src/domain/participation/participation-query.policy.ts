import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { requireCondition, requireText } from '@zarya/addon-contracts/validation';

import { BookingRequest, type IBookingRequestState } from './booking-request.js';
import type { IAdminParticipation, IRequestListQuery } from './participation-query.js';
import { ParticipationState } from './participation-state.enum.js';

export function validateRequestList(query: IRequestListQuery): void {
  requireText(query.siteId, 'siteId');
  requireText(query.sessionId, 'sessionId');
  requireCondition(Number.isSafeInteger(query.limit) && query.limit >= 1 && query.limit <= 100,
    'Invalid request list limit');
  requireCondition(query.state === null || Object.values(ParticipationState).includes(query.state),
    'Invalid request state filter');
}

export function ownedParticipation(state: IBookingRequestState, siteId: string, requestId?: string): BookingRequest {
  if (state.siteId !== siteId || requestId !== undefined && state.requestId !== requestId) {
    throw new BusinessError(BusinessErrorCode.Scope, 'Foreign participation request');
  }

  return new BookingRequest(state);
}

export function adminParticipation(state: IBookingRequestState): IAdminParticipation {
  return structuredClone({
    requestId: state.requestId,
    requestReference: state.requestReference,
    sessionId: state.sessionId,
    places: state.places,
    contact: state.contact,
    state: state.state,
    requestedAt: state.requestedAt,
    version: state.version,
  });
}
