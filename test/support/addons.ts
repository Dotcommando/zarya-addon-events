import type { IAddonOperationPolicyPort } from '@zarya/addon-contracts/addons';

export function addonPolicy(): IAddonOperationPolicyPort {
  return { authorize: async(siteId, access) => ({ siteId, addonKey: 'participation', version: 'test-v1', access }) };
}
