import { vi } from 'vitest';

import {
  RequestParticipationUseCase,
} from '../../../src/app/use-cases/participation/request-participation.use-case.js';
import { SessionStatus } from '../../../src/domain/participation/session.js';
import { addonPolicy } from '../../support/addons.js';
import { participationFixture, participationInput } from '../../support/participation.js';

describe('RequestParticipation', () => {
  it('validates canonical email length before persistence, including international domains', async () => {
    const f = participationFixture();
    const useCase = new RequestParticipationUseCase(f.store, f.sessions.store, f.sessions.publicPages,
      f.values, f.identity,
      addonPolicy());
    const domain = Array.from({ length: 4 }, () => String.fromCharCode(233).repeat(50)).join('.');

    await expect(useCase.execute({
      ...participationInput,
      contact: {
        ...participationInput.contact,
        email: 'a'.repeat(50) + '@' + domain,
      },
    })).rejects.toMatchObject({ code: 'Validation' });
    expect(f.store.commitRequest).not.toHaveBeenCalled();
  });
  it('holds the whole group, returns no contacts and replays normalized input even after eligibility changes',
    async () => {
      const f = participationFixture();
      const request = new RequestParticipationUseCase(f.store, f.sessions.store, f.sessions.publicPages,
        f.values, f.identity,
        addonPolicy());
      const first = await request.execute(participationInput);

      expect(first).toMatchObject({ sessionId: 'session-1', places: 3, state: 'Pending' });
      expect(first).not.toHaveProperty('contact');
      expect(f.sessions.states.get('session-1')?.heldPlaces).toBe(3);
      const stored = [...f.requests.values()][0];

      expect(stored?.contact).toEqual({ name: 'Alice', phone: '+1 (202) 555-0100', email: 'member@example.test' });
      vi.mocked(f.sessions.publicPages.isPublished).mockResolvedValue(false);
      expect(await request.execute({ ...participationInput, contact: stored!.contact })).toEqual(first);
      expect(f.store.commitRequest).toHaveBeenCalledOnce();
      await expect(request.execute({ ...participationInput, places: 2 }))
        .rejects.toMatchObject({ code: 'IdempotencyConflict' });
    });
  it('rejects unavailable, started, cancelled, unpublished and malformed requests without holds', async () => {
    const f = participationFixture();
    const request = new RequestParticipationUseCase(f.store, f.sessions.store, f.sessions.publicPages,
      f.values, f.identity,
      addonPolicy());

    await expect(request.execute({ ...participationInput, places: 11 }))
      .rejects.toMatchObject({ code: 'CapacityUnavailable' });
    await expect(request.execute({
      ...participationInput,
      contact: {
        ...participationInput.contact,
        email: 'invalid',
      },
    }))
      .rejects.toMatchObject({ code: 'Validation' });
    const state = f.sessions.states.get('session-1')!;

    f.sessions.states.set('session-1', { ...state, status: SessionStatus.Cancelled });
    await expect(request.execute(participationInput)).rejects.toMatchObject({ code: 'NotBookable' });
    f.sessions.states.set('session-1', { ...state, startsAt: f.values.now() });
    await expect(request.execute(participationInput)).rejects.toMatchObject({ code: 'NotBookable' });
    expect(f.store.commitRequest).not.toHaveBeenCalled();
  });
  it('reconciles a lost acknowledgement, but propagates a failure without a committed receipt', async () => {
    const f = participationFixture();
    const original = vi.mocked(f.store.commitRequest).getMockImplementation();

    if (!original) {
      throw new Error('Missing fixture commit');
    }
    vi.mocked(f.store.commitRequest).mockImplementationOnce(async (change) => {
      await original(change);
      throw new Error('Lost acknowledgement');
    });
    const request = new RequestParticipationUseCase(f.store, f.sessions.store, f.sessions.publicPages,
      f.values, f.identity,
      addonPolicy());

    expect(await request.execute(participationInput)).toHaveProperty('requestReference');
    vi.mocked(f.store.commitRequest).mockRejectedValueOnce(new Error('Unavailable'));
    await expect(request.execute({ ...participationInput, idempotencyKey: 'another' })).rejects.toThrow('Unavailable');
    expect(f.requests.size).toBe(1);
  });
});

