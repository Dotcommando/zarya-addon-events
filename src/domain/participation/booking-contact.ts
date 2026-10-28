import { requireCondition, requireText } from '@zarya/addon-contracts/validation';

export interface IBookingContact {
  readonly name: string;
  readonly phone: string;
  readonly email: string;
}

export class BookingContact {
  readonly name: string;
  readonly phone: string;
  readonly email: string;

  constructor(value: IBookingContact) {
    requireText(value.name, 'name');
    requireText(value.phone, 'phone');
    requireText(value.email, 'email');
    this.name = value.name.trim().normalize('NFC');
    this.phone = value.phone.trim();
    const email = value.email.trim().normalize('NFC').toLowerCase();
    const parts = email.split('@');
    const local = parts[0] ?? '';
    const domain = parts[1] ?? '';

    requireCondition(this.name.length <= 200 && this.phone.length <= 64
      && /^\+?[0-9 ()-]+$/.test(this.phone) && /[0-9]/.test(this.phone), 'Invalid booking name or phone');
    requireCondition(parts.length === 2 && email.length <= 254 && local.length >= 1 && local.length <= 64
      && !/[\s<>()[\]\\,;:"]/.test(local) && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..'),
    'Invalid booking email');
    let hostname = '';

    try {
      const parsed = new URL('http://' + domain);

      requireCondition(parsed.host === parsed.hostname && !parsed.username && !parsed.password
        && parsed.pathname === '/' && !parsed.search && !parsed.hash && !/[\\/:?#\s]/.test(domain), 'Invalid email domain');
      hostname = parsed.hostname;
    } catch {
      requireCondition(false, 'Invalid booking email domain');
    }
    requireCondition(hostname.length > 0 && hostname.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)),
      'Invalid booking email domain');
    this.email = local + '@' + hostname;
  }
}
