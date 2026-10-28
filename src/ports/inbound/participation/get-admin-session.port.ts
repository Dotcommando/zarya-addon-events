import type { IAdminSession } from '../../../domain/participation/participation-query.js';

export interface IGetAdminSessionInput {

  readonly siteId: string;
  readonly actorId: string;
  readonly sessionId: string;
}

export interface IGetAdminSession {
  execute(input: IGetAdminSessionInput): Promise<IAdminSession | null>;
}
