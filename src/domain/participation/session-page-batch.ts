import type { ICursorPage } from '@zarya/addon-contracts/cursor-page';
import { requireCondition } from '@zarya/addon-contracts/validation';

import type { ISessionState } from './session.js';
import type { ISessionCatalogQuery } from './session-catalog.js';

export const SESSION_PAGE_BATCH_LIMIT = 64;

export interface ISessionPageGroup extends ICursorPage<ISessionState> {
  readonly pageId: string;
}

export function validateSessionBatch(queries: readonly ISessionCatalogQuery[]): void {
  requireCondition(Array.isArray(queries) && queries.length <= SESSION_PAGE_BATCH_LIMIT, 'Invalid session page batch');
  requireCondition(queries.every((query) => typeof query.pageId === 'string' && query.pageId.trim().length > 0
    && query.siteId === queries[0]?.siteId)
    && new Set(queries.map((query) => query.pageId)).size === queries.length, 'Invalid session page batch scope');
}
