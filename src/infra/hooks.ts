import { HookKind, HookScopeKind, type IAddonHooksExtension } from '@zarya/addon-contracts/hooks';

export const eventsHooks: IAddonHooksExtension = {
  version: 1,
  definitions: ['created', 'cancelled', 'page.changed', 'removed'].flatMap((action) => [{
    hookKey: 'addon.events.session.' + action,
    title: 'Session ' + action,
    description: 'Confirmed event meeting change: ' + action,
    provider: 'events',
    kind: HookKind.Event,
    schemaVersion: 1,
    scopeKind: HookScopeKind.Site,
  }, {
    hookKey: 'addon.events.session.' + action + '.check',
    title: 'Before session ' + action,
    description: 'Read-only check before changing an event meeting',
    provider: 'events',
    kind: HookKind.Check,
    schemaVersion: 1,
    scopeKind: HookScopeKind.Site,
  }]),
  handlers: [],
};
