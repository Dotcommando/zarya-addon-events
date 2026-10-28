import type { ISessionPattern, ISessionSeriesResult } from '../../../domain/participation/session-series.js';

export interface ICreateSessionSeriesInput {
  readonly siteId: string;
  readonly actorId: string;
  readonly pageId: string;
  readonly pattern: ISessionPattern;
  readonly capacity: number;
}

export interface ICreateSessionSeries {
  execute(input: ICreateSessionSeriesInput): Promise<ISessionSeriesResult>;
}
