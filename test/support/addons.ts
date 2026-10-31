import type { IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';

export function addonPolicy(): IAddonOperationPolicyPort {
  return { authorize: async(siteId, access) => ({ siteId, addonKey: 'events', version: 'test-v1', access }) };
}
