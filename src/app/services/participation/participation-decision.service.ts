import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';

import type { IBookingRequestState } from '../../../domain/participation/booking-request.js';
import { ownedParticipation } from '../../../domain/participation/participation-query.policy.js';
import type { ISessionState } from '../../../domain/participation/session.js';
import { requireOwnedSession } from '../../../domain/participation/session-catalog.js';
import type { IParticipationDecisionInput } from '../../../ports/inbound/participation/participation-decision.input.js';
import type { IParticipationStorePort } from '../../../ports/outbound/participation/participation-store.port.js';
import type { ISessionStorePort } from '../../../ports/outbound/participation/session-store.port.js';

export async function loadDecisionParticipants(store: IParticipationStorePort, sessions: ISessionStorePort,
  input: IParticipationDecisionInput): Promise<{ request: IBookingRequestState; session: ISessionState }> {
  const stored = await store.findRequest(input.siteId, input.requestId);

  if (!stored) {
    throw new BusinessError(BusinessErrorCode.NotFound, 'Request not found');
  }

  const request = ownedParticipation(stored, input.siteId, input.requestId).toState();

  if (request.version !== input.expectedRequestVersion) {
    throw new BusinessError(BusinessErrorCode.StaleWrite, 'Request changed');
  }

  const meeting = await sessions.find(input.siteId, request.sessionId);

  if (!meeting) {
    throw new BusinessError(BusinessErrorCode.NotFound, 'Session not found');
  }

  const session = requireOwnedSession(meeting, input.siteId, request.sessionId).toState();
  // A decision may commit between the independent request and session reads.
  const latest = await store.findRequest(input.siteId, input.requestId);

  if (!latest || ownedParticipation(latest, input.siteId, input.requestId).toState().version !== request.version) {
    throw new BusinessError(BusinessErrorCode.StaleWrite, 'Request changed');
  }

  return { request, session };
}
