import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import type { ICursorPage } from '@zarya/addon-contracts/cursor-page';

import type { IAdminSessionSummary } from '../../../domain/participation/participation-query.js';
import {
  adminSession, type ISessionCatalogQuery, SessionAvailabilityFilter, SessionStatusFilter,
  SessionTimeFilter, validateSessionPage, validateSessionQuery,
} from '../../../domain/participation/session-catalog.js';
import type {
  IListAdminSessions, IListAdminSessionsInput,
} from '../../../ports/inbound/participation/list-admin-sessions.port.js';
import type { IPendingRequestCountsPort } from '../../../ports/outbound/participation/pending-request-counts.port.js';
import type { ISessionCatalogAccessPort } from '../../../ports/outbound/participation/session-catalog-access.port.js';
import type {
  ISessionScheduleValuesPort,
} from '../../../ports/outbound/participation/session-scheduling.port.js';
import type { ISessionStorePort } from '../../../ports/outbound/participation/session-store.port.js';

export class ListAdminSessionsUseCase implements IListAdminSessions {
  constructor(private readonly store: ISessionStorePort, private readonly access: ISessionCatalogAccessPort,
    private readonly values: ISessionScheduleValuesPort,
    private readonly addon: IAddonOperationPolicyPort, private readonly requests: IPendingRequestCountsPort) {}

  async execute(input: IListAdminSessionsInput): Promise<ICursorPage<IAdminSessionSummary>> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    await this.addon.authorize(input.siteId, AddonOperationAccess.AdministrationRetained);
    const query: ISessionCatalogQuery = {
      siteId: input.siteId,
      pageId: input.pageId ?? null,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      limit: input.limit ?? 20,
      cursor: input.cursor ?? null,
      at: this.values.now(),
      time: SessionTimeFilter.All,
      status: SessionStatusFilter.All,
      availability: SessionAvailabilityFilter.All,
    };

    validateSessionQuery(query);
    const page = await this.store.list(query);

    validateSessionPage(page, query);

    const counts = await this.requests.pendingCounts(input.siteId, page.items.map(state => state.sessionId));

    return {
      items: page.items.map(state => ({
        ...adminSession(state, query.at), pendingRequestCount: counts.get(state.sessionId) ?? 0,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
