import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import type { Mock } from 'vitest';

import {
  ListBookableSessionsForPagesUseCase,
} from '../../../src/app/use-cases/participation/list-bookable-sessions-for-pages.use-case.js';
import type { ISessionCatalogQuery } from '../../../src/domain/participation/session-catalog.js';
import { SessionAvailabilityFilter } from '../../../src/domain/participation/session-catalog.js';
import type { ISessionPageGroup } from '../../../src/domain/participation/session-page-batch.js';
import { addonPolicy } from '../../support/addons.js';
import { sessionFixture, sessionState } from '../../support/session-catalog.js';

const input = {
  siteId: 'site-1',
  pageIds: ['page-1', 'page-2'],
  rangeStart: new Date('2026-01-01Z'),
  rangeEnd: new Date('2027-01-01Z'),
  limitPerPage: 1,
};

function setup(): ReturnType<typeof sessionFixture> & {
  operation: ListBookableSessionsForPagesUseCase;
  listForPages: Mock<(queries: readonly ISessionCatalogQuery[]) => Promise<readonly ISessionPageGroup[]>>;
  findPublished: Mock<(siteId: string, ids: readonly string[]) => Promise<readonly string[]>>;
  policy: ReturnType<typeof addonPolicy>;
} {
  const f = sessionFixture();

  f.states.set('a', sessionState('a'));
  f.states.set('b', sessionState('b'));
  f.states.set('c', { ...sessionState('c'), pageId: 'page-2', heldPlaces: 7 });
  const listForPages = vi.fn(async (queries: readonly ISessionCatalogQuery[]): Promise<readonly ISessionPageGroup[]> =>
    Promise.all(queries.map(async (query) => ({ pageId: query.pageId!, ...await f.store.list(query) }))));
  const findPublished = vi.fn(async (_siteId: string, ids: readonly string[]) => ids);
  const policy = addonPolicy();

  vi.spyOn(policy, 'authorize');
  const operation = new ListBookableSessionsForPagesUseCase({ listForPages }, { findPublished }, f.values, policy);

  return { ...f, operation, listForPages, findPublished, policy };
}

it('keeps per-page limits/cursors and projects public data after one authorization and publication batch', async () => {
  const s = setup();
  const result = await s.operation.execute(input);

  expect(result.pages.map((p) => [p.pageId, p.items.map((x) => x.sessionId), p.nextCursor]))
    .toEqual([['page-1', ['a'], 'a'], ['page-2', ['c'], null]]);
  expect(result.pages[1]?.items[0]).toMatchObject({ availablePlaces: 0, bookable: false });
  expect(result.pages[0]?.items[0]).not.toHaveProperty('siteId');
  expect(result.pages[0]?.items[0]).not.toHaveProperty('heldPlaces');
  expect(s.policy.authorize).toHaveBeenCalledOnce();
  expect(s.findPublished).toHaveBeenCalledExactlyOnceWith('site-1', input.pageIds);
  expect(s.listForPages).toHaveBeenCalledOnce();
  const next = await s.operation.execute({ ...input, cursors: { 'page-1': 'a' } });

  expect(next.pages[0]?.items.map((x) => x.sessionId)).toEqual(['b']);
  expect(next.pages[1]?.items.map((x) => x.sessionId)).toEqual(['c']);
  const available = await s.operation.execute({
    ...input, filter: { availability: SessionAvailabilityFilter.Available },
  });

  expect(available.pages[1]?.items).toEqual([]);
});

it('rejects disabled, missing, foreign and inconsistent data without returning partial groups', async () => {
  const s = setup();

  vi.mocked(s.policy.authorize).mockRejectedValueOnce(
    new BusinessError(BusinessErrorCode.AddonUnavailable, 'Disabled'),
  );
  await expect(s.operation.execute(input)).rejects.toThrow('Disabled');
  expect(s.findPublished).not.toHaveBeenCalled();
  s.findPublished.mockResolvedValueOnce(['page-1']);
  await expect(s.operation.execute(input)).rejects.toMatchObject({ code: 'NotFound' });
  expect(s.listForPages).not.toHaveBeenCalled();
  s.findPublished.mockResolvedValueOnce(['page-1', 'page-2', 'foreign']);
  await expect(s.operation.execute(input)).rejects.toMatchObject({ code: 'Scope' });
  s.listForPages.mockResolvedValueOnce([
    { pageId: 'page-1', items: [], nextCursor: null },
  ]);
  await expect(s.operation.execute(input)).rejects.toMatchObject({ code: 'Scope' });
  s.listForPages.mockResolvedValueOnce([
    { pageId: 'page-1', items: [{ ...sessionState('a'), siteId: 'foreign' }], nextCursor: null },
    { pageId: 'page-2', items: [], nextCursor: null },
  ]);
  await expect(s.operation.execute(input)).rejects.toMatchObject({ code: 'Scope' });
});

it('bounds page count independently of the unchanged per-page limit and validates cursor identities', async () => {
  const s = setup();

  for (const invalid of [
    { pageIds: ['page-1', 'page-1'] }, { pageIds: [''] },
    { pageIds: Array.from({ length: 65 }, (_, i) => 'p' + i) },
    { limitPerPage: 0 }, { limitPerPage: 101 }, { cursors: { foreign: 'x' } },
    { rangeEnd: input.rangeStart },
  ]) {
    await expect(s.operation.execute({ ...input, ...invalid })).rejects.toMatchObject({ code: 'Validation' });
  }
  expect(s.listForPages).not.toHaveBeenCalled();
  expect(s.findPublished).not.toHaveBeenCalled();
  expect(await s.operation.execute({ ...input, pageIds: [] })).toEqual({ pages: [] });
});
