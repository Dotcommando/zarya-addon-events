import { vi } from 'vitest';

import { ChangeSessionPageUseCase } from '../../../src/app/use-cases/participation/change-session-page.use-case.js';
import { SessionStatus } from '../../../src/domain/participation/session.js';
import { addonPolicy } from '../../support/addons.js';
import { fakeHookSource } from '../../support/hook-source.js';
import { sessionFixture, sessionState } from '../../support/session-catalog.js';

describe('ChangeSessionPage', () => {
  const input = {
    siteId: 'site-1',
    actorId: 'operator',
    sessionId: 'session-1',
    pageId: 'page-1',
    expectedVersion: 'session-1-v1',
  };

  it('changes only the chosen game reference, preserving history, occupancy and independent schedule flags',
    async () => {
      const f = sessionFixture();
      const original = {
        ...sessionState(),
        pageId: 'old-page',
        seriesId: 'series',
        ruleId: 'rule',
        occurrenceNumber: 0,
        status: SessionStatus.Cancelled,
        startsAt: new Date('2020-01-01T10:00:00Z'),
        endsAt: new Date('2020-01-01T11:00:00Z'),
      };

      f.states.set('session-1', original);
      const operation = new ChangeSessionPageUseCase(f.store, f.pages, f.access, f.values,
        addonPolicy(), fakeHookSource);
      const result = await operation.execute(input);

      expect(f.states.get('session-1')).toEqual({ ...original, pageId: 'page-1', version: result.version });
      expect(await operation.execute({ ...input, expectedVersion: result.version })).toEqual(result);
      expect(f.store.changePage).toHaveBeenCalledOnce();
      await expect(operation.execute(input)).rejects.toMatchObject({ code: 'StaleWrite' });
    });
  it('rejects unauthorized, missing, foreign and unavailable target pages without changing the meeting', async () => {
    const f = sessionFixture();

    f.states.set('session-1', sessionState());
    const operation = new ChangeSessionPageUseCase(f.store, f.pages, f.access, f.values,
      addonPolicy(), fakeHookSource);

    await expect(operation.execute({ ...input, actorId: 'foreign' })).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(operation.execute({ ...input, sessionId: 'missing' })).rejects.toMatchObject({ code: 'NotFound' });
    await expect(operation.execute({ ...input, pageId: 'foreign' })).rejects.toMatchObject({ code: 'NotFound' });
    vi.mocked(f.store.find).mockResolvedValueOnce({ ...sessionState(), siteId: 'other' });
    await expect(operation.execute(input)).rejects.toMatchObject({ code: 'Scope' });
    expect(f.store.changePage).not.toHaveBeenCalled();
  });
});
