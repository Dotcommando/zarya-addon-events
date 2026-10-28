import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { requireCondition, requireInteger } from '@zarya/addon-contracts/validation';

import { type ISessionState, Session } from '../../../domain/participation/session.js';
import {
  type ISessionRule,
  type ISessionSeriesResult,
  type ISessionWrite,
  SessionEditScope,
  validateSessionPattern,
} from '../../../domain/participation/session-series.js';
import type {
  IChangeSessionSchedule,
  IChangeSessionScheduleInput,
} from '../../../ports/inbound/participation/change-session-schedule.port.js';
import type { ISessionScheduleStorePort } from '../../../ports/outbound/participation/session-schedule-store.port.js';
import type {
  ISessionCalendarPort,
  ISessionScheduleAccessPort,
  ISessionScheduleValuesPort,
} from '../../../ports/outbound/participation/session-scheduling.port.js';
import { SessionGenerationService } from '../../services/participation/session-generation.service.js';

export class ChangeSessionScheduleUseCase implements IChangeSessionSchedule {
  constructor(private readonly store: ISessionScheduleStorePort, private readonly calendar: ISessionCalendarPort,
    private readonly access: ISessionScheduleAccessPort, private readonly values: ISessionScheduleValuesPort,
    private readonly addon: IAddonOperationPolicyPort) {}

  async execute(input: IChangeSessionScheduleInput): Promise<ISessionSeriesResult> {
    await this.access.requireEditor(input.siteId, input.actorId);
    const addonPermit = await this.addon.authorize(input.siteId, AddonOperationAccess.AdministrationRetained);

    validateSessionPattern(input.pattern);
    requireInteger(input.capacity, 1, 'capacity');
    requireCondition(Object.values(SessionEditScope).includes(input.scope), 'Invalid edit scope');
    const series = await this.store.findSeries(input.siteId, input.seriesId);

    if (!series) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Series not found');
    }
    if (series.siteId !== input.siteId || series.seriesId !== input.seriesId) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign series');
    }
    if (series.version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Series changed');
    }

    const at = this.values.now();
    const all = await this.store.findSessions(input.siteId, input.seriesId, at);

    for (const session of all) {
      if (session.siteId !== input.siteId || session.seriesId !== input.seriesId) {
        throw new BusinessError(BusinessErrorCode.Scope, 'Foreign session');
      }
    }
    const selected = all.find((s) => s.sessionId === input.sessionId);

    if (input.scope !== SessionEditScope.Series && (!selected || selected.startsAt <= at)) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Future occurrence not found');
    }

    const next = { ...series, version: this.values.nextVersion(), updatedAt: at };
    const writes: ISessionWrite[] = [];

    if (input.scope === SessionEditScope.Occurrence && selected) {
      const time = this.calendar.resolve(input.pattern, input.pattern.startsOn);

      requireCondition(time.startsAt > at, 'Cannot move a session into the past');
      const changed = new Session(selected);

      changed.reschedule({
        ...time,
        timeZone: input.pattern.timeZone,
        capacity: input.capacity,
        overridden: true,
        ruleId: selected.ruleId,
        occurrenceNumber: selected.occurrenceNumber,
      }, this.values.nextVersion());

      writes.push({ session: changed.toState(), expectedVersion: selected.version });
    } else {
      const ruleOrder = new Map(series.rules.map((r, i) => [r.ruleId, i]));
      let eligible = all.filter((s) => s.startsAt > at && s.ruleId !== null && ruleOrder.has(s.ruleId));

      eligible.sort((a, b) => (ruleOrder.get(a.ruleId ?? '') ?? -1) - (ruleOrder.get(b.ruleId ?? '') ?? -1)
        || (a.occurrenceNumber ?? 0) - (b.occurrenceNumber ?? 0));
      const prefix: ISessionRule[] = [];

      if (input.scope === SessionEditScope.Following && selected) {
        const index = eligible.findIndex((s) => s.sessionId === selected.sessionId);

        if (index < 0 || selected.ruleId === null || selected.occurrenceNumber === null) {
          throw new BusinessError(BusinessErrorCode.InvalidTransition,
            'Occurrence no longer belongs to an active rule');
        }
        eligible = eligible.slice(index);

        for (const rule of series.rules) {
          if (rule.ruleId === selected.ruleId) {
            prefix.push({ ...rule, count: selected.occurrenceNumber });
            break;
          }
          prefix.push(rule);
        }
      }

      const rule: ISessionRule = {
        ruleId: this.values.nextId(),
        pattern: structuredClone(input.pattern),
        capacity: input.capacity,
        count: null,
      };

      next.rules = [...prefix, rule];
      next.generatedThrough = this.calendar.horizon(at, input.pattern.timeZone);
      const generator = new SessionGenerationService(this.calendar, this.values);
      const candidates = generator.generate({ ...next, rules: [rule] }, [], at);

      for (let index = 0; index < Math.max(eligible.length, candidates.length); index++) {
        const previous = eligible[index];
        const candidate = candidates[index];
        let session: ISessionState;

        if (previous && candidate) {
          const changed = new Session(previous);
          const schedule = previous.overridden ? previous : candidate;

          changed.reschedule({
            startsAt: schedule.startsAt,
            endsAt: schedule.endsAt,
            timeZone: schedule.timeZone,
            capacity: schedule.capacity,
            overridden: previous.overridden,
            ruleId: candidate.ruleId,
            occurrenceNumber: candidate.occurrenceNumber,
          }, this.values.nextVersion());
          session = changed.toState();
        } else if (previous) {
          const cancelled = new Session(previous);

          cancelled.cancel(this.values.nextVersion());
          session = cancelled.toState();
        } else if (candidate) {
          session = candidate;
        } else {
          continue;
        }
        writes.push({ session, expectedVersion: previous?.version ?? null });
      }
    }
    await this.store.commit(next, input.expectedVersion, writes, addonPermit);

    return { series: next, generatedCount: writes.filter((w) => w.expectedVersion === null).length };
  }
}
