import {
  ParticipationIdentityAdapter,
} from '../../src/adapters/outbound/security/participation/participation-identity.adapter.js';
import { BookingContact } from '../../src/domain/participation/booking-contact.js';
import { participationInput } from '../support/participation.js';

describe('participation semantic identities', () => {
  it('uses a persistent configured key, canonical fields and no plaintext contact fingerprint', () => {
    const adapter = new ParticipationIdentityAdapter('synthetic-participation-key-32-bytes');
    const input = {
      siteId: 'site-1',
      sessionId: 'session-1',
      places: 3,
      contact: new BookingContact(
        participationInput.contact),
    };
    const first = adapter.request(input);

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(adapter.request({ ...input })).toBe(first);
    expect(adapter.request({ ...input, places: 2 })).not.toBe(first);
    expect(new ParticipationIdentityAdapter('another-synthetic-key-at-least-32-bytes').request(input)).not.toBe(first);
    expect(() => new ParticipationIdentityAdapter('secret')).toThrow();
  });
});
