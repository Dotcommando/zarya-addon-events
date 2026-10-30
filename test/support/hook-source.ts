import type { IHookSourcePort } from '../../src/ports/outbound/hooks/hook-source.port.js';

export const fakeHookSource: IHookSourcePort = {
  prepare: async (change) => ({
    installationId: 'synthetic',
    scopeKey: change.siteId ?? 'installation',
    siteId: change.siteId,
    generation: 'generation',
    registryVersion: 'registry',
    recipients: [],
    operationId: 'operation',
    actorId: change.actorId,
    subject: change.subject,
    facts: [],
    occurredAt: new Date(0),
    chainId: 'chain',
    causalDepth: 0,
  }),
};
