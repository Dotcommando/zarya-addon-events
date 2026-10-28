import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { requireText } from '@zarya/addon-contracts/validation';

import type { IAdminSession } from '../../../domain/participation/participation-query.js';
import { adminSession, requireOwnedSession } from '../../../domain/participation/session-catalog.js';
import type {
  IRescheduleSession, IRescheduleSessionInput,
} from '../../../ports/inbound/participation/reschedule-session.port.js';
import type { ISessionCatalogAccessPort } from '../../../ports/outbound/participation/session-catalog-access.port.js';
import type {
  ISessionManagementPort,
} from '../../../ports/outbound/participation/session-management.port.js';
import type {
  ISessionScheduleValuesPort,
} from '../../../ports/outbound/participation/session-scheduling.port.js';
import type { ISessionStorePort } from '../../../ports/outbound/participation/session-store.port.js';

export class RescheduleSessionUseCase implements IRescheduleSession {
  constructor(private readonly sessions: ISessionStorePort, private readonly management: ISessionManagementPort,
    private readonly access: ISessionCatalogAccessPort, private readonly values: ISessionScheduleValuesPort,
    private readonly addon: IAddonOperationPolicyPort) {}

  async execute(input: IRescheduleSessionInput): Promise<IAdminSession> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    requireText(input.expectedVersion, 'expectedVersion');
    const permit = await this.addon.authorize(input.siteId, AddonOperationAccess.AdministrationRetained);
    const state = await this.sessions.find(input.siteId, input.sessionId);

    if (!state) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Session not found');
    }

    const session = requireOwnedSession(state, input.siteId, input.sessionId);

    if (state.version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Session changed');
    }

    const at = this.values.now();

    if (state.startsAt <= at) {
      throw new BusinessError(BusinessErrorCode.InvalidTransition, 'Started sessions retain their schedule');
    }
    if (input.startsAt <= at) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Cannot move a session into the past');
    }
    session.reschedule({
      ...input,
      ruleId: state.ruleId,
      occurrenceNumber: state.occurrenceNumber,
      overridden: state.seriesId !== null,
    }, this.values.nextVersion());
    await this.management.reschedule(session.toState(), input.expectedVersion, permit);

    return adminSession(session.toState(), this.values.now());
  }
}
