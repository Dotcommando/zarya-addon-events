import type { ICursorPage } from '@zarya/addon-contracts/cursor-page';

import type { IAdminSession, ISessionRangeQuery } from '../../../domain/participation/participation-query.js';

export interface IListAdminSessionsInput extends Omit<ISessionRangeQuery, 'limit' | 'cursor' | 'pageId'> {
  readonly actorId: string;
  readonly pageId?: string | null;
  readonly limit?: number;
  readonly cursor?: string | null;
}

export interface IListAdminSessions {
  execute(input: IListAdminSessionsInput): Promise<ICursorPage<IAdminSession>>;
}
