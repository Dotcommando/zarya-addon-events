import { vi } from 'vitest';

import { CreateSessionSeriesUseCase } from '../../../src/app/use-cases/participation/create-session-series.use-case.js';
import { ListSessionSeriesUseCase } from '../../../src/app/use-cases/participation/list-session-series.use-case.js';
import { addonPolicy } from '../../support/addons.js';
import { scheduleFixture, seriesInput } from '../../support/scheduling.js';

describe('ListSessionSeries', () => {
  it('returns every owned schedule including retained schedules, with no date horizon filter', async () => {
    const f = scheduleFixture();
    const create = new CreateSessionSeriesUseCase(f.store, f.calendar, f.pages, f.access, f.values, addonPolicy());
    const first = await create.execute(seriesInput());

    f.series.push({ ...first.series, siteId: 'foreign', seriesId: 'other' });
    const access = { requireAdministrator: vi.fn(async () => {}) };
    const addon = addonPolicy();
    const authorize = vi.spyOn(addon, 'authorize');
    const result = await new ListSessionSeriesUseCase(f.store, access, addon)
      .execute({ siteId: first.series.siteId, actorId: 'admin' });

    expect(result).toEqual([first.series]);
    expect(access.requireAdministrator).toHaveBeenCalledWith(first.series.siteId, 'admin');
    expect(authorize).toHaveBeenCalledWith(first.series.siteId, 'AdministrationRetained');
  });
  it('rejects unauthorized access and foreign records from a faulty port', async () => {
    const f = scheduleFixture();
    const create = new CreateSessionSeriesUseCase(f.store, f.calendar, f.pages, f.access, f.values, addonPolicy());
    const { series } = await create.execute(seriesInput());
    const access = { requireAdministrator: vi.fn(async () => {}) };
    const operation = new ListSessionSeriesUseCase(f.store, access, addonPolicy());

    vi.spyOn(f.store, 'listSeries').mockResolvedValueOnce([{ ...series, siteId: 'foreign' }]);
    await expect(operation.execute({ siteId: series.siteId, actorId: 'admin' }))
      .rejects.toMatchObject({ code: 'Scope' });
    access.requireAdministrator.mockRejectedValueOnce(new Error('Denied'));
    await expect(operation.execute({ siteId: series.siteId, actorId: 'admin' })).rejects.toThrow('Denied');
  });
});
