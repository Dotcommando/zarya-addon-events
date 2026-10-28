import { createHmac } from 'node:crypto';

import { BookingContact } from '../../../../domain/participation/booking-contact.js';
import type {
  IDecisionSemanticInput, IParticipationIdentityPort, IRequestSemanticInput,
} from '../../../../ports/outbound/participation/participation-identity.port.js';

export class ParticipationIdentityAdapter implements IParticipationIdentityPort {
  constructor(private readonly secret: string) {
    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new RangeError('A persistent participation identity key of at least 32 bytes is required');
    }
  }

  request(input: IRequestSemanticInput): string {
    const contact = new BookingContact(input.contact);

    return createHmac('sha256', this.secret).update(JSON.stringify(['Request', input.siteId, input.sessionId,
      input.places, contact.name, contact.phone, contact.email])).digest('hex');
  }

  decision(input: IDecisionSemanticInput): string {
    return createHmac('sha256', this.secret).update(JSON.stringify([input.operation, input.siteId,
      input.actorId, input.requestId, input.expectedRequestVersion])).digest('hex');
  }
}
