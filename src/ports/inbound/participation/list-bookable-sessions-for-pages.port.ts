import type { ICursorPage } from '@zarya/addon-contracts/cursor-page';

import type { IBookableSession } from '../../../domain/participation/participation-query.js';
import type { ISessionFilters } from '../../../domain/participation/session-catalog.js';

export interface IListBookableSessionsForPagesInput {
  readonly siteId: string;
  readonly pageIds: readonly string[];
  readonly rangeStart: Date;
  readonly rangeEnd: Date;
  readonly limitPerPage?: number;
  readonly cursors?: Readonly<Record<string, string | null>>;
  readonly filter?: ISessionFilters;
}

export interface IBookableSessionPage extends ICursorPage<IBookableSession> {
  readonly pageId: string;
}

export interface IListBookableSessionsForPages {
  execute(input: IListBookableSessionsForPagesInput): Promise<{ readonly pages: readonly IBookableSessionPage[] }>;
}
