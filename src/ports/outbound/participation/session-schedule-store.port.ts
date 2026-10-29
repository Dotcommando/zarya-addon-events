import type { IAddonOperationPermit } from '@zarya/addon-contracts/addons';

import type { ISessionState } from '../../../domain/participation/session.js';
import type { ISessionSeriesState, ISessionWrite } from '../../../domain/participation/session-series.js';

export interface ISessionScheduleStorePort {
  listSeries(siteId: string): Promise<readonly ISessionSeriesState[]>;
  findSeries(siteId: string, seriesId: string): Promise<ISessionSeriesState | null>;
  findSessions(siteId: string, seriesId: string, from?: Date): Promise<readonly ISessionState[]>;
  findOccurrences(siteId: string, seriesId: string,
    keys: readonly { readonly ruleId: string; readonly occurrenceNumber: number }[]): Promise<readonly ISessionState[]>;
  create(series: ISessionSeriesState, sessions: readonly ISessionState[],
    addonPermit?: IAddonOperationPermit): Promise<void>;
  commit(series: ISessionSeriesState, expectedVersion: string, sessions: readonly ISessionWrite[],
    addonPermit?: IAddonOperationPermit): Promise<void>;
  listDue(at: Date, afterSeriesId: string | null, limit: number): Promise<readonly ISessionSeriesState[]>;
}
