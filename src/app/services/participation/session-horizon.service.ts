import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';

import type { ISessionScheduleStorePort } from '../../../ports/outbound/participation/session-schedule-store.port.js';
import type {
  ISessionCalendarPort,
  ISessionScheduleValuesPort,
} from '../../../ports/outbound/participation/session-scheduling.port.js';
import { SessionGenerationService } from './session-generation.service.js';

export class SessionHorizonService {
  constructor(private readonly store: ISessionScheduleStorePort, private readonly calendar: ISessionCalendarPort,
    private readonly values: ISessionScheduleValuesPort,
    private readonly addon: IAddonOperationPolicyPort) {}

  async extendDue(): Promise<void> {
    const at = this.values.now();
    let cursor: string | null = null;

    while (true) {
      const batch = await this.store.listDue(at, cursor, 100);

      if (!batch.length) {
        return;
      }

      for (const series of batch) {
        cursor = series.seriesId;
        let addonPermit;

        try {
          addonPermit = await this.addon.authorize(series.siteId, AddonOperationAccess.BackgroundEnabled);
        } catch(error) {
          if (error instanceof BusinessError && error.code === BusinessErrorCode.AddonDisabled) {
            continue;
          }
          throw error;
        }
        const generator = new SessionGenerationService(this.calendar, this.values);
        const candidates = generator.generate(series, [], at);
        const keys = candidates.flatMap((s) => s.ruleId !== null && s.occurrenceNumber !== null
          ? [{ ruleId: s.ruleId, occurrenceNumber: s.occurrenceNumber }] : []);
        const existing = await this.store.findOccurrences(series.siteId, series.seriesId, keys);
        const sessions = candidates.filter((s) => !existing.some((old) =>
          old.ruleId === s.ruleId && old.occurrenceNumber === s.occurrenceNumber));
        const zone = series.rules.at(-1)?.pattern.timeZone;

        if (!zone) {
          throw new Error('Series has no time zone');
        }

        try {
          await this.store.commit({
            ...series,
            generatedThrough: this.calendar.horizon(at, zone),
            nextExpansionAt: new Date(at.getTime() + 7 * 24 * 60 * 60 * 1000),
            updatedAt: at,
            version: this.values.nextVersion(),
          }, series.version,
          sessions.map((session) => ({ session, expectedVersion: null })), addonPermit);
        } catch (error) {
          if (!(error instanceof BusinessError)
            || ![BusinessErrorCode.StaleWrite, BusinessErrorCode.AddonDisabled].includes(error.code)) {
            throw error;
          }
        }
        cursor = series.seriesId;
      }
    }
  }
}
