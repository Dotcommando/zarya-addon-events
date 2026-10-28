import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import type { ICursorPage } from '@zarya/addon-contracts/cursor-page';

import type { IAdminParticipation, IRequestListQuery } from '../../../domain/participation/participation-query.js';
import {
  adminParticipation, ownedParticipation, validateRequestList,
} from '../../../domain/participation/participation-query.policy.js';
import { requireOwnedSession } from '../../../domain/participation/session-catalog.js';
import type {
  IListSessionRequests, IListSessionRequestsInput,
} from '../../../ports/inbound/participation/list-session-requests.port.js';
import type { IParticipationStorePort } from '../../../ports/outbound/participation/participation-store.port.js';
import type { ISessionCatalogAccessPort } from '../../../ports/outbound/participation/session-catalog-access.port.js';
import type { ISessionStorePort } from '../../../ports/outbound/participation/session-store.port.js';

export class ListSessionRequestsUseCase implements IListSessionRequests {
  constructor(private readonly store: IParticipationStorePort, private readonly sessions: ISessionStorePort,
    private readonly access: ISessionCatalogAccessPort,
    private readonly addon: IAddonOperationPolicyPort) {}

  async execute(input: IListSessionRequestsInput): Promise<ICursorPage<IAdminParticipation>> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    await this.addon.authorize(input.siteId, AddonOperationAccess.AdministrationRetained);
    const query: IRequestListQuery = {
      siteId: input.siteId,
      sessionId: input.sessionId,
      state: input.state ?? null,
      limit: input.limit ?? 20,
      cursor: input.cursor ?? null,
    };

    validateRequestList(query);
    const session = await this.sessions.find(input.siteId, input.sessionId);

    if (!session) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Session not found');
    }
    requireOwnedSession(session, input.siteId, input.sessionId);
    const page = await this.store.listRequests(query);

    if (page.items.length > query.limit) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Oversized request list');
    }

    let previous: typeof page.items[number] | undefined;
    const items = page.items.map((row) => {
      const state = ownedParticipation(row, input.siteId).toState();
      const incorrectOrder = previous && (previous.requestedAt > state.requestedAt
        || previous.requestedAt.getTime() === state.requestedAt.getTime() && previous.requestId >= state.requestId);

      if (state.sessionId !== input.sessionId || query.state !== null && state.state !== query.state
        || incorrectOrder) {
        throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent request list');
      }
      previous = state;

      return adminParticipation(state);
    });

    return { items, nextCursor: page.nextCursor };
  }
}
