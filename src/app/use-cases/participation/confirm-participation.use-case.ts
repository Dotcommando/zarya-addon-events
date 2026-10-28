import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { requireInstant, requireText } from '@zarya/addon-contracts/validation';

import {
  type IConfirmOperationIdentity, type OperationReceipt, ParticipationOperation,
} from '../../../domain/participation/operation-receipt.js';
import { ParticipationPolicy } from '../../../domain/participation/participation.policy.js';
import {
  requireMatchingReceipt, requireParticipationKey,
} from '../../../domain/participation/participation-operation.policy.js';
import type { IConfirmedParticipation } from '../../../domain/participation/participation-result.js';
import { ParticipationState } from '../../../domain/participation/participation-state.enum.js';
import type { IConfirmParticipation } from '../../../ports/inbound/participation/confirm-participation.port.js';
import type { IParticipationDecisionInput } from '../../../ports/inbound/participation/participation-decision.input.js';
import type { IParticipationIdentityPort } from '../../../ports/outbound/participation/participation-identity.port.js';
import type { IParticipationStorePort } from '../../../ports/outbound/participation/participation-store.port.js';
import type { IParticipationValuesPort } from '../../../ports/outbound/participation/participation-values.port.js';
import type { ISessionCatalogAccessPort } from '../../../ports/outbound/participation/session-catalog-access.port.js';
import type { ISessionStorePort } from '../../../ports/outbound/participation/session-store.port.js';
import { loadDecisionParticipants } from '../../services/participation/participation-decision.service.js';
import { findReceiptAfterFailure } from '../../services/participation/participation-receipt.service.js';

export class ConfirmParticipationUseCase implements IConfirmParticipation {
  constructor(private readonly store: IParticipationStorePort, private readonly sessions: ISessionStorePort,
    private readonly access: ISessionCatalogAccessPort, private readonly values: IParticipationValuesPort,
    private readonly identities: IParticipationIdentityPort,
    private readonly addon: IAddonOperationPolicyPort) {}

  async execute(input: IParticipationDecisionInput): Promise<IConfirmedParticipation> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const addonPermit = await this.addon.authorize(input.siteId, AddonOperationAccess.AdministrationRetained);

    requireText(input.siteId, 'siteId');
    requireText(input.actorId, 'actorId');
    requireText(input.requestId, 'requestId');
    requireText(input.expectedRequestVersion, 'expectedRequestVersion');
    requireParticipationKey(input.idempotencyKey);
    const identity: IConfirmOperationIdentity = {
      siteId: input.siteId,
      actorId: input.actorId,
      operation: ParticipationOperation.Confirm,
      idempotencyKey: input.idempotencyKey,
    };
    const fingerprint = this.identities.decision({ ...input, operation: ParticipationOperation.Confirm });
    const replay = await this.store.findOperationReceipt(identity);

    if (replay) {
      return this.result(replay, identity, fingerprint, input.requestId);
    }

    const { request, session } = await loadDecisionParticipants(this.store, this.sessions, input);
    const decidedAt = this.values.now();
    const change = ParticipationPolicy.decide(session, request, ParticipationState.Confirmed, {
      actorId: input.actorId,
      decidedAt,
      sessionVersion: this.values.nextVersion(),
      requestVersion: this.values.nextVersion(),
    });
    const result: IConfirmedParticipation = {
      requestId: request.requestId,
      sessionId: request.sessionId,
      places: request.places,
      requestVersion: change.request.version,
      decidedAt,
      state: ParticipationState.Confirmed,
    };

    try {
      await this.store.commitDecision({
        addonPermit,
        ...change,
        expectedSessionVersion: session.version,
        expectedRequestVersion: request.version,
        receipt: { identity, inputIdentity: fingerprint, result },
      });
    } catch (error) {
      const committed = await findReceiptAfterFailure(this.store, identity);

      if (committed) {
        return this.result(committed, identity, fingerprint, input.requestId);
      }
      throw error;
    }

    return result;
  }

  private result(receipt: OperationReceipt, identity: IConfirmOperationIdentity, fingerprint: string,
    requestId: string): IConfirmedParticipation {
    requireMatchingReceipt(receipt, identity, fingerprint);

    if (receipt.result.state !== ParticipationState.Confirmed || receipt.result.requestId !== requestId) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent decision receipt');
    }
    requireInstant(receipt.result.decidedAt, 'decidedAt');
    requireText(receipt.result.requestVersion, 'requestVersion');

    return structuredClone(receipt.result);
  }
}

