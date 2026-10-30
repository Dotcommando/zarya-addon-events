import type { IAddonOperationPermit } from '@zarya/addon-contracts/addons';

import type { IHookCommitIntent } from '../../../domain/hooks/hook-change.js';
import type { ISessionState } from '../../../domain/participation/session.js';

export interface ISessionManagementPort {
  hasRequests(siteId: string, sessionId: string): Promise<boolean>;
  remove(state: ISessionState,
    expectedVersion: string, permit: IAddonOperationPermit, hookChange?: IHookCommitIntent): Promise<void>;
  reschedule(state: ISessionState, expectedVersion: string, permit: IAddonOperationPermit): Promise<void>;
}
