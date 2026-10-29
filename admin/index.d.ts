import type { IAddonAdminHost } from '@zarya/addon-contracts/addons';
import type { Component } from 'svelte';

declare const EventsAdmin: Component<{ host: IAddonAdminHost }>;

export default EventsAdmin;
