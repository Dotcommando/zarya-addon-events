import { type Aggregate, createConnection } from 'mongoose';
import type { MockInstance } from 'vitest';

import {
  type ISessionRecord, sessionRecord,
} from '../../src/adapters/outbound/persistence/mongoose/participation/session.records.js';
import {
  MongooseSessionCatalogStore,
} from '../../src/adapters/outbound/persistence/mongoose/participation/session-catalog-store.adapter.js';
import {
  SessionAvailabilityFilter, SessionStatusFilter, SessionTimeFilter,
} from '../../src/domain/participation/session-catalog.js';
import { sessionState } from '../support/session-catalog.js';

const query = {
  siteId: 'site-1',
  pageId: 'page-1',
  rangeStart: new Date('2026-01-01Z'),
  rangeEnd: new Date('2027-01-01Z'),
  at: new Date('2026-10-25Z'),
  limit: 1,
  cursor: null,
  time: SessionTimeFilter.Future,
  status: SessionStatusFilter.Scheduled,
  availability: SessionAvailabilityFilter.All,
};

function setup(): {
  store: MongooseSessionCatalogStore;
  operation: Aggregate<ISessionRecord[]>;
  exec: MockInstance<Aggregate<ISessionRecord[]>['exec']>;
  aggregate: MockInstance<MongooseSessionCatalogStore['sessions']['aggregate']>;
} {
  const connection = createConnection();
  const store = new MongooseSessionCatalogStore(connection, { check: async () => {} });
  const operation = store.sessions.aggregate<ISessionRecord>([]);
  const exec = vi.spyOn(operation, 'exec').mockResolvedValue([]);
  const aggregate = vi.spyOn(store.sessions, 'aggregate').mockReturnValue(operation);

  return { store, operation, exec, aggregate };
}

it('uses one scoped read with an independent ordered limit-plus-one branch for every page', async () => {
  const s = setup();

  s.exec.mockResolvedValueOnce([
    sessionRecord({ ...sessionState('d'), pageId: 'page-2' }), sessionRecord(sessionState('b')),
    sessionRecord({ ...sessionState('c'), pageId: 'page-2' }), sessionRecord(sessionState('a')),
  ]);
  const result = await s.store.listForPages([query, { ...query, pageId: 'page-2' }, { ...query, pageId: 'empty' }]);

  expect(s.aggregate).toHaveBeenCalledOnce();
  const pipeline = s.aggregate.mock.calls[0]![0]!;

  expect(pipeline.slice(0, 3)).toMatchObject([
    { $match: { siteId: 'site-1', pageId: 'page-1', status: 'Scheduled' } },
    { $sort: { startsAt: 1, _id: 1 } }, { $limit: 2 },
  ]);
  expect(pipeline.slice(3)).toMatchObject([
    {
      $unionWith: {
        coll: 'sessions',
        pipeline: [
          { $match: { siteId: 'site-1', pageId: 'page-2' } }, { $sort: { startsAt: 1, _id: 1 } }, { $limit: 2 },
        ],
      },
    },
    {
      $unionWith: {
        coll: 'sessions',
        pipeline: [
          { $match: { siteId: 'site-1', pageId: 'empty' } }, { $sort: { startsAt: 1, _id: 1 } }, { $limit: 2 },
        ],
      },
    },
  ]);
  expect(s.operation.options.maxTimeMS).toBe(10000);
  expect(result.map((group) => [group.pageId, group.items.map((item) => item.sessionId)]))
    .toEqual([['page-1', ['a']], ['page-2', ['c']], ['empty', []]]);
  expect(result[0]?.nextCursor).toEqual(expect.any(String));
  expect(result[1]?.nextCursor).toEqual(expect.any(String));
  expect(result[2]?.nextCursor).toBeNull();
  await expect(s.store.listForPages([{ ...query, pageId: 'page-2', cursor: result[0]!.nextCursor }]))
    .rejects.toMatchObject({ code: 'Validation' });
  expect(s.aggregate).toHaveBeenCalledOnce();
});

it('rejects mixed sites, duplicate pages and foreign results, and preserves database failures', async () => {
  const s = setup();

  await expect(s.store.listForPages([query, { ...query, siteId: 'foreign', pageId: 'page-2' }]))
    .rejects.toMatchObject({ code: 'Validation' });
  await expect(s.store.listForPages([query, query])).rejects.toMatchObject({ code: 'Validation' });
  expect(s.aggregate).not.toHaveBeenCalled();
  s.exec.mockResolvedValueOnce([sessionRecord({ ...sessionState(), siteId: 'foreign' })]);
  await expect(s.store.listForPages([query])).rejects.toMatchObject({ code: 'Scope' });
  s.exec.mockRejectedValueOnce(new Error('Database unavailable'));
  await expect(s.store.listForPages([query])).rejects.toThrow('Database unavailable');
  expect(await s.store.listForPages([])).toEqual([]);
});
