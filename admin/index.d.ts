import type { IAddonAdminHost } from '@zarya/addon-contracts/addons';
import type { Component } from 'svelte';

declare const ParticipationAdmin: Component<{ host: IAddonAdminHost }>;

export default ParticipationAdmin;
