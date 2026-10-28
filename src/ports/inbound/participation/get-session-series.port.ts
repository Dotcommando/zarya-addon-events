import type { ISessionSeriesState } from '../../../domain/participation/session-series.js';

export interface IGetSessionSeriesInput { readonly siteId: string;readonly actorId: string;readonly seriesId: string; }

export interface IGetSessionSeries { execute(input: IGetSessionSeriesInput): Promise<ISessionSeriesState>; }
