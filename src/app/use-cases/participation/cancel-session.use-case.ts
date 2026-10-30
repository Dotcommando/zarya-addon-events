import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { requireText } from '@zarya/addon-contracts/validation';

import type { IAdminSession } from '../../../domain/participation/participation-query.js';
import { SessionStatus } from '../../../domain/participation/session.js';
import { adminSession, requireOwnedSession } from '../../../domain/participation/session-catalog.js';
import type { ICancelSession, ICancelSessionInput } from '../../../ports/inbound/participation/cancel-session.port.js';
import type { IHookSourcePort } from '../../../ports/outbound/hooks/hook-source.port.js';
import type { ISessionCatalogAccessPort } from '../../../ports/outbound/participation/session-catalog-access.port.js';
import type {
  ISessionScheduleValuesPort,
} from '../../../ports/outbound/participation/session-scheduling.port.js';
import type { ISessionStorePort } from '../../../ports/outbound/participation/session-store.port.js';

export class CancelSessionUseCase implements ICancelSession {
  constructor(private readonly store: ISessionStorePort, private readonly access: ISessionCatalogAccessPort,
    private readonly values: ISessionScheduleValuesPort,
    private readonly addon: IAddonOperationPolicyPort, private readonly hooks: IHookSourcePort) {}

  async execute(input: ICancelSessionInput): Promise<IAdminSession> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const addonPermit = await this.addon.authorize(input.siteId, AddonOperationAccess.AdministrationRetained);

    requireText(input.sessionId, 'sessionId');
    requireText(input.expectedVersion, 'expectedVersion');
    const state = await this.store.find(input.siteId, input.sessionId);

    if (!state) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Session not found');
    }

    const session = requireOwnedSession(state, input.siteId, input.sessionId);

    if (state.version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Session changed');
    }
    if (state.status !== SessionStatus.Cancelled) {
      session.cancel(this.values.nextVersion(), true);
      await this.store.cancel(session.toState(), input.expectedVersion, addonPermit, await this.hooks.prepare({
        siteId: input.siteId,
        actorId: input.actorId,
        subject: 'session:' + session.toState().sessionId,
        checkKey: 'addon.participation.session.cancelled.check',
        candidate: { sessionId: session.toState().sessionId, pageId: session.toState().pageId },
        facts: [{
          hookKey: 'addon.participation.session.cancelled',
          payload: { sessionId: session.toState().sessionId, pageId: session.toState().pageId },
        }],
      }));
    }

    return adminSession(session.toState(), this.values.now());
  }
}
