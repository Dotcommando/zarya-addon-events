import type { IAddonOperationPermit } from '@zarya/addon-contracts/addons';
import type { ICursorPage } from '@zarya/addon-contracts/cursor-page';

import type { IBookingRequestState } from '../../../domain/participation/booking-request.js';
import type {
  DecisionOperationReceipt, IOperationIdentity, IRequestOperationReceipt, OperationReceipt,
} from '../../../domain/participation/operation-receipt.js';
import type { IParticipationChange } from '../../../domain/participation/participation.policy.js';
import type { IRequestListQuery } from '../../../domain/participation/participation-query.js';

export interface ICommitParticipationRequest extends IParticipationChange {
  readonly addonPermit?: IAddonOperationPermit;
  readonly expectedSessionVersion: string;
  readonly receipt: IRequestOperationReceipt;
}

export interface ICommitParticipationDecision extends IParticipationChange {
  readonly addonPermit?: IAddonOperationPermit;
  readonly expectedSessionVersion: string;
  readonly expectedRequestVersion: string;
  readonly receipt: DecisionOperationReceipt;
}

export interface IParticipationStorePort {
  findRequest(siteId: string, requestId: string): Promise<IBookingRequestState | null>;
  listRequests(query: IRequestListQuery): Promise<ICursorPage<IBookingRequestState>>;
  findOperationReceipt(identity: IOperationIdentity): Promise<OperationReceipt | null>;
  /** Commit occupancy, new request and unique receipt together, or write nothing. */
  commitRequest(change: ICommitParticipationRequest): Promise<void>;
  /** Compare both versions; commit occupancy, request, decision audit and receipt together. */
  commitDecision(change: ICommitParticipationDecision): Promise<void>;
}
