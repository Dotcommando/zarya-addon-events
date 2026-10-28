import { SessionHorizonService } from '../../../src/app/services/participation/session-horizon.service.js';
import { CreateSessionSeriesUseCase } from '../../../src/app/use-cases/participation/create-session-series.use-case.js';
import { SessionStatus } from '../../../src/domain/participation/session.js';
import { addonPolicy } from '../../support/addons.js';
import { scheduleFixture, seriesInput } from '../../support/scheduling.js';

describe('rolling session horizon', () => {
  it('processes all keyset batches rather than silently stopping after 100 series', async () => {
    const f = scheduleFixture();
    const create = new CreateSessionSeriesUseCase(f.store, f.calendar, f.pages, f.access, f.values,
      addonPolicy());

    for (let index = 0; index < 102; index++) {
      await create.execute(seriesInput());
    }
    f.setNow(new Date('2026-01-09T00:00:00Z'));
    await new SessionHorizonService(f.store, f.calendar, f.values,
      addonPolicy()).extendDue();
    expect(f.series.every((s) => s.nextExpansionAt > f.values.now())).toBe(true);
  });
  it('catches up after downtime without duplicates and preserves cancellation exceptions', async () => {
    const f = scheduleFixture();

    await new CreateSessionSeriesUseCase(f.store, f.calendar, f.pages, f.access, f.values,
      addonPolicy()).execute(seriesInput());
    const service = new SessionHorizonService(f.store, f.calendar, f.values,
      addonPolicy());

    f.setNow(new Date('2026-01-09T00:00:00Z'));
    const first = f.sessions[1];

    if (!first) {
      throw new Error('fixture');
    }
    f.sessions[1] = {
      ...first,
      startsAt: new Date('2026-01-08T10:00:00Z'),
      endsAt: new Date('2026-01-08T11:00:00Z'),
      status: SessionStatus.Cancelled,
      overridden: true,
    };
    f.occurrences.push({
      occurrenceNumber: 2,
      localDate: '2026-01-17',
      startsAt: new Date('2026-01-17T10:00:00Z'),
      endsAt: new Date('2026-01-17T11:00:00Z'),
    });
    await service.extendDue();
    expect(f.sessions).toHaveLength(3);
    await service.extendDue();
    expect(f.sessions).toHaveLength(3);
    expect(f.series[0]?.nextExpansionAt).toEqual(new Date('2026-01-16T00:00:00Z'));
  });
});
