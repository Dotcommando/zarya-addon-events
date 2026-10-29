import { createConnection } from 'mongoose';
import { vi } from 'vitest';

import {
  MongooseSessionScheduleStore,
} from '../../src/adapters/outbound/persistence/mongoose/participation/session-schedule-store.adapter.js';
import { CreateSessionSeriesUseCase } from '../../src/app/use-cases/participation/create-session-series.use-case.js';
import { addonPolicy } from '../support/addons.js';
import { scheduleFixture, seriesInput } from '../support/scheduling.js';

describe('schedule persistence boundary', () => {
  it('lists all series using a trusted site filter and stable identity order', async () => {
    const connection = createConnection();
    const store = new MongooseSessionScheduleStore(connection, { check: async () => {} });
    const query = store.series.find();

    vi.spyOn(query, 'exec').mockResolvedValue([]);
    const find = vi.spyOn(store.series, 'find').mockReturnValue(query);
    const sort = vi.spyOn(query, 'sort');

    expect(await store.listSeries('site-1')).toEqual([]);
    expect(find).toHaveBeenCalledWith({ siteId: 'site-1' });
    expect(sort).toHaveBeenCalledWith({ _id: 1 });
    vi.mocked(query.exec).mockRejectedValueOnce(new Error('Unavailable'));
    await expect(store.listSeries('site-1')).rejects.toThrow('Unavailable');
  });
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
