import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { requireInteger } from '@zarya/addon-contracts/validation';

import {
  type ISessionSeriesResult,
  type ISessionSeriesState,
  validateSeries,
  validateSessionPattern,
} from '../../../domain/participation/session-series.js';
import type {
  ICreateSessionSeries,
  ICreateSessionSeriesInput,
} from '../../../ports/inbound/participation/create-session-series.port.js';
import type { ISessionScheduleStorePort } from '../../../ports/outbound/participation/session-schedule-store.port.js';
import type {
  ISessionCalendarPort,
  ISessionScheduleAccessPort,
  ISessionScheduleValuesPort,
  ISessionSeriesPagePort,
} from '../../../ports/outbound/participation/session-scheduling.port.js';
import { SessionGenerationService } from '../../services/participation/session-generation.service.js';

export class CreateSessionSeriesUseCase implements ICreateSessionSeries {
  constructor(private readonly store: ISessionScheduleStorePort, private readonly calendar: ISessionCalendarPort,
    private readonly pages: ISessionSeriesPagePort, private readonly access: ISessionScheduleAccessPort,
    private readonly values: ISessionScheduleValuesPort,
    private readonly addon: IAddonOperationPolicyPort) {}

  async execute(input: ICreateSessionSeriesInput): Promise<ISessionSeriesResult> {
    await this.access.requireEditor(input.siteId, input.actorId);
    const addonPermit = await this.addon.authorize(input.siteId, AddonOperationAccess.AdministrationEnabled);

    validateSessionPattern(input.pattern);
    requireInteger(input.capacity, 1, 'capacity');
    await this.pages.requirePage(input.siteId, input.pageId);
    const at = this.values.now();
    const series: ISessionSeriesState = {
      seriesId: this.values.nextId(),
      siteId: input.siteId,
      pageId: input.pageId,
      rules: [{
        ruleId: this.values.nextId(),
        pattern: structuredClone(input.pattern),
        capacity: input.capacity,
        count: null,
      }],
      generatedThrough: this.calendar.horizon(at, input.pattern.timeZone),
      nextExpansionAt: new Date(at.getTime() + 7 * 24 * 60 * 60 * 1000),
      version: this.values.nextVersion(),
      createdAt: at,
      updatedAt: at,
    };

    validateSeries(series);
    const sessions = new SessionGenerationService(this.calendar, this.values).generate(series, [], at);

    await this.store.create(series, sessions, addonPermit);

    return { series, generatedCount: sessions.length };
  }
}
