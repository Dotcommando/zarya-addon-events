import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { requireText } from '@zarya/addon-contracts/validation';

import type { IAdminSession } from '../../../domain/participation/participation-query.js';
import { adminSession, requireOwnedSession } from '../../../domain/participation/session-catalog.js';
import type {
  IGetAdminSession, IGetAdminSessionInput,
} from '../../../ports/inbound/participation/get-admin-session.port.js';
import type { ISessionCatalogAccessPort } from '../../../ports/outbound/participation/session-catalog-access.port.js';
import type {
  ISessionScheduleValuesPort,
} from '../../../ports/outbound/participation/session-scheduling.port.js';
import type { ISessionStorePort } from '../../../ports/outbound/participation/session-store.port.js';

export class GetAdminSessionUseCase implements IGetAdminSession {
  constructor(private readonly store: ISessionStorePort, private readonly access: ISessionCatalogAccessPort,
    private readonly values: ISessionScheduleValuesPort,
    private readonly addon: IAddonOperationPolicyPort) {}

  async execute(input: IGetAdminSessionInput): Promise<IAdminSession | null> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    await this.addon.authorize(input.siteId, AddonOperationAccess.AdministrationRetained);
    requireText(input.siteId, 'siteId');
    requireText(input.sessionId, 'sessionId');
    const state = await this.store.find(input.siteId, input.sessionId);

    if (!state) {
      return null;
    }

    return adminSession(requireOwnedSession(state, input.siteId, input.sessionId).toState(), this.values.now());
  }
}
