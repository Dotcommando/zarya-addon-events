import type { ISessionCatalogQuery } from '../../../domain/participation/session-catalog.js';
import type { ISessionPageGroup } from '../../../domain/participation/session-page-batch.js';

export interface ISessionBatchReadPort {
  /** Each query retains its own limit, cursor and ordering, including empty page groups. */
  listForPages(queries: readonly ISessionCatalogQuery[]): Promise<readonly ISessionPageGroup[]>;
}
