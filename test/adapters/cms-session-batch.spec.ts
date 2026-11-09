import { AddonOperationAccess } from '@zarya/addon-contracts/addons';
import type { ICmsExtensionContext } from '@zarya/addon-contracts/cms-extensions';

import { eventsCmsExtension } from '../../src/adapters/inbound/cms/events-cms.adapter.js';
import { SessionStatus } from '../../src/domain/participation/session.js';
import type {
  IListBookableSessionsForPages,
} from '../../src/ports/inbound/participation/list-bookable-sessions-for-pages.port.js';

const input = {
  pageIds: ['p1', 'p2'],
  rangeStart: '2026-11-01T00:00:00.000Z',
  rangeEnd: '2026-12-01T00:00:00.000Z',
  limitPerPage: 10,
  cursors: { p2: 'next' },
};

const context: ICmsExtensionContext = { siteId: 'site', actorId: 'snippet:4', cms: Object.create(null) };

it('exposes the batch query with trusted identity, separate cursors and JSON public data', async () => {
  const execute = vi.fn<IListBookableSessionsForPages['execute']>().mockResolvedValue({
    pages: [
      {
        pageId: 'p1',
        items: [{
          sessionId: 's',
          pageId: 'p1',
          startsAt: new Date(input.rangeStart),
          endsAt: new Date(input.rangeEnd),
          timeZone: 'UTC',
          availablePlaces: 3,
          status: SessionStatus.Scheduled,
          bookable: true,
        }],
        nextCursor: 'more',
      },
      { pageId: 'p2', items: [], nextCursor: null },
    ],
  });
  const operation = eventsCmsExtension({ execute: vi.fn() }, { execute }).objects.sessions!.listForPages!;

  expect(operation.access).toBe(AddonOperationAccess.PublicEnabled);
  expect(await operation.execute(input, context)).toMatchObject({
    pages: [
      { pageId: 'p1', items: [{ startsAt: input.rangeStart, endsAt: input.rangeEnd }], nextCursor: 'more' },
      { pageId: 'p2', items: [], nextCursor: null },
    ],
  });
  expect(execute).toHaveBeenCalledExactlyOnceWith({
    ...input,
    siteId: 'site',
    rangeStart: new Date(input.rangeStart),
    rangeEnd: new Date(input.rangeEnd),
  });
});

it.each([
  { siteId: 'foreign' }, { actorId: 'other' }, { unknown: 1 }, { limitPerPage: '10' }, { limitPerPage: 101 },
  { pageIds: ['p1', 'p1'] }, { pageIds: [12] }, { pageIds: Array.from({ length: 65 }, (_, i) => 'p' + i) },
  { cursors: { foreign: 'x' } }, { cursors: [] }, { cursors: { p1: 12 } },
  { rangeStart: 'not-an-instant' }, { filter: { unknown: 'x' } },
])('rejects invalid batch/identity data before dispatch: %j', async (override) => {
  const execute = vi.fn<IListBookableSessionsForPages['execute']>();
  const operation = eventsCmsExtension({ execute: vi.fn() }, { execute }).objects.sessions!.listForPages!;

  await expect(operation.execute({ ...input, ...override }, context)).rejects.toMatchObject({ code: 'Validation' });
  expect(execute).not.toHaveBeenCalled();
});

it('preserves public batch failures without substituting partial or empty success', async () => {
  const failure = new Error('Publication unavailable');
  const execute = vi.fn<IListBookableSessionsForPages['execute']>().mockRejectedValue(failure);
  const operation = eventsCmsExtension({ execute: vi.fn() }, { execute }).objects.sessions!.listForPages!;

  await expect(operation.execute(input, context)).rejects.toBe(failure);
});
