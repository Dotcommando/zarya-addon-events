import { createConnection } from 'mongoose';
import { vi } from 'vitest';

import {
  MongooseParticipationStore,
} from '../../src/adapters/outbound/persistence/mongoose/participation/participation-store.adapter.js';
import { RequestParticipationUseCase } from '../../src/app/use-cases/participation/request-participation.use-case.js';
import { ParticipationState } from '../../src/domain/participation/participation-state.enum.js';
import { addonPolicy } from '../support/addons.js';
import { participationFixture, participationInput } from '../support/participation.js';

describe('participation persistence boundary', () => {
  it('rejects a receipt from another site before opening a transaction', async () => {
    const connection = createConnection();
    const store = new MongooseParticipationStore(connection, { check: async () => {} });
    const start = vi.spyOn(connection, 'startSession').mockRejectedValue(new Error('Unexpected transaction'));
    const f = participationFixture();

    await new RequestParticipationUseCase(f.store, f.sessions.store, f.sessions.publicPages, f.values,
      f.identity,
      addonPolicy()).execute(participationInput);
    const change = vi.mocked(f.store.commitRequest).mock.calls[0]![0];

    await expect(store.commitRequest({
      ...change,
      receipt: {
        ...change.receipt,
        identity: { ...change.receipt.identity, siteId: 'foreign' },
      },
    })).rejects.toMatchObject({ code: 'Scope' });
    expect(start).not.toHaveBeenCalled();
  });
  it('rejects foreign-filter cursors before querying contacts and scopes every list', async () => {
    const store = new MongooseParticipationStore(createConnection(), { check: async () => {} });
    const query = store.requests.find();

    vi.spyOn(query.lean(), 'exec').mockResolvedValue([]);
    const find = vi.spyOn(store.requests, 'find').mockReturnValue(query);

    expect(await store.listRequests({
      siteId: 'site-1',
      sessionId: 'session-1',
      state: ParticipationState.Pending,
      limit: 20,
      cursor: null,
    })).toEqual({ items: [], nextCursor: null });
    expect(find.mock.calls[0]?.[0]).toMatchObject({
      siteId: 'site-1',
      sessionId: 'session-1',
      state: ParticipationState.Pending,
    });
    await expect(store.listRequests({
      siteId: 'site-1',
      sessionId: 'session-1',
      state: null,
      limit: 20,
      cursor: 'invalid',
    })).rejects.toMatchObject({ code: 'Validation' });
    expect(find).toHaveBeenCalledOnce();
  });
  it('propagates transaction startup failure without creating an unguarded request or receipt', async () => {
    const connection = createConnection();
    const store = new MongooseParticipationStore(connection, { check: async () => {} });

    vi.spyOn(connection, 'startSession').mockRejectedValueOnce(new Error('Transactions unavailable'));
    const f = participationFixture();

    await new RequestParticipationUseCase(f.store, f.sessions.store, f.sessions.publicPages, f.values, f.identity,
      addonPolicy())
      .execute(participationInput);
    const change = vi.mocked(f.store.commitRequest).mock.calls[0]?.[0];

    if (!change) {
      throw new Error('Missing request fixture');
    }

    const create = vi.spyOn(store.operations, 'create');

    await expect(store.commitRequest(change)).rejects.toThrow('Transactions unavailable');
    expect(create).not.toHaveBeenCalled();
  });
});
