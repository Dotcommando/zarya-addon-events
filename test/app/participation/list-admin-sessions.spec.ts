import { vi } from 'vitest';

import { ListAdminSessionsUseCase } from '../../../src/app/use-cases/participation/list-admin-sessions.use-case.js';
import { SessionStatus } from '../../../src/domain/participation/session.js';
import { addonPolicy } from '../../support/addons.js';
import { sessionFixture, sessionState } from '../../support/session-catalog.js';

describe('ListAdminSessions', () => {
  const input = {
    actorId: 'operator',
    siteId: 'site-1',
    rangeStart: new Date('2026-11-01T10:30:00Z'),
    rangeEnd: new Date('2026-11-02T00:00:00Z'),
  };

  it('paginates every state, includes intersections and binds the optional page selection', async () => {
    const f = sessionFixture();

    f.states.set('a', sessionState('a'));
    f.states.set('b', { ...sessionState('b'), status: SessionStatus.Cancelled, heldPlaces: 7 });
    f.states.set('c', { ...sessionState('c'), siteId: 'other' });
    const list = new ListAdminSessionsUseCase(f.store, f.access, f.values,
      addonPolicy(), { pendingCounts: async () => new Map() });
    const first = await list.execute({ ...input, limit: 1 });

    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({ sessionId: 'a', status: 'Scheduled', availablePlaces: 5 });
    const second = await list.execute({ ...input, limit: 1, cursor: first.nextCursor });

    expect(second.items[0]).toMatchObject({ sessionId: 'b', status: 'Cancelled', availablePlaces: 0, bookable: false });
    expect((await list.execute({ ...input, pageId: 'missing' })).items).toEqual([]);
  });
  it('rejects invalid ranges/limits, denied reads and inconsistent returned scope', async () => {
    const f = sessionFixture();
    const list = new ListAdminSessionsUseCase(f.store, f.access, f.values,
      addonPolicy(), { pendingCounts: async () => new Map() });

    await expect(list.execute({ ...input, rangeEnd: input.rangeStart })).rejects.toMatchObject({ code: 'Validation' });
    await expect(list.execute({ ...input, limit: 101 })).rejects.toMatchObject({ code: 'Validation' });
    await expect(list.execute({ ...input, actorId: 'untrusted' })).rejects.toMatchObject({ code: 'Forbidden' });
    vi.mocked(f.store.list).mockResolvedValueOnce({
      items: [{ ...sessionState(), siteId: 'other' }], nextCursor: null,
    });
    await expect(list.execute(input)).rejects.toMatchObject({ code: 'Scope' });
    vi.mocked(f.store.list).mockResolvedValueOnce({ items: [sessionState('b'), sessionState('a')], nextCursor: null });
    await expect(list.execute(input)).rejects.toMatchObject({ code: 'Scope' });
  });

  it('returns pending request counts separately from reserved places for each listed session', async () => {
    const f = sessionFixture();

    f.states.set('a', { ...sessionState('a'), heldPlaces: 4 });
    f.states.set('b', sessionState('b'));
    const pendingCounts = vi.fn().mockResolvedValue(new Map([['a', 2]]));
    const list = new ListAdminSessionsUseCase(f.store, f.access, f.values, addonPolicy(), {
      pendingCounts,
    });    const result = await list.execute(input);

    expect(result.items.map(item => ({ sessionId: item.sessionId, pendingRequestCount: item.pendingRequestCount })))
      .toEqual([{ sessionId: 'a', pendingRequestCount: 2 }, { sessionId: 'b', pendingRequestCount: 0 }]);
    expect(pendingCounts).toHaveBeenCalledWith('site-1', ['a', 'b']);
    await expect(list.execute({ ...input, actorId: 'untrusted' })).rejects.toMatchObject({ code: 'Forbidden' });
    expect(pendingCounts).toHaveBeenCalledOnce();
  });
});
