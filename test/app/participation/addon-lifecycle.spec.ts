import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';

import { RemoveSessionUseCase } from '../../../src/app/use-cases/participation/remove-session.use-case.js';
import {
  RequestParticipationUseCase,
} from '../../../src/app/use-cases/participation/request-participation.use-case.js';
import { RescheduleSessionUseCase } from '../../../src/app/use-cases/participation/reschedule-session.use-case.js';
import type { ISessionManagementPort } from '../../../src/ports/outbound/participation/session-management.port.js';
import { addonPolicy } from '../../support/addons.js';
import { participationFixture, participationInput } from '../../support/participation.js';
import { sessionFixture, sessionState } from '../../support/session-catalog.js';

describe('add-on participation lifecycle', () => {
  it('denies a disabled public request before receipt replay or storage access', async () => {
    const f = participationFixture();
    const blocked: IAddonOperationPolicyPort = {
      authorize: vi.fn(async () => {
        throw new BusinessError(BusinessErrorCode.AddonDisabled, 'Disabled');
      }),
    };
    const operation = new RequestParticipationUseCase(
      f.store, f.sessions.store, f.sessions.publicPages, f.values, f.identity, blocked,
    );

    await expect(operation.execute(participationInput)).rejects.toMatchObject({ code: 'AddonDisabled' });
    expect(f.store.findOperationReceipt).not.toHaveBeenCalled();
    expect(f.store.commitRequest).not.toHaveBeenCalled();
    expect(blocked.authorize).toHaveBeenCalledWith('site-1', AddonOperationAccess.PublicEnabled);
  });

  it('cancels an occupied event without changing holds and removes an empty event', async () => {
    const f = sessionFixture();
    const state = sessionState();
    const management: ISessionManagementPort = {
      hasRequests: vi.fn(async () => true),
      remove: vi.fn(async () => {}),
      reschedule: vi.fn(async () => {}),
    };

    f.states.set(state.sessionId, state);
    const operation = new RemoveSessionUseCase(f.store, management, f.access, f.values, addonPolicy());
    const input = {
      siteId: state.siteId,
      actorId: 'operator',
      sessionId: state.sessionId,
      expectedVersion: state.version,
    };

    expect(await operation.execute(input)).toEqual({ outcome: 'Cancelled' });
    expect(f.states.get(state.sessionId)).toMatchObject({
      status: 'Cancelled', heldPlaces: state.heldPlaces, confirmedPlaces: state.confirmedPlaces,
    });
    expect(management.remove).not.toHaveBeenCalled();
    const empty = { ...state, heldPlaces: 0, confirmedPlaces: 0 };

    f.states.set(empty.sessionId, empty);
    vi.mocked(management.hasRequests).mockResolvedValueOnce(false);
    expect(await operation.execute(input)).toEqual({ outcome: 'Removed' });
    expect(management.remove).toHaveBeenCalledOnce();
  });

  it('protects started meetings, occupied capacity and stale event versions on reschedule', async () => {
    const f = sessionFixture();
    const state = sessionState();
    const management: ISessionManagementPort = {
      hasRequests: async () => false,
      remove: async () => {},
      reschedule: vi.fn(async () => {}),
    };
    const operation = new RescheduleSessionUseCase(f.store, management, f.access, f.values, addonPolicy());
    const input = {
      siteId: state.siteId,
      actorId: 'operator',
      sessionId: state.sessionId,
      expectedVersion: state.version,
      startsAt: new Date('2026-11-02T10:00:00Z'),
      endsAt: new Date('2026-11-02T11:00:00Z'),
      timeZone: 'Europe/Paris',
      capacity: 10,
    };

    f.states.set(state.sessionId, state);
    await expect(operation.execute({ ...input, expectedVersion: 'stale' }))
      .rejects.toMatchObject({ code: 'StaleWrite' });
    await expect(operation.execute({ ...input, capacity: 1 })).rejects.toMatchObject({ code: 'Validation' });
    f.states.set(state.sessionId, { ...state, startsAt: new Date('2026-10-20T10:00:00Z') });
    await expect(operation.execute(input)).rejects.toMatchObject({ code: 'InvalidTransition' });
    expect(management.reschedule).not.toHaveBeenCalled();
  });
});
