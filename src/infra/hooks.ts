import { HookKind, HookScopeKind, type IAddonHooksExtension } from '@zarya/addon-contracts/hooks';

export const eventsHooks: IAddonHooksExtension = {
  version: 1,
  definitions: ['created', 'cancelled', 'page.changed', 'removed'].flatMap((action) => [{
    hookKey: 'addon.participation.session.' + action,
    title: 'Session ' + action,
    description: 'Confirmed event meeting change: ' + action,
    provider: 'participation',
    kind: HookKind.Event,
    schemaVersion: 1,
    scopeKind: HookScopeKind.Site,
  }, {
    hookKey: 'addon.participation.session.' + action + '.check',
    title: 'Before session ' + action,
    description: 'Read-only check before changing an event meeting',
    provider: 'participation',
    kind: HookKind.Check,
    schemaVersion: 1,
    scopeKind: HookScopeKind.Site,
  }]),
  handlers: [],
};
