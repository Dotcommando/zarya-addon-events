import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import type { ICursorPage } from '@zarya/addon-contracts/cursor-page';
import { requireText } from '@zarya/addon-contracts/validation';

import type { IBookableSession } from '../../../domain/participation/participation-query.js';
import {
  type ISessionCatalogQuery, publicSession, SessionAvailabilityFilter, SessionStatusFilter,
  SessionTimeFilter, validateSessionPage, validateSessionQuery,
} from '../../../domain/participation/session-catalog.js';
import type {
  IListBookableSessions, IListBookableSessionsInput,
} from '../../../ports/inbound/participation/list-bookable-sessions.port.js';
import type { IPublicSessionPagePort } from '../../../ports/outbound/participation/public-session-page.port.js';
import type {
  ISessionScheduleValuesPort,
} from '../../../ports/outbound/participation/session-scheduling.port.js';
import type { ISessionStorePort } from '../../../ports/outbound/participation/session-store.port.js';

export class ListBookableSessionsUseCase implements IListBookableSessions {
  constructor(private readonly store: ISessionStorePort, private readonly pages: IPublicSessionPagePort,
    private readonly values: ISessionScheduleValuesPort,
    private readonly addon: IAddonOperationPolicyPort) {}

  async execute(input: IListBookableSessionsInput): Promise<ICursorPage<IBookableSession>> {
    await this.addon.authorize(input.siteId, AddonOperationAccess.PublicEnabled);
    requireText(input.pageId, 'pageId');
    const query: ISessionCatalogQuery = {
      siteId: input.siteId,
      pageId: input.pageId,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      limit: input.limit ?? 20,
      cursor: input.cursor ?? null,
      at: this.values.now(),
      time: input.filter?.time ?? SessionTimeFilter.Future,
      status: input.filter?.status ?? SessionStatusFilter.Scheduled,
      availability: input.filter?.availability ?? SessionAvailabilityFilter.All,
    };

    validateSessionQuery(query);

    if (!await this.pages.isPublished(input.siteId, input.pageId)) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Published page not found');
    }

    const page = await this.store.list(query);

    validateSessionPage(page, query);

    return { items: page.items.map((state) => publicSession(state, query.at)), nextCursor: page.nextCursor };
  }
}
