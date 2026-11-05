import type { Connection, Model } from 'mongoose';

import { ParticipationState } from '../../../../../domain/participation/participation-state.enum.js';
import type {
  IPendingRequestCountsPort,
} from '../../../../../ports/outbound/participation/pending-request-counts.port.js';
import { type IParticipationRequestRecord, participationModels } from './participation.records.js';

export class MongoosePendingRequestCounts implements IPendingRequestCountsPort {
  readonly requests: Model<IParticipationRequestRecord>;

  constructor(connection: Connection) {
    this.requests = participationModels(connection).requests;
  }

  async pendingCounts(siteId: string, sessionIds: readonly string[]): Promise<ReadonlyMap<string, number>> {
    if (!sessionIds.length) {
      return new Map();
    }

    const rows = await this.requests.aggregate<{ _id: string; count: number }>([
      { $match: { siteId, sessionId: { $in: [...sessionIds] }, state: ParticipationState.Pending } },
      { $group: { _id: '$sessionId', count: { $sum: 1 } } },
    ]).exec();

    return new Map(rows.map(row => [row._id, row.count]));
  }
}
