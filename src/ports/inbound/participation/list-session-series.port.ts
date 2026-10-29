import type { ISessionSeriesState } from '../../../domain/participation/session-series.js';

export interface IListSessionSeriesInput { readonly siteId: string; readonly actorId: string; }

export interface IListSessionSeries {
  execute(input: IListSessionSeriesInput): Promise<readonly ISessionSeriesState[]>;
}
