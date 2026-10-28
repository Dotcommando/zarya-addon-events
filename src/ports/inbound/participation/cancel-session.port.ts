import type { IAdminSession } from '../../../domain/participation/participation-query.js';

export interface ICancelSessionInput {
  readonly siteId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly expectedVersion: string;
}

export interface ICancelSession { execute(input: ICancelSessionInput): Promise<IAdminSession>; }
