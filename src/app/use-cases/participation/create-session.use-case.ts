import { AddonOperationAccess, type IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';
import { requireText } from '@zarya/addon-contracts/validation';

import { Session, SessionStatus } from '../../../domain/participation/session.js';
import type { ICreateSession, ICreateSessionInput } from '../../../ports/inbound/participation/create-session.port.js';
import type { IHookSourcePort } from '../../../ports/outbound/hooks/hook-source.port.js';
import type { ISessionCatalogAccessPort } from '../../../ports/outbound/participation/session-catalog-access.port.js';
import type {
  ISessionScheduleValuesPort, ISessionSeriesPagePort,
} from '../../../ports/outbound/participation/session-scheduling.port.js';
import type { ISessionStorePort } from '../../../ports/outbound/participation/session-store.port.js';

export class CreateSessionUseCase implements ICreateSession {
  constructor(private readonly store: ISessionStorePort, private readonly pages: ISessionSeriesPagePort,
    private readonly access: ISessionCatalogAccessPort, private readonly values: ISessionScheduleValuesPort,
    private readonly addon: IAddonOperationPolicyPort, private readonly hooks: IHookSourcePort) {}

  async execute(input: ICreateSessionInput): Promise<Session> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const addonPermit = await this.addon.authorize(input.siteId, AddonOperationAccess.AdministrationEnabled);

    requireText(input.siteId, 'siteId');
    requireText(input.pageId, 'pageId');
    await this.pages.requirePage(input.siteId, input.pageId);
    const session = new Session({
      sessionId: this.values.nextId(),
      siteId: input.siteId,
      pageId: input.pageId,
      seriesId: null,
      ruleId: null,
      occurrenceNumber: null,
      status: SessionStatus.Scheduled,
      overridden: false,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timeZone: input.timeZone,
      capacity: input.capacity,
      heldPlaces: 0,
      confirmedPlaces: 0,
      version: this.values.nextVersion(),
    });

    await this.store.create(session.toState(), addonPermit, await this.hooks.prepare({
      siteId: input.siteId,
      actorId: input.actorId,
      subject: 'session:' + session.toState().sessionId,
      checkKey: 'addon.events.session.created.check',
      candidate: { sessionId: session.toState().sessionId, pageId: session.toState().pageId },
      facts: [{
        hookKey: 'addon.events.session.created',
        payload: { sessionId: session.toState().sessionId, pageId: session.toState().pageId },
      }],
    }));

    return session;
  }
}
