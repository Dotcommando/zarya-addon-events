import { createConnection } from 'mongoose';
import { vi } from 'vitest';

import {
  MongooseSessionScheduleStore,
} from '../../src/adapters/outbound/persistence/mongoose/participation/session-schedule-store.adapter.js';
import { CreateSessionSeriesUseCase } from '../../src/app/use-cases/participation/create-session-series.use-case.js';
import { addonPolicy } from '../support/addons.js';
import { scheduleFixture, seriesInput } from '../support/scheduling.js';

describe('schedule persistence boundary', () => {
  it('runs series/session creation in one transaction and propagates transaction failure', async () => {
    const f = scheduleFixture();
    const create = new CreateSessionSeriesUseCase(f.store, f.calendar, f.pages, f.access, f.values,
      addonPolicy());
    const result = await create.execute(seriesInput());
    const connection = createConnection();
    const start = vi.spyOn(connection, 'startSession').mockRejectedValueOnce(new Error('transactions unavailable'));
    const store = new MongooseSessionScheduleStore(connection, { check: async () => {} });

    await expect(store.create(result.series, f.sessions)).rejects.toThrow('transactions unavailable');
    expect(start).toHaveBeenCalledOnce();
  });
});
