import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { requireInstant, requireInteger, requireText } from '@zarya/addon-contracts/validation';

import { BookingContact } from '../../../domain/participation/booking-contact.js';
import { BookingRequest } from '../../../domain/participation/booking-request.js';
import {
  type IRequestOperationIdentity, type OperationReceipt, ParticipationOperation,
} from '../../../domain/participation/operation-receipt.js';
import { ParticipationPolicy } from '../../../domain/participation/participation.policy.js';
import {
  requireMatchingReceipt, requireParticipationKey,
} from '../../../domain/participation/participation-operation.policy.js';
import type { IParticipationReceipt } from '../../../domain/participation/participation-result.js';
import { ParticipationState } from '../../../domain/participation/participation-state.enum.js';
import { requireOwnedSession } from '../../../domain/participation/session-catalog.js';
import type {
  IRequestParticipation, IRequestParticipationInput,
} from '../../../ports/inbound/participation/request-participation.port.js';
import type { IParticipationIdentityPort } from '../../../ports/outbound/participation/participation-identity.port.js';
import type { IParticipationStorePort } from '../../../ports/outbound/participation/participation-store.port.js';
import type { IParticipationValuesPort } from '../../../ports/outbound/participation/participation-values.port.js';
import type { IPublicSessionPagePort } from '../../../ports/outbound/participation/public-session-page.port.js';
import type { ISessionStorePort } from '../../../ports/outbound/participation/session-store.port.js';
import { findReceiptAfterFailure } from '../../services/participation/participation-receipt.service.js';

export class RequestParticipationUseCase implements IRequestParticipation {
  constructor(private readonly store: IParticipationStorePort, private readonly sessions: ISessionStorePort,
    private readonly pages: IPublicSessionPagePort, private readonly values: IParticipationValuesPort,
    private readonly identities: IParticipationIdentityPort,
    private readonly addon: IAddonOperationPolicyPort) {}

  async execute(input: IRequestParticipationInput): Promise<IParticipationReceipt> {
    const addonPermit = await this.addon.authorize(input.siteId, AddonOperationAccess.PublicEnabled);

    requireText(input.siteId, 'siteId');
    requireText(input.sessionId, 'sessionId');
    requireInteger(input.places, 1, 'places');
    requireParticipationKey(input.idempotencyKey);
    const contact = new BookingContact(input.contact);
    const identity: IRequestOperationIdentity = {
      siteId: input.siteId,
      operation: ParticipationOperation.Request,
      actorId: null,
      idempotencyKey: input.idempotencyKey,
    };
    const fingerprint = this.identities.request({
      siteId: input.siteId,
      sessionId: input.sessionId,
      places: input.places,
      contact,
    });
    const replay = await this.store.findOperationReceipt(identity);

    if (replay) {
      return this.result(replay, identity, fingerprint, input);
    }

    const stored = await this.sessions.find(input.siteId, input.sessionId);

    if (!stored) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Session not found');
    }

    const session = requireOwnedSession(stored, input.siteId, input.sessionId);

    if (!await this.pages.isPublished(input.siteId, stored.pageId)) {
      throw new BusinessError(BusinessErrorCode.NotBookable, 'Published page is unavailable');
    }

    const at = this.values.now();

    if (stored.startsAt <= at) {
      throw new BusinessError(BusinessErrorCode.NotBookable, 'Booking has closed');
    }

    const request = new BookingRequest({
      requestId: this.values.nextId(),
      requestReference: this.values.nextRequestReference(),
      siteId: input.siteId,
      sessionId: input.sessionId,
      places: input.places,
      contact,
      state: ParticipationState.Pending,
      requestedAt: at,
      decidedAt: null,
      decidedBy: null,
      version: this.values.nextVersion(),
    });
    const change = ParticipationPolicy.reserve(session.toState(), request.toState(), this.values.nextVersion());
    const result: IParticipationReceipt = {
      requestReference: request.toState().requestReference,
      sessionId: input.sessionId,
      places: input.places,
      state: ParticipationState.Pending,
      acceptedAt: at,
    };

    try {
      await this.store.commitRequest({
        addonPermit,
        ...change,
        expectedSessionVersion: stored.version,
        receipt: { identity, inputIdentity: fingerprint, result },
      });
    } catch (error) {
      const committed = await findReceiptAfterFailure(this.store, identity);

      if (committed) {
        return this.result(committed, identity, fingerprint, input);
      }
      throw error;
    }

    return result;
  }

  private result(receipt: OperationReceipt, identity: IRequestOperationIdentity, fingerprint: string,
    input: IRequestParticipationInput): IParticipationReceipt {
    requireMatchingReceipt(receipt, identity, fingerprint);

    if (receipt.result.state !== ParticipationState.Pending || !('acceptedAt' in receipt.result)
      || receipt.result.sessionId !== input.sessionId || receipt.result.places !== input.places) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent request receipt');
    }
    requireInstant(receipt.result.acceptedAt, 'acceptedAt');
    requireText(receipt.result.requestReference, 'requestReference');

    return structuredClone(receipt.result);
  }
}
