import { vi } from 'vitest';

import { GetAdminSessionUseCase } from '../../../src/app/use-cases/participation/get-admin-session.use-case.js';
import { SessionStatus } from '../../../src/domain/participation/session.js';
import { addonPolicy } from '../../support/addons.js';
import { sessionFixture, sessionState } from '../../support/session-catalog.js';

describe('GetAdminSession', () => {
  it('returns an owned safe projection including cancellation and occupancy, or null', async () => {
    const f = sessionFixture();

    f.states.set('session-1', { ...sessionState(), status: SessionStatus.Cancelled });
    const get = new GetAdminSessionUseCase(f.store, f.access, f.values,
      addonPolicy());
    const input = { siteId: 'site-1', actorId: 'operator', sessionId: 'session-1' };

    expect(await get.execute(input)).toMatchObject({
      sessionId: 'session-1',
      status: 'Cancelled',
      heldPlaces: 2,
      confirmedPlaces: 3,
      availablePlaces: 5,
      bookable: false,
      version: 'session-1-v1',
    });
    expect(await get.execute({ ...input, sessionId: 'missing' })).toBeNull();
    expect(await get.execute({ ...input, siteId: 'other' })).toBeNull();
    await expect(get.execute({ ...input, actorId: 'untrusted' })).rejects.toMatchObject({ code: 'Forbidden' });
  });
  it('rejects inconsistent store ownership/identity rather than leaking another session', async () => {
    const f = sessionFixture();
    const get = new GetAdminSessionUseCase(f.store, f.access, f.values,
      addonPolicy());
    const input = { siteId: 'site-1', actorId: 'operator', sessionId: 'session-1' };

    vi.mocked(f.store.find).mockResolvedValueOnce({ ...sessionState(), siteId: 'other' });
    await expect(get.execute(input)).rejects.toMatchObject({ code: 'Scope' });
    vi.mocked(f.store.find).mockResolvedValueOnce(sessionState('different'));
    await expect(get.execute(input)).rejects.toMatchObject({ code: 'Scope' });
  });
});
