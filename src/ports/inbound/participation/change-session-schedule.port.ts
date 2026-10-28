import type {
  ISessionPattern,
  ISessionSeriesResult,
  SessionEditScope,
} from '../../../domain/participation/session-series.js';

export interface IChangeSessionScheduleInput {
  readonly siteId: string;
  readonly actorId: string;
  readonly seriesId: string;
  readonly expectedVersion: string;
  readonly scope: SessionEditScope;
  readonly sessionId: string | null;
  readonly pattern: ISessionPattern;
  readonly capacity: number;
}

export interface IChangeSessionSchedule {
  execute(input: IChangeSessionScheduleInput): Promise<ISessionSeriesResult>;
}
