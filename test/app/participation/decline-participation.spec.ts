import { vi } from 'vitest';

import {
  DeclineParticipationUseCase,
} from '../../../src/app/use-cases/participation/decline-participation.use-case.js';
import {
  RequestParticipationUseCase,
} from '../../../src/app/use-cases/participation/request-participation.use-case.js';
import { SessionStatus } from '../../../src/domain/participation/session.js';
import { addonPolicy } from '../../support/addons.js';
import { participationFixture, participationInput } from '../../support/participation.js';

describe('DeclineParticipation', () => {
  it('releases the whole group on cancelled historical meetings and replays without releasing twice', async () => {
    const f = participationFixture();

    await new RequestParticipationUseCase(f.store, f.sessions.store, f.sessions.publicPages, f.values,
      f.identity,
      addonPolicy()).execute(participationInput);
    const row = [...f.requests.values()][0]!;

    f.sessions.states.set('session-1', { ...f.sessions.states.get('session-1')!, status: SessionStatus.Cancelled });
    f.sessions.values.now = () => new Date('2026-12-01T11:00:00Z');
    const decline = new DeclineParticipationUseCase(f.store, f.sessions.store, f.sessions.access, f.values, f.identity,
      addonPolicy());
    const input = {
      siteId: 'site-1',
      actorId: 'operator',
      requestId: row.requestId,
      expectedRequestVersion: row.version,
      idempotencyKey: 'decline-one',
    };
    const result = await decline.execute(input);

    expect(result.state).toBe('Declined');
    expect(f.sessions.states.get('session-1')).toMatchObject({
      heldPlaces: 0,
      confirmedPlaces: 0,
      status: 'Cancelled',
    });
    expect(await decline.execute(input)).toEqual(result);
    expect(f.store.commitDecision).toHaveBeenCalledOnce();
    await expect(decline.execute({ ...input, expectedRequestVersion: result.requestVersion, idempotencyKey: 'fresh' }))
      .rejects.toMatchObject({ code: 'InvalidTransition' });
  });
  it('rejects stale or unauthorized decisions and recovers a committed decision after a lost acknowledgement',
    async () => {
      const f = participationFixture();

      await new RequestParticipationUseCase(f.store, f.sessions.store, f.sessions.publicPages, f.values,
        f.identity,
        addonPolicy()).execute(participationInput);
      const row = [...f.requests.values()][0]!;
      const decline = new DeclineParticipationUseCase(f.store, f.sessions.store, f.sessions.access, f.values,
        f.identity,
        addonPolicy());
      const input = {
        siteId: 'site-1',
        actorId: 'operator',
        requestId: row.requestId,
        expectedRequestVersion: row.version,
        idempotencyKey: 'decline-one',
      };

      await expect(decline.execute({ ...input, actorId: 'foreign' })).rejects.toMatchObject({ code: 'Forbidden' });
      await expect(decline.execute({ ...input, expectedRequestVersion: 'old' }))
        .rejects.toMatchObject({ code: 'StaleWrite' });
      const commit = vi.mocked(f.store.commitDecision).getMockImplementation()!;

      vi.mocked(f.store.commitDecision).mockImplementationOnce(async (change) => {
        await commit(change);
        throw new Error('Lost acknowledgement');
      });
      expect(await decline.execute(input)).toHaveProperty('state', 'Declined');
      expect(f.sessions.states.get('session-1')?.heldPlaces).toBe(0);
    });
});
