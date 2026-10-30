import type { ClientSession } from 'mongoose';

import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-change.js';

export interface IHookTransactionRecorder {
  record(intent: IHookCommitIntent, transaction: ClientSession): Promise<void>;
}
