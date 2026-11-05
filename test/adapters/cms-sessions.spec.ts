import { AddonOperationAccess } from '@zarya/addon-contracts/addons';
import type { ICmsExtensionContext } from '@zarya/addon-contracts/cms-extensions';

import { eventsCmsExtension } from '../../src/adapters/inbound/cms/events-cms.adapter.js';
import { SessionStatus } from '../../src/domain/participation/session.js';
import type { IListBookableSessions } from '../../src/ports/inbound/participation/list-bookable-sessions.port.js';

describe('Events CMS sessions API', () => {
  const input = {
    pageId: 'page',
    rangeStart: '2026-11-01T00:00:00.000Z',
    rangeEnd: '2026-12-01T00:00:00.000Z',
    limit: 10,
  };
  const context: ICmsExtensionContext = { siteId: 'site', actorId: 'snippet:4', cms: Object.create(null) };

  it('calls the existing public query with trusted identity and returns JSON dates', async () => {
    const execute = vi.fn<IListBookableSessions['execute']>().mockResolvedValue({
      items: [{
        sessionId: 'session',
        pageId: 'page',
        startsAt: new Date('2026-11-07T09:00:00Z'),
        endsAt: new Date('2026-11-07T12:00:00Z'),
        timeZone: 'Europe/London',
        availablePlaces: 2,
        status: SessionStatus.Scheduled,
        bookable: true,
      }],
      nextCursor: 'next',
    });
    const operation = eventsCmsExtension({ execute }).objects.sessions!.list!;

    expect(operation.access).toBe(AddonOperationAccess.PublicEnabled);
    expect(await operation.execute(input, context)).toMatchObject({
      items: [{ startsAt: '2026-11-07T09:00:00.000Z', endsAt: '2026-11-07T12:00:00.000Z' }],
      nextCursor: 'next',
    });
    expect(execute).toHaveBeenCalledWith({
      siteId: 'site',
      pageId: 'page',
      rangeStart: new Date(input.rangeStart),
      rangeEnd: new Date(input.rangeEnd),
      limit: 10,
    });
  });

  it.each([
    { siteId: 'foreign' }, { actorId: 'other' }, { unknown: 1 }, { limit: '10' },
    { rangeStart: 'invalid' }, { filter: { unknown: 'x' } }, { cursor: 12 },
  ])('rejects malformed or identity-overriding input before the query: %j', async (override) => {
    const execute = vi.fn<IListBookableSessions['execute']>();
    const operation = eventsCmsExtension({ execute }).objects.sessions!.list!;

    await expect(operation.execute({ ...input, ...override }, context)).rejects.toMatchObject({ code: 'Validation' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('preserves query failures without converting them to an empty success', async () => {
    const failure = Object.assign(new Error('disabled'), { code: 'AddonDisabled' });
    const execute = vi.fn<IListBookableSessions['execute']>().mockRejectedValue(failure);

    await expect(eventsCmsExtension({ execute }).objects.sessions!.list!.execute(input, context)).rejects.toBe(failure);
  });
});
