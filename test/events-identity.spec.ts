import { vi } from 'vitest';

import { CreateSessionUseCase } from '../src/app/use-cases/participation/create-session.use-case.js';
import { eventsDefinition } from '../src/infra/definition.js';
import { eventsHooks } from '../src/infra/hooks.js';
import { addonPolicy } from './support/addons.js';
import { fakeHookSource } from './support/hook-source.js';
import { oneOffInput, sessionFixture } from './support/session-catalog.js';

it('uses the short events identity in the catalogue and emitted hooks', async () => {
  expect(eventsDefinition.addonKey).toBe('events');
  expect(eventsDefinition.adminComponentId).toBe('events');
  expect(eventsHooks.definitions).toHaveLength(8);

  for (const definition of eventsHooks.definitions) {
    expect(definition.provider).toBe('events');
    expect(definition.hookKey).toMatch(/^addon\.events\.session\./);
  }
  const f = sessionFixture();
  const hooks = { prepare: vi.fn(fakeHookSource.prepare) };

  await new CreateSessionUseCase(f.store, f.pages, f.access, f.values, addonPolicy(), hooks).execute(oneOffInput);
  expect(hooks.prepare).toHaveBeenCalledWith(expect.objectContaining({
    checkKey: 'addon.events.session.created.check',
    facts: [expect.objectContaining({ hookKey: 'addon.events.session.created' })],
  }));
});
