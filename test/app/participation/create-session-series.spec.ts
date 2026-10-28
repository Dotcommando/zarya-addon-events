import { CreateSessionSeriesUseCase } from '../../../src/app/use-cases/participation/create-session-series.use-case.js';
import { addonPolicy } from '../../support/addons.js';
import { scheduleFixture, seriesInput } from '../../support/scheduling.js';

describe('CreateSessionSeries', () => {
  it('creates a page-owned unbounded series with a finite one-year calendar', async () => {
    const f = scheduleFixture();
    const create = new CreateSessionSeriesUseCase(f.store, f.calendar, f.pages, f.access, f.values,
      addonPolicy());
    const result = await create.execute(seriesInput());

    expect(result.series).toMatchObject({ siteId: 'site', pageId: 'page', generatedThrough: '2027-01-01' });
    expect(result.generatedCount).toBe(2);
    expect(f.sessions.map((s) => s.pageId)).toEqual(['page', 'page']);
    expect(f.sessions.every((s) => s.heldPlaces === 0 && s.confirmedPlaces === 0)).toBe(true);
  });
  it('rejects authorization, foreign pages and invalid patterns before persistence', async () => {
    const f = scheduleFixture();
    const operation = new CreateSessionSeriesUseCase(f.store, f.calendar, f.pages, f.access, f.values,
      addonPolicy());

    await expect(operation.execute({ ...seriesInput(), capacity: 0 })).rejects.toThrow();
    f.pages.requirePage = async () => {
      throw new Error('foreign page');
    };
    await expect(operation.execute(seriesInput())).rejects.toThrow('foreign page');
    expect(f.series).toHaveLength(0);
  });
});
