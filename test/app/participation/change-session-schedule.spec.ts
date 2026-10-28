import {
  ChangeSessionScheduleUseCase,
} from '../../../src/app/use-cases/participation/change-session-schedule.use-case.js';
import { CreateSessionSeriesUseCase } from '../../../src/app/use-cases/participation/create-session-series.use-case.js';
import type { ISessionState } from '../../../src/domain/participation/session.js';
import { SessionStatus } from '../../../src/domain/participation/session.js';
import { SessionEditScope } from '../../../src/domain/participation/session-series.js';
import type {
  IChangeSessionScheduleInput,
} from '../../../src/ports/inbound/participation/change-session-schedule.port.js';
import { addonPolicy } from '../../support/addons.js';
import { type IScheduleFixture, scheduleFixture, seriesInput } from '../../support/scheduling.js';

interface IChangeFixture extends IScheduleFixture {
  operation: ChangeSessionScheduleUseCase;
  input: IChangeSessionScheduleInput;
  first: ISessionState;
}

async function fixture(): Promise<IChangeFixture> {
  const f = scheduleFixture();

  await new CreateSessionSeriesUseCase(f.store, f.calendar, f.pages, f.access, f.values,
    addonPolicy()).execute(seriesInput());
  const series = f.series[0];
  const first = f.sessions[0];

  if (!series || !first) {
    throw new Error('fixture');
  }

  const operation = new ChangeSessionScheduleUseCase(f.store, f.calendar, f.access, f.values,
    addonPolicy());
  const input = {
    siteId: 'site',
    actorId: 'operator',
    seriesId: series.seriesId,
    expectedVersion: series.version,
    scope: SessionEditScope.Series,
    sessionId: null,
    pattern: seriesInput().pattern,
    capacity: 10,
  };

  return { ...f, operation, input, first };
}

describe('ChangeSessionSchedule', () => {
  it('changes this and following occurrences while preserving the earlier prefix', async () => {
    const f = await fixture();
    const earlier = structuredClone(f.sessions[0]);
    const second = f.sessions[1];

    if (!second) {
      throw new Error('fixture');
    }
    f.occurrences.splice(0, 1);
    await f.operation.execute({ ...f.input, scope: SessionEditScope.Following, sessionId: second.sessionId });
    expect(f.sessions[0]).toEqual(earlier);
    expect(f.series[0]?.rules[0]?.count).toBe(second.occurrenceNumber);
    expect(f.sessions[1]?.sessionId).toBe(second.sessionId);
  });
  it('preserves a meeting that has already started during whole-series editing', async () => {
    const f = await fixture();

    f.setNow(new Date('2026-01-03T10:30:00Z'));
    const before = structuredClone(f.sessions[0]);

    await f.operation.execute(f.input);
    expect(f.sessions[0]).toEqual(before);
  });
  it('moves booked occurrences without changing identity, occupancy or past meetings', async () => {
    const f = await fixture();

    f.sessions[0] = { ...f.first, heldPlaces: 2, confirmedPlaces: 3 };
    const oldId = f.first.sessionId;

    f.occurrences[0] = {
      ...f.occurrences[0]!,
      startsAt: new Date('2026-01-04T10:00:00Z'),
      endsAt: new Date('2026-01-04T11:00:00Z'),
    };
    await f.operation.execute({ ...f.input, pattern: { ...f.input.pattern, weekdays: [7] } });
    expect(f.sessions[0]).toMatchObject({
      sessionId: oldId,
      heldPlaces: 2,
      confirmedPlaces: 3,
      startsAt: new Date('2026-01-04T10:00:00Z'),
    });
  });
  it('marks removed occurrences Cancelled and retains their occupied places', async () => {
    const f = await fixture();
    const second = f.sessions[1];

    if (!second) {
      throw new Error('fixture');
    }
    f.sessions[1] = { ...second, heldPlaces: 2, confirmedPlaces: 1 };
    f.occurrences.splice(1);
    await f.operation.execute(f.input);
    expect(f.sessions[1]).toMatchObject({
      sessionId: second.sessionId,
      status: SessionStatus.Cancelled,
      heldPlaces: 2,
      confirmedPlaces: 1,
    });
  });
  it('changes one occurrence and preserves it during later series changes', async () => {
    const f = await fixture();
    const result = await f.operation.execute({
      ...f.input,
      scope: SessionEditScope.Occurrence,
      sessionId: f.first.sessionId,
      pattern: { ...f.input.pattern, startsOn: '2026-01-05' },
    });

    expect(f.sessions[0]).toMatchObject({ startsAt: new Date('2026-01-05T10:00:00Z'), overridden: true });
    await f.operation.execute({ ...f.input, expectedVersion: result.series.version });
    expect(f.sessions[0]?.startsAt).toEqual(new Date('2026-01-05T10:00:00Z'));
  });
  it('rejects stale edits and capacity below occupancy without partial writes', async () => {
    const f = await fixture();

    await expect(f.operation.execute({ ...f.input, expectedVersion: 'old' }))
      .rejects.toMatchObject({ code: 'StaleWrite' });
    f.sessions[0] = { ...f.first, heldPlaces: 4 };
    const before = structuredClone(f.sessions);

    await expect(f.operation.execute({ ...f.input, capacity: 3 })).rejects.toThrow();
    expect(f.sessions).toEqual(before);
  });
});
