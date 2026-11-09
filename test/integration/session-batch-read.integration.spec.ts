import { randomUUID } from 'node:crypto';

import { createConnection } from 'mongoose';

import { sessionRecord } from '../../src/adapters/outbound/persistence/mongoose/participation/session.records.js';
import {
  MongooseSessionCatalogStore,
} from '../../src/adapters/outbound/persistence/mongoose/participation/session-catalog-store.adapter.js';
import { SessionStatus } from '../../src/domain/participation/session.js';
import {
  SessionAvailabilityFilter, SessionStatusFilter, SessionTimeFilter,
} from '../../src/domain/participation/session-catalog.js';
import { sessionState } from '../support/session-catalog.js';

it('matches independent keyset pages, limits and tenant scope with one MongoDB command', async () => {
  const uri = process.env.ZARYA_TEST_MONGO_URI;

  if (!uri) {
    throw new Error('ZARYA_TEST_MONGO_URI is required');
  }

  const database = 'events_test_' + randomUUID().replaceAll('-', '');
  const connection = await createConnection(uri, { dbName: database, autoCreate: false, autoIndex: false }).asPromise();
  const store = new MongooseSessionCatalogStore(connection, { check: async () => {} });
  const dropTestDatabase = async (): Promise<void> => {
    if (connection.name !== database || !/^events_test_[a-f0-9]{32}$/.test(database)) {
      throw new Error('Unsafe test database cleanup');
    }
    await connection.dropDatabase();
  };

  try {
    await connection.createCollection('sessions');
    await store.sessions.collection.createIndex(
      { siteId: 1, pageId: 1, startsAt: 1, _id: 1 }, { name: 'page_calendar' },
    );
    await store.sessions.insertMany(Array.from({ length: 80 }, (_, i) => sessionRecord({
      ...sessionState('session-' + String(i).padStart(3, '0')),
      pageId: i % 2 ? 'page-2' : 'page-1',
      siteId: i >= 60 ? 'foreign' : 'site-1',
      status: i % 7 === 0 ? SessionStatus.Cancelled : SessionStatus.Scheduled,
      heldPlaces: i % 5 === 0 ? 7 : 2,
    })));
    const common = {
      siteId: 'site-1',
      rangeStart: new Date('2026-01-01Z'),
      rangeEnd: new Date('2027-01-01Z'),
      at: new Date('2026-10-25Z'),
      limit: 10,
      cursor: null,
      time: SessionTimeFilter.Future,
      status: SessionStatusFilter.Scheduled,
      availability: SessionAvailabilityFilter.All,
    };
    const queries = ['page-1', 'page-2', 'empty'].map((pageId) => ({ ...common, pageId }));
    const aggregate = vi.spyOn(store.sessions.collection, 'aggregate');
    const first = await store.listForPages(queries);

    expect(aggregate).toHaveBeenCalledOnce();
    const pipeline = aggregate.mock.calls[0]![0]!;

    expect(first.map((group) => group.items.length)).toEqual([10, 10, 0]);

    for (let i = 0; i < queries.length; i++) {
      expect(first[i]).toEqual({ pageId: queries[i]!.pageId, ...await store.list(queries[i]!) });
    }
    const nextQueries = queries.map((q, i) => ({ ...q, cursor: first[i]!.nextCursor }));
    const next = await store.listForPages(nextQueries);

    for (let i = 0; i < queries.length; i++) {
      expect(next[i]).toEqual({ pageId: queries[i]!.pageId, ...await store.list(nextQueries[i]!) });
      expect(next[i]!.items.every((item) =>
        !first[i]!.items.some((old) => old.sessionId === item.sessionId))).toBe(true);
    }
    const filtered = queries.map((q) => ({
      ...q,
      limit: 100,
      status: SessionStatusFilter.All,
      availability: SessionAvailabilityFilter.Available,
    }));
    const result = await store.listForPages(filtered);

    for (let i = 0; i < queries.length; i++) {
      expect(result[i]).toEqual({ pageId: queries[i]!.pageId, ...await store.list(filtered[i]!) });
      expect(result[i]!.items.every((item) => item.siteId === 'site-1')).toBe(true);
    }
    const explanation = await store.sessions.collection.aggregate(pipeline).explain('executionStats');

    expect(JSON.stringify(explanation)).toContain('page_calendar');
  } finally {
    await dropTestDatabase();
    await connection.close();
  }
});
