import type { IAdminSession } from '../../../domain/participation/participation-query.js';

export interface IChangeSessionPageInput {
  readonly siteId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly pageId: string;
  readonly expectedVersion: string;
}

export interface IChangeSessionPage { execute(input: IChangeSessionPageInput): Promise<IAdminSession>; }
