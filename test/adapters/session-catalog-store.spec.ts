import { type Connection, createConnection, mongo } from 'mongoose';
import { vi } from 'vitest';

import {
  MongooseSessionCatalogStore,
} from '../../src/adapters/outbound/persistence/mongoose/participation/session-catalog-store.adapter.js';
import { SessionStatus } from '../../src/domain/participation/session.js';
import {
  SessionAvailabilityFilter, SessionStatusFilter, SessionTimeFilter,
} from '../../src/domain/participation/session-catalog.js';
import { sessionState } from '../support/session-catalog.js';

function transactionConnection(): Connection {
  const connection = createConnection();
  const client = new mongo.MongoClient('mongodb://localhost:27017');

  vi.spyOn(connection, 'startSession').mockResolvedValue(client.startSession());

  return connection;
}

describe('session catalog persistence', () => {
  it('guards a game reference update and never rewrites occupancy, dates or exception flags', async () => {
    const store = new MongooseSessionCatalogStore(transactionConnection(), { check: async () => {} });
    const query = store.sessions.updateOne({}, {});

    vi.spyOn(query, 'exec').mockResolvedValueOnce({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      upsertedId: null,
    });
    const update = vi.spyOn(store.sessions, 'updateOne').mockReturnValue(query);

    await expect(store.changePage('site-1', 'session-1', 'old', 'page-2', 'next'))
      .rejects.toMatchObject({ code: 'StaleWrite' });
    expect(update.mock.calls[0]?.[1]).toEqual({ $set: { pageId: 'page-2', version: 'next' } });
  });
  it('guards cancellation by site/version and only writes status, exception and version', async () => {
    const store = new MongooseSessionCatalogStore(transactionConnection(), { check: async () => {} });
    const query = store.sessions.updateOne({}, {});

    vi.spyOn(query, 'exec').mockResolvedValueOnce({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      upsertedId: null,
    });
    const update = vi.spyOn(store.sessions, 'updateOne').mockReturnValue(query);
    const state = { ...sessionState(), status: SessionStatus.Cancelled, overridden: true, version: 'cancelled' };

    await expect(store.cancel(state, 'session-1-v1')).rejects.toMatchObject({ code: 'StaleWrite' });
    expect(update.mock.calls[0]?.[0]).toEqual({ _id: 'session-1', siteId: 'site-1', version: 'session-1-v1' });
    expect(update.mock.calls[0]?.[1]).toEqual({
      $set: { status: SessionStatus.Cancelled, overridden: true, version: 'cancelled' },
    });
  });
  it('maps owned identities and preserves storage failures without retrying creation', async () => {
    const store = new MongooseSessionCatalogStore(transactionConnection(), { check: async () => {} });
    const create = vi.spyOn(store.sessions, 'create').mockRejectedValueOnce(new Error('Write uncertain'));

    await expect(store.create(sessionState())).rejects.toThrow('Write uncertain');
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject([{ _id: 'session-1', siteId: 'site-1' }]);
  });
  it('scopes reads and uses interval overlap, filters and bounded keyset queries', async () => {
    const store = new MongooseSessionCatalogStore(createConnection(), { check: async () => {} });
    const query = store.sessions.find();

    vi.spyOn(query.lean(), 'exec').mockResolvedValue([]);
    const find = vi.spyOn(store.sessions, 'find').mockReturnValue(query);
    const at = new Date('2026-10-25T11:00:00Z');

    await store.list({
      siteId: 'site-1',
      pageId: 'page-1',
      rangeStart: at,
      rangeEnd: new Date('2026-12-01T00:00:00Z'),
      at,
      time: SessionTimeFilter.Future,
      status: SessionStatusFilter.Scheduled,
      availability: SessionAvailabilityFilter.Available,
      limit: 20,
      cursor: null,
    });
    expect(find.mock.calls[0]?.[0]).toMatchObject({
      siteId: 'site-1',
      pageId: 'page-1',
      startsAt: { $lt: new Date('2026-12-01T00:00:00Z') },
      endsAt: { $gt: at },
      status: 'Scheduled',
    });
    expect(query.getOptions()).toMatchObject({ sort: { startsAt: 1, _id: 1 }, limit: 21 });
    await expect(store.list({
      siteId: 'site-1',
      pageId: null,
      rangeStart: at,
      rangeEnd: new Date('2026-12-01T00:00:00Z'),
      at,
      time: SessionTimeFilter.All,
      status: SessionStatusFilter.All,
      availability: SessionAvailabilityFilter.All,
      limit: 20,
      cursor: 'malformed',
    })).rejects.toMatchObject({ code: 'Validation' });
    expect(find).toHaveBeenCalledOnce();
  });
});
