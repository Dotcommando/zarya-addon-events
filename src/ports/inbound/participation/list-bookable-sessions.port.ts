import type { ICursorPage } from '@zarya/addon-contracts/cursor-page';

import type { IBookableSession } from '../../../domain/participation/participation-query.js';
import type { ISessionFilters } from '../../../domain/participation/session-catalog.js';

export interface IListBookableSessionsInput {

  readonly siteId: string;
  readonly pageId: string;
  readonly rangeStart: Date;
  readonly rangeEnd: Date;
  readonly cursor?: string | null;
  readonly limit?: number;
  readonly filter?: ISessionFilters;
}

export interface IListBookableSessions {
  execute(input: IListBookableSessionsInput): Promise<ICursorPage<IBookableSession>>;
}
