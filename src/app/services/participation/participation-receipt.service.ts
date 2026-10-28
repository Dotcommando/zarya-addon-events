import type { IOperationIdentity, OperationReceipt } from '../../../domain/participation/operation-receipt.js';
import type { IParticipationStorePort } from '../../../ports/outbound/participation/participation-store.port.js';

/** Receipt reconciliation never treats absence during an uncertain commit as proof of failure. */
export async function findReceiptAfterFailure(store: IParticipationStorePort,
  identity: IOperationIdentity): Promise<OperationReceipt | null> {
  try {
    return await store.findOperationReceipt(identity);
  } catch {
    return null;
  }
}
