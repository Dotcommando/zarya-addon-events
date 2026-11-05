import { calendarEvent } from '../../admin/src/api.js';

describe('calendar pending request data', () => {
  const row = {
    sessionId: 'one',
    pageId: 'game',
    startsAt: '2026-11-07T10:00:00Z',
    endsAt: '2026-11-07T11:00:00Z',
    timeZone: 'UTC',
    seriesId: null,
    status: 'Scheduled',
    version: '1',
    capacity: 8,
    heldPlaces: 6,
    confirmedPlaces: 1,
    availablePlaces: 1,
    pendingRequestCount: 2,
  };

  it('keeps request count independent of the number of reserved places', () => {
    expect(calendarEvent(row)).toMatchObject({ pendingRequestCount: 2, heldPlaces: 6 });
  });
  it.each([undefined, -1, 1.5, '2'])('rejects missing or invalid request counts: %s', value => {
    expect(() => calendarEvent({ ...row, pendingRequestCount: value })).toThrow('quantity');
  });
});
