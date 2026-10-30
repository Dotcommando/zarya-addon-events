import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { requireText } from '@zarya/addon-contracts/validation';

import type { IAdminSession } from '../../../domain/participation/participation-query.js';
import { adminSession, requireOwnedSession } from '../../../domain/participation/session-catalog.js';
import type {
  IChangeSessionPage, IChangeSessionPageInput,
} from '../../../ports/inbound/participation/change-session-page.port.js';
import type { IHookSourcePort } from '../../../ports/outbound/hooks/hook-source.port.js';
import type { ISessionCatalogAccessPort } from '../../../ports/outbound/participation/session-catalog-access.port.js';
import type {
  ISessionScheduleValuesPort, ISessionSeriesPagePort,
} from '../../../ports/outbound/participation/session-scheduling.port.js';
import type { ISessionStorePort } from '../../../ports/outbound/participation/session-store.port.js';

export class ChangeSessionPageUseCase implements IChangeSessionPage {
  constructor(private readonly store: ISessionStorePort, private readonly pages: ISessionSeriesPagePort,
    private readonly access: ISessionCatalogAccessPort, private readonly values: ISessionScheduleValuesPort,
    private readonly addon: IAddonOperationPolicyPort, private readonly hooks: IHookSourcePort) {}

  async execute(input: IChangeSessionPageInput): Promise<IAdminSession> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const addonPermit = await this.addon.authorize(input.siteId, AddonOperationAccess.AdministrationRetained);

    requireText(input.sessionId, 'sessionId');
    requireText(input.pageId, 'pageId');
    requireText(input.expectedVersion, 'expectedVersion');
    const state = await this.store.find(input.siteId, input.sessionId);

    if (!state) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Session not found');
    }

    const session = requireOwnedSession(state, input.siteId, input.sessionId);

    if (state.version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Session changed');
    }
    await this.pages.requirePage(input.siteId, input.pageId);

    if (state.pageId !== input.pageId) {
      session.changePage(input.pageId, this.values.nextVersion());
      await this.store.changePage(input.siteId, input.sessionId, input.expectedVersion, input.pageId,
        session.toState().version, addonPermit, await this.hooks.prepare({
          siteId: input.siteId,
          actorId: input.actorId,
          subject: 'session:' + session.toState().sessionId,
          checkKey: 'addon.participation.session.page.changed.check',
          candidate: { sessionId: session.toState().sessionId, pageId: session.toState().pageId },
          facts: [{
            hookKey: 'addon.participation.session.page.changed',
            payload: { sessionId: session.toState().sessionId, pageId: session.toState().pageId },
          }],
        }));
    }

    return adminSession(session.toState(), this.values.now());
  }
}
