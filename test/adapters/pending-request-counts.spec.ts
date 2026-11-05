import { createConnection } from 'mongoose';

import {
  MongoosePendingRequestCounts,
} from '../../src/adapters/outbound/persistence/mongoose/participation/pending-request-counts.adapter.js';

describe('pending participation request counts', () => {
  it('counts Pending request documents for the selected site and sessions without reading contacts', async () => {
    const adapter = new MongoosePendingRequestCounts(createConnection());
    const aggregate = adapter.requests.aggregate();

    vi.spyOn(aggregate, 'exec').mockResolvedValue([{ _id: 'one', count: 2 }]);
    const read = vi.spyOn(adapter.requests, 'aggregate').mockReturnValue(aggregate);

    expect(await adapter.pendingCounts('site', ['one', 'two'])).toEqual(new Map([['one', 2]]));
    expect(read).toHaveBeenCalledWith([
      { $match: { siteId: 'site', sessionId: { $in: ['one', 'two'] }, state: 'Pending' } },
      { $group: { _id: '$sessionId', count: { $sum: 1 } } },
    ]);
    expect(await adapter.pendingCounts('site', [])).toEqual(new Map());
    expect(read).toHaveBeenCalledOnce();
  });
});
