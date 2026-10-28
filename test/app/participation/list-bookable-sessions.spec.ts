import { vi } from 'vitest';

import {
  ListBookableSessionsUseCase,
} from '../../../src/app/use-cases/participation/list-bookable-sessions.use-case.js';
import { SessionStatus } from '../../../src/domain/participation/session.js';
import {
  SessionAvailabilityFilter, SessionStatusFilter, SessionTimeFilter,
} from '../../../src/domain/participation/session-catalog.js';
import { addonPolicy } from '../../support/addons.js';
import { sessionFixture, sessionState } from '../../support/session-catalog.js';

describe('ListBookableSessions', () => {
  const input = {
    siteId: 'site-1',
    pageId: 'page-1',
    rangeStart: new Date('2026-01-01T00:00:00Z'),
    rangeEnd: new Date('2027-01-01T00:00:00Z'),
  };

  it('defaults to future Scheduled meetings including full ones and projects no private scheduling data', async () => {
    const f = sessionFixture();

    f.states.set('a', sessionState('a'));
    f.states.set('b', { ...sessionState('b'), heldPlaces: 7 });
    f.states.set('c', { ...sessionState('c'), status: SessionStatus.Cancelled });
    f.states.set('d', {
      ...sessionState('d'), startsAt: new Date('2026-02-01T10:00:00Z'), endsAt: new Date('2026-02-01T11:00:00Z'),
    });
    const list = new ListBookableSessionsUseCase(f.store, f.publicPages, f.values,
      addonPolicy());
    const result = await list.execute(input);

    expect(result.items.map((s) => [s.sessionId, s.bookable])).toEqual([['a', true], ['b', false]]);
    expect(result.items[0]).not.toHaveProperty('siteId');
    expect(result.items[0]).not.toHaveProperty('version');
    expect(result.items[0]).not.toHaveProperty('heldPlaces');
    const available = await list.execute({ ...input, filter: { availability: SessionAvailabilityFilter.Available } });

    expect(available.items.map((s) => s.sessionId)).toEqual(['a']);
    const history = await list.execute({
      ...input, filter: { time: SessionTimeFilter.All, status: SessionStatusFilter.All },
    });

    expect(history.items).toHaveLength(4);
    expect(history.items.find((s) => s.sessionId === 'c')).toMatchObject({ status: 'Cancelled', bookable: false });
  });
  it('closes booking exactly at startsAt and requires active-publication page eligibility', async () => {
    const f = sessionFixture();

    f.states.set('a', { ...sessionState('a'), startsAt: f.values.now(), endsAt: new Date('2026-10-25T12:00:00Z') });
    const list = new ListBookableSessionsUseCase(f.store, f.publicPages, f.values,
      addonPolicy());

    expect((await list.execute({ ...input, filter: { time: SessionTimeFilter.All } })).items[0]?.bookable).toBe(false);
    expect((await list.execute(input)).items).toEqual([]);
    vi.mocked(f.publicPages.isPublished).mockResolvedValueOnce(false);
    await expect(list.execute(input)).rejects.toMatchObject({ code: 'NotFound' });
    vi.mocked(f.store.list).mockResolvedValueOnce({
      items: [{ ...sessionState(), siteId: 'foreign' }], nextCursor: null,
    });
    await expect(list.execute(input)).rejects.toMatchObject({ code: 'Scope' });
    vi.mocked(f.publicPages.isPublished).mockRejectedValueOnce(new Error('Publication unavailable'));
    await expect(list.execute(input)).rejects.toThrow('Publication unavailable');
  });
});
