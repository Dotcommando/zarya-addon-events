import type { IAddonOperationPermit } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import type { ClientSession, Connection } from 'mongoose';

import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-change.js';
import type { IHookTransactionRecorder } from './hook-recorder.js';

export interface IAddonWriteFence {
  check(permit: IAddonOperationPermit | undefined, transaction: ClientSession): Promise<void>;
}

export async function guardedWrite<T>(connection: Connection, fence: IAddonWriteFence,
  permit: IAddonOperationPermit | undefined, work: (transaction: ClientSession) => Promise<T>,
  hookChange?: IHookCommitIntent, hooks?: IHookTransactionRecorder): Promise<T> {
  const transaction = await connection.startSession();
  let committing = false;

  try {
    transaction.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    await fence.check(permit, transaction);
    const result = await work(transaction);

    if (hookChange?.facts.length) {
      if (!hooks) {
        throw new Error('Hook transaction recorder is required');
      }
      await hooks.record(hookChange, transaction);
    }

    committing = true;
    await transaction.commitTransaction();

    return result;
  } catch(error) {
    if (!committing) {
      await transaction.abortTransaction().catch(() => undefined);

      if (error instanceof Error && 'code' in error && [112, 244].includes(Number(error.code))) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Concurrent session operation');
      }
    }
    throw error;
  } finally {
    await transaction.endSession();
  }
}
