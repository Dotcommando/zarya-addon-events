import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';

import type { ISessionSeriesState } from '../../../domain/participation/session-series.js';
import type {
  IGetSessionSeries, IGetSessionSeriesInput,
} from '../../../ports/inbound/participation/get-session-series.port.js';
import type { ISessionCatalogAccessPort } from '../../../ports/outbound/participation/session-catalog-access.port.js';
import type { ISessionScheduleStorePort } from '../../../ports/outbound/participation/session-schedule-store.port.js';

export class GetSessionSeriesUseCase implements IGetSessionSeries {
  constructor(private readonly store: ISessionScheduleStorePort, private readonly access: ISessionCatalogAccessPort,
    private readonly addon: IAddonOperationPolicyPort) {}

  async execute(input: IGetSessionSeriesInput): Promise<ISessionSeriesState> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    await this.addon.authorize(input.siteId, AddonOperationAccess.AdministrationRetained);
    const series = await this.store.findSeries(input.siteId, input.seriesId);

    if (!series) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Series not found');
    }
    if (series.siteId !== input.siteId || series.seriesId !== input.seriesId) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign series');
    }

    return series;
  }
}
