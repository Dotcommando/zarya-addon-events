import type { IAddonOperationPermit } from '@zarya/addon-contracts/addons';
import type { ICursorPage } from '@zarya/addon-contracts/cursor-page';

import type { IHookCommitIntent } from '../../../domain/hooks/hook-change.js';
import type { ISessionState } from '../../../domain/participation/session.js';
import type { ISessionCatalogQuery } from '../../../domain/participation/session-catalog.js';

export interface ISessionStorePort {
  create(session: ISessionState, addonPermit?: IAddonOperationPermit, hookChange?: IHookCommitIntent): Promise<void>;
  find(siteId: string, sessionId: string): Promise<ISessionState | null>;
  list(query: ISessionCatalogQuery): Promise<ICursorPage<ISessionState>>;
  /** Compare the version; change cancellation/exception/version only, retain occupancy and requests. */
  cancel(session: ISessionState,
    expectedVersion: string, addonPermit?: IAddonOperationPermit, hookChange?: IHookCommitIntent): Promise<void>;
  /** Compare the version; change the existing page reference/version only. */
  changePage(siteId: string, sessionId: string, expectedVersion: string, pageId: string,
    nextVersion: string, addonPermit?: IAddonOperationPermit, hookChange?: IHookCommitIntent): Promise<void>;
}
