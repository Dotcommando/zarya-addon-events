import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { requireCondition } from '@zarya/addon-contracts/validation';

import type { IOperationIdentity, OperationReceipt } from './operation-receipt.js';

export function requireParticipationKey(key: string): void {
  requireCondition(/^[A-Za-z0-9._:-]{1,128}$/.test(key), 'Invalid participation operation key');
}

export function requireMatchingReceipt(receipt: OperationReceipt, identity: IOperationIdentity,
  inputIdentity: string): void {
  if (receipt.identity.siteId !== identity.siteId || receipt.identity.operation !== identity.operation
    || receipt.identity.actorId !== identity.actorId || receipt.identity.idempotencyKey !== identity.idempotencyKey) {
    throw new BusinessError(BusinessErrorCode.Scope, 'Foreign participation receipt');
  }
  if (receipt.inputIdentity !== inputIdentity) {
    throw new BusinessError(BusinessErrorCode.IdempotencyConflict, 'Operation key was used for different input');
  }
}
