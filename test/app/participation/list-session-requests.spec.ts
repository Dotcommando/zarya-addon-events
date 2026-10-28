import { vi } from 'vitest';

import { ListSessionRequestsUseCase } from '../../../src/app/use-cases/participation/list-session-requests.use-case.js';
import {
  RequestParticipationUseCase,
} from '../../../src/app/use-cases/participation/request-participation.use-case.js';
import { ParticipationState } from '../../../src/domain/participation/participation-state.enum.js';
import { addonPolicy } from '../../support/addons.js';
import { participationFixture, participationInput } from '../../support/participation.js';

describe('ListSessionRequests', () => {
  const input = { siteId: 'site-1', actorId: 'operator', sessionId: 'session-1' };

  it('paginates contacts and quantities with state filtering and opaque request references', async () => {
    const f = participationFixture();
    const request = new RequestParticipationUseCase(f.store, f.sessions.store, f.sessions.publicPages,
      f.values, f.identity,
      addonPolicy());

    await request.execute({ ...participationInput, idempotencyKey: 'one' });
    await request.execute({ ...participationInput, idempotencyKey: 'two' });
    const list = new ListSessionRequestsUseCase(f.store, f.sessions.store, f.sessions.access,
      addonPolicy());
    const first = await list.execute({ ...input, limit: 1 });
    const second = await list.execute({ ...input, limit: 1, cursor: first.nextCursor });

    expect(first.items[0]).toMatchObject({ places: 3, state: 'Pending', contact: { name: 'Alice' } });
    expect(first.items[0]).toHaveProperty('requestReference');
    expect(second.items[0]?.requestId).not.toBe(first.items[0]?.requestId);
    expect((await list.execute({ ...input, state: ParticipationState.Confirmed })).items).toEqual([]);
    await expect(list.execute({ ...input, actorId: 'foreign' })).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(list.execute({ ...input, sessionId: 'missing' })).rejects.toMatchObject({ code: 'NotFound' });
  });
  it('rejects bad bounds and foreign contact rows even if a backing store returns them', async () => {
    const f = participationFixture();

    await new RequestParticipationUseCase(f.store, f.sessions.store, f.sessions.publicPages, f.values,
      f.identity,
      addonPolicy()).execute(participationInput);
    const row = [...f.requests.values()][0]!;
    const list = new ListSessionRequestsUseCase(f.store, f.sessions.store, f.sessions.access,
      addonPolicy());

    await expect(list.execute({ ...input, limit: 101 })).rejects.toMatchObject({ code: 'Validation' });
    vi.mocked(f.store.listRequests).mockResolvedValueOnce({ items: [{ ...row, siteId: 'foreign' }], nextCursor: null });
    await expect(list.execute(input)).rejects.toMatchObject({ code: 'Scope' });
    vi.mocked(f.store.listRequests).mockResolvedValueOnce({
      items: [{ ...row, sessionId: 'foreign' }],
      nextCursor: null,
    });
    await expect(list.execute(input)).rejects.toMatchObject({ code: 'Scope' });
  });
});
