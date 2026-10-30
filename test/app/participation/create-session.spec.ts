import { vi } from 'vitest';

import { CreateSessionUseCase } from '../../../src/app/use-cases/participation/create-session.use-case.js';
import { addonPolicy } from '../../support/addons.js';
import { fakeHookSource } from '../../support/hook-source.js';
import { oneOffInput, sessionFixture } from '../../support/session-catalog.js';

describe('CreateSession', () => {
  it('does not create a meeting when its own extension check denies the action', async () => {
    const f = sessionFixture();
    const hooks = {
      prepare: vi.fn(async () => {
        throw new Error('Own hook denied');
      }),
    };
    const operation = new CreateSessionUseCase(f.store, f.pages, f.access, f.values, addonPolicy(), hooks);

    await expect(operation.execute(oneOffInput)).rejects.toThrow('Own hook denied');
    expect(f.store.create).not.toHaveBeenCalled();
  });
  it('creates an owned one-off meeting with no occupied places and permits past and overlapping meetings', async () => {
    const f = sessionFixture();
    const create = new CreateSessionUseCase(f.store, f.pages, f.access, f.values,
      addonPolicy(), fakeHookSource);
    const input = {
      ...oneOffInput, startsAt: new Date('2026-01-01T10:00:00Z'), endsAt: new Date('2026-01-01T11:00:00Z'),
    };
    const first = await create.execute(input);
    const second = await create.execute(input);

    expect(first.toState()).toMatchObject({
      siteId: 'site-1',
      pageId: 'page-1',
      seriesId: null,
      status: 'Scheduled',
      capacity: 10,
      heldPlaces: 0,
      confirmedPlaces: 0,
    });
    expect(second.toState().sessionId).not.toBe(first.toState().sessionId);
    expect(f.states.size).toBe(2);
  });
  it('rejects unauthorized, foreign page and invalid interval/capacity/timezone without writes', async () => {
    const f = sessionFixture();
    const create = new CreateSessionUseCase(f.store, f.pages, f.access, f.values,
      addonPolicy(), fakeHookSource);

    await expect(create.execute({ ...oneOffInput, actorId: 'untrusted' })).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(create.execute({ ...oneOffInput, pageId: 'foreign' })).rejects.toMatchObject({ code: 'NotFound' });

    for (const change of [{ endsAt: oneOffInput.startsAt }, { capacity: 0 }, { timeZone: 'invalid' }]) {
      await expect(create.execute({ ...oneOffInput, ...change })).rejects.toMatchObject({ code: 'Validation' });
    }
    expect(f.store.create).not.toHaveBeenCalled();
    vi.mocked(f.store.create).mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(create.execute(oneOffInput)).rejects.toThrow('Storage unavailable');
  });
});
