import { vi } from 'vitest';

import {
  ConfirmParticipationUseCase,
} from '../../../src/app/use-cases/participation/confirm-participation.use-case.js';
import {
  RequestParticipationUseCase,
} from '../../../src/app/use-cases/participation/request-participation.use-case.js';
import { SessionStatus } from '../../../src/domain/participation/session.js';
import { addonPolicy } from '../../support/addons.js';
import { participationFixture, participationInput } from '../../support/participation.js';

describe('ConfirmParticipation', () => {
  it('reports a conflict when another decision commits between the request and session reads', async () => {
    const f = participationFixture();

    await new RequestParticipationUseCase(f.store, f.sessions.store, f.sessions.publicPages, f.values,
      f.identity,
      addonPolicy()).execute(participationInput);
    const row = [...f.requests.values()][0]!;

    vi.mocked(f.sessions.store.find).mockImplementationOnce(async () => {
      f.requests.set(row.requestId, { ...row, version: 'concurrent-version' });

      return {
        ...f.sessions.states.get('session-1')!,
        heldPlaces: 0,
        confirmedPlaces: 3,
        version: 'concurrent-session',
      };
    });
    const confirm = new ConfirmParticipationUseCase(f.store, f.sessions.store, f.sessions.access, f.values, f.identity,
      addonPolicy());

    await expect(confirm.execute({
      siteId: 'site-1',
      actorId: 'operator',
      requestId: row.requestId,
      expectedRequestVersion: row.version,
      idempotencyKey: 'concurrent',
    })).rejects.toMatchObject({ code: 'StaleWrite' });
  });
  it('confirms held places in history without extra capacity and replays the original receipt', async () => {
    const f = participationFixture();

    await new RequestParticipationUseCase(f.store, f.sessions.store, f.sessions.publicPages, f.values,
      f.identity,
      addonPolicy()).execute(participationInput);
    const original = [...f.requests.values()][0]!;

    f.sessions.values.now = () => new Date('2026-12-01T11:00:00Z');
    const confirm = new ConfirmParticipationUseCase(f.store, f.sessions.store, f.sessions.access, f.values, f.identity,
      addonPolicy());
    const input = {
      siteId: 'site-1',
      actorId: 'operator',
      requestId: original.requestId,
      expectedRequestVersion: original.version,
      idempotencyKey: 'confirm-key',
    };
    const result = await confirm.execute(input);

    expect(result.state).toBe('Confirmed');
    expect(f.sessions.states.get('session-1')).toMatchObject({ heldPlaces: 0, confirmedPlaces: 3 });
    expect(f.requests.get(original.requestId)).toMatchObject({ state: 'Confirmed', decidedBy: 'operator' });
    expect(await confirm.execute(input)).toEqual(result);
    expect(f.store.commitDecision).toHaveBeenCalledOnce();
    await expect(confirm.execute({
      ...input,
      expectedRequestVersion: result.requestVersion,
    })).rejects.toMatchObject({ code: 'IdempotencyConflict' });
    await expect(confirm.execute({ ...input, expectedRequestVersion: result.requestVersion, idempotencyKey: 'fresh' }))
      .rejects.toMatchObject({ code: 'InvalidTransition' });
  });
  it('rejects denied, stale, missing and cancelled-meeting decisions without changing occupancy', async () => {
    const f = participationFixture();

    await new RequestParticipationUseCase(f.store, f.sessions.store, f.sessions.publicPages, f.values,
      f.identity,
      addonPolicy()).execute(participationInput);
    const row = [...f.requests.values()][0]!;
    const confirm = new ConfirmParticipationUseCase(f.store, f.sessions.store, f.sessions.access, f.values, f.identity,
      addonPolicy());
    const input = {
      siteId: 'site-1',
      actorId: 'operator',
      requestId: row.requestId,
      expectedRequestVersion: row.version,
      idempotencyKey: 'confirm-key',
    };

    await expect(confirm.execute({ ...input, actorId: 'foreign' })).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(confirm.execute({ ...input, expectedRequestVersion: 'old' }))
      .rejects.toMatchObject({ code: 'StaleWrite' });
    await expect(confirm.execute({ ...input, requestId: 'missing' })).rejects.toMatchObject({ code: 'NotFound' });
    const session = f.sessions.states.get('session-1')!;

    f.sessions.states.set('session-1', { ...session, status: SessionStatus.Cancelled });
    await expect(confirm.execute(input)).rejects.toMatchObject({ code: 'NotBookable' });
    expect(f.store.commitDecision).not.toHaveBeenCalled();
    expect(f.sessions.states.get('session-1')?.heldPlaces).toBe(3);
    vi.mocked(f.store.findRequest).mockResolvedValueOnce({ ...row, siteId: 'foreign' });
    await expect(confirm.execute(input)).rejects.toMatchObject({ code: 'Scope' });
  });
});
