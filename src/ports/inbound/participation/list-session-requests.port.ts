import type { ICursorPage } from '@zarya/addon-contracts/cursor-page';

import type { IAdminParticipation, IRequestListQuery } from '../../../domain/participation/participation-query.js';

export interface IListSessionRequestsInput extends Omit<IRequestListQuery, 'state' | 'limit' | 'cursor'> {
  readonly actorId: string;
  readonly state?: IRequestListQuery['state'];
  readonly limit?: number;
  readonly cursor?: string | null;
}

export interface IListSessionRequests {
  execute(input: IListSessionRequestsInput): Promise<ICursorPage<IAdminParticipation>>;
}
