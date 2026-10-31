import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { requireText } from '@zarya/addon-contracts/validation';

import { requireOwnedSession } from '../../../domain/participation/session-catalog.js';
import {
  type IRemoveSession, type IRemoveSessionInput, SessionRemovalOutcome,
} from '../../../ports/inbound/participation/remove-session.port.js';
import type { IHookSourcePort } from '../../../ports/outbound/hooks/hook-source.port.js';
import type { ISessionCatalogAccessPort } from '../../../ports/outbound/participation/session-catalog-access.port.js';
import type {
  ISessionManagementPort,
} from '../../../ports/outbound/participation/session-management.port.js';
import type {
  ISessionScheduleValuesPort,
} from '../../../ports/outbound/participation/session-scheduling.port.js';
import type { ISessionStorePort } from '../../../ports/outbound/participation/session-store.port.js';

export class RemoveSessionUseCase implements IRemoveSession {
  constructor(private readonly sessions: ISessionStorePort, private readonly management: ISessionManagementPort,
    private readonly access: ISessionCatalogAccessPort, private readonly values: ISessionScheduleValuesPort,
    private readonly addon: IAddonOperationPolicyPort, private readonly hooks: IHookSourcePort) {}

  async execute(input: IRemoveSessionInput): Promise<{ readonly outcome: SessionRemovalOutcome }> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    requireText(input.expectedVersion, 'expectedVersion');
    const permit = await this.addon.authorize(input.siteId, AddonOperationAccess.AdministrationRetained);
    const state = await this.sessions.find(input.siteId, input.sessionId);

    if (!state) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Session not found');
    }

    const session = requireOwnedSession(state, input.siteId, input.sessionId);

    if (state.version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Session changed');
    }
    if (await this.management.hasRequests(input.siteId, input.sessionId)) {
      session.cancel(this.values.nextVersion(), true);
      await this.sessions.cancel(session.toState(), input.expectedVersion, permit, await this.hooks.prepare({
        siteId: input.siteId,
        actorId: input.actorId,
        subject: 'session:' + state.sessionId,
        checkKey: 'addon.events.session.cancelled.check',
        candidate: { sessionId: state.sessionId, pageId: state.pageId },
        facts: [{
          hookKey: 'addon.events.session.cancelled',
          payload: { sessionId: state.sessionId, pageId: state.pageId },
        }],
      }));

      return { outcome: SessionRemovalOutcome.Cancelled };
    }
    await this.management.remove(state, input.expectedVersion, permit, await this.hooks.prepare({
      siteId: input.siteId,
      actorId: input.actorId,
      subject: 'session:' + state.sessionId,
      checkKey: 'addon.events.session.removed.check',
      candidate: { sessionId: state.sessionId, pageId: state.pageId },
      facts: [{
        hookKey: 'addon.events.session.removed',
        payload: { sessionId: state.sessionId, pageId: state.pageId },
      }],
    }));

    return { outcome: SessionRemovalOutcome.Removed };
  }
}
