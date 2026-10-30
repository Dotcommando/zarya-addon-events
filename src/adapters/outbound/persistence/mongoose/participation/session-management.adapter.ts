import type { IAddonOperationPermit } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import type { Connection } from 'mongoose';

import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-change.js';
import { type ISessionState, SessionStatus } from '../../../../../domain/participation/session.js';
import type {
  ISessionManagementPort,
} from '../../../../../ports/outbound/participation/session-management.port.js';
import { guardedWrite, type IAddonWriteFence } from './addon-write-fence.js';
import type { IHookTransactionRecorder } from './hook-recorder.js';
import { participationModels } from './participation.records.js';
import { removedSessionModel, sessionModel, sessionRecord } from './session.records.js';

export class MongooseSessionManagement implements ISessionManagementPort {
  constructor(private readonly connection: Connection,
    private readonly fence: IAddonWriteFence, private readonly hooks?: IHookTransactionRecorder) {}

  async hasRequests(siteId: string, sessionId: string): Promise<boolean> {
    return await participationModels(this.connection).requests.exists({ siteId, sessionId }) !== null;
  }

  async remove(state: ISessionState,
    expectedVersion: string, permit: IAddonOperationPermit, hookChange?: IHookCommitIntent): Promise<void> {
    await guardedWrite(this.connection, this.fence, permit, async(transaction) => {
      const request = await participationModels(this.connection).requests
        .exists({ siteId: state.siteId, sessionId: state.sessionId }).session(transaction);

      if (request) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Requests changed');
      }

      const result = await sessionModel(this.connection).deleteOne(
        { _id: state.sessionId, siteId: state.siteId, version: expectedVersion },
        { session: transaction },
      ).exec();

      if (result.deletedCount !== 1) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Session changed');
      }
      if (state.seriesId !== null) {
        await removedSessionModel(this.connection).create([
          sessionRecord({ ...state, status: SessionStatus.Cancelled, overridden: true }),
        ], { session: transaction });
      }
    }, hookChange, this.hooks);
  }

  async reschedule(state: ISessionState, expectedVersion: string, permit: IAddonOperationPermit): Promise<void> {
    await guardedWrite(this.connection, this.fence, permit, async(transaction) => {
      const { _id, ...fields } = sessionRecord(state);
      const result = await sessionModel(this.connection).updateOne(
        { _id, siteId: state.siteId, version: expectedVersion },
        { $set: fields },
        { session: transaction },
      ).exec();

      if (result.matchedCount !== 1) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Session changed');
      }
    });
  }
}
