import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { requireCondition } from '@zarya/addon-contracts/validation';

import {
  type ISessionCatalogQuery, publicSession, SessionAvailabilityFilter, SessionStatusFilter,
  SessionTimeFilter, validateSessionPage, validateSessionQuery,
} from '../../../domain/participation/session-catalog.js';
import { SESSION_PAGE_BATCH_LIMIT, validateSessionBatch } from '../../../domain/participation/session-page-batch.js';
import type {
  IListBookableSessionsForPages, IListBookableSessionsForPagesInput,
} from '../../../ports/inbound/participation/list-bookable-sessions-for-pages.port.js';
import type { IPublicSessionPagesPort } from '../../../ports/outbound/participation/public-session-pages.port.js';
import type { ISessionBatchReadPort } from '../../../ports/outbound/participation/session-batch-read.port.js';
import type { ISessionScheduleValuesPort } from '../../../ports/outbound/participation/session-scheduling.port.js';

export class ListBookableSessionsForPagesUseCase implements IListBookableSessionsForPages {
  constructor(private readonly store: ISessionBatchReadPort, private readonly pages: IPublicSessionPagesPort,
    private readonly values: ISessionScheduleValuesPort, private readonly addon: IAddonOperationPolicyPort) {}

  async execute(input: IListBookableSessionsForPagesInput): ReturnType<IListBookableSessionsForPages['execute']> {
    await this.addon.authorize(input.siteId, AddonOperationAccess.PublicEnabled);
    requireCondition(Array.isArray(input.pageIds) && input.pageIds.length <= SESSION_PAGE_BATCH_LIMIT,
      'Invalid session page batch');
    const cursors = input.cursors ?? {};

    requireCondition(typeof cursors === 'object' && cursors !== null && !Array.isArray(cursors)
      && Object.entries(cursors).every(([pageId, cursor]) => input.pageIds.includes(pageId)
        && (cursor === null || typeof cursor === 'string' && cursor.length <= 2048)), 'Invalid page cursors');
    const common: ISessionCatalogQuery = {
      siteId: input.siteId,
      pageId: null,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      limit: input.limitPerPage ?? 20,
      cursor: null,
      at: this.values.now(),
      time: input.filter?.time ?? SessionTimeFilter.Future,
      status: input.filter?.status ?? SessionStatusFilter.Scheduled,
      availability: input.filter?.availability ?? SessionAvailabilityFilter.All,
    };

    validateSessionQuery(common);
    const queries = input.pageIds.map((pageId) => ({
      ...common, pageId, cursor: Object.hasOwn(cursors, pageId) ? cursors[pageId]! : null,
    }));

    validateSessionBatch(queries);

    if (!queries.length) {
      return { pages: [] };
    }

    const published = await this.pages.findPublished(input.siteId, input.pageIds);

    if (new Set(published).size !== published.length || published.some((id) => !input.pageIds.includes(id))) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent published page batch');
    }
    if (input.pageIds.some((id) => !published.includes(id))) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Published page not found');
    }

    const groups = await this.store.listForPages(queries);
    const byPage = new Map(groups.map((group) => [group.pageId, group]));

    if (
      groups.length !== queries.length
      || byPage.size !== queries.length
      || groups.some((group) => !input.pageIds.includes(group.pageId))
    ) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent session page groups');
    }

    return {
      pages: queries.map((query) => {
        const group = byPage.get(query.pageId!)!;

        validateSessionPage(group, query);

        return {
          pageId: query.pageId!,
          items: group.items.map((state) => publicSession(state, query.at)),
          nextCursor: group.nextCursor,
        };
      }),
    };
  }
}
