import { vi } from 'vitest';

import { CancelSessionUseCase } from '../../../src/app/use-cases/participation/cancel-session.use-case.js';
import { addonPolicy } from '../../support/addons.js';
import { sessionFixture, sessionState } from '../../support/session-catalog.js';

describe('CancelSession', () => {
  const input = { siteId: 'site-1', actorId: 'operator', sessionId: 'session-1', expectedVersion: 'session-1-v1' };

  it('cancels one occurrence, preserves bookings/occupancy and makes it a durable exception', async () => {
    const f = sessionFixture();
    const state = { ...sessionState(), seriesId: 'series', ruleId: 'rule', occurrenceNumber: 0 };

    f.states.set(state.sessionId, state);
    const cancel = new CancelSessionUseCase(f.store, f.access, f.values,
      addonPolicy());
    const result = await cancel.execute(input);

    expect(result).toMatchObject({
      status: 'Cancelled', heldPlaces: 2, confirmedPlaces: 3, availablePlaces: 5, bookable: false,
    });
    expect(f.states.get(state.sessionId)).toMatchObject({
      ...state, status: 'Cancelled', overridden: true, version: result.version,
    });
    expect(await cancel.execute({ ...input, expectedVersion: result.version })).toEqual(result);
    expect(f.store.cancel).toHaveBeenCalledOnce();
    await expect(cancel.execute(input)).rejects.toMatchObject({ code: 'StaleWrite' });
  });
  it('permits historical cancellation but rejects unauthorized, missing, foreign and concurrent changes', async () => {
    const f = sessionFixture();

    f.states.set('session-1', {
      ...sessionState(), startsAt: new Date('2020-01-01T10:00:00Z'), endsAt: new Date('2020-01-01T11:00:00Z'),
    });
    const cancel = new CancelSessionUseCase(f.store, f.access, f.values,
      addonPolicy());

    await expect(cancel.execute({ ...input, actorId: 'foreign' })).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(cancel.execute({ ...input, sessionId: 'missing' })).rejects.toMatchObject({ code: 'NotFound' });
    vi.mocked(f.store.find).mockResolvedValueOnce({ ...sessionState(), siteId: 'other' });
    await expect(cancel.execute(input)).rejects.toMatchObject({ code: 'Scope' });
    vi.mocked(f.store.cancel).mockRejectedValueOnce(new Error('Concurrent write'));
    await expect(cancel.execute(input)).rejects.toThrow('Concurrent write');
    expect(f.states.get('session-1')?.status).toBe('Scheduled');
    expect(await cancel.execute(input)).toMatchObject({ status: 'Cancelled', bookable: false });
  });
});
