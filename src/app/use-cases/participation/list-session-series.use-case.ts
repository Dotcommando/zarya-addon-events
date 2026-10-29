import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';

import type { ISessionSeriesState } from '../../../domain/participation/session-series.js';
import type {
  IListSessionSeries, IListSessionSeriesInput,
} from '../../../ports/inbound/participation/list-session-series.port.js';
import type { ISessionCatalogAccessPort } from '../../../ports/outbound/participation/session-catalog-access.port.js';
import type { ISessionScheduleStorePort } from '../../../ports/outbound/participation/session-schedule-store.port.js';

export class ListSessionSeriesUseCase implements IListSessionSeries {
  constructor(private readonly store: Pick<ISessionScheduleStorePort, 'listSeries'>,
    private readonly access: ISessionCatalogAccessPort, private readonly addon: IAddonOperationPolicyPort) {}

  async execute(input: IListSessionSeriesInput): Promise<readonly ISessionSeriesState[]> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    await this.addon.authorize(input.siteId, AddonOperationAccess.AdministrationRetained);
    const items = await this.store.listSeries(input.siteId);

    if (items.some((item) => item.siteId !== input.siteId)) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign series');
    }

    return items;
  }
}
