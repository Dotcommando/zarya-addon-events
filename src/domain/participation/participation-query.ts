import type { ICursorInput } from '@zarya/addon-contracts/cursor-page';

import type { IBookingContact } from './booking-contact.js';
import type { ParticipationState } from './participation-state.enum.js';
import type { SessionStatus } from './session.js';

export interface ISessionRangeQuery extends ICursorInput {
  readonly siteId: string;
  readonly pageId: string | null;
  readonly rangeStart: Date;
  readonly rangeEnd: Date;
}

export interface IRequestListQuery extends ICursorInput {
  readonly siteId: string;
  readonly sessionId: string;
  readonly state: ParticipationState | null;
}

export interface IBookableSession {
  readonly sessionId: string;
  readonly pageId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timeZone: string;
  readonly availablePlaces: number;
  readonly status: SessionStatus;
  readonly bookable: boolean;
}

export interface IAdminSession extends IBookableSession {
  readonly capacity: number;
  readonly heldPlaces: number;
  readonly confirmedPlaces: number;
  readonly version: string;
  readonly seriesId: string | null;
}

export interface IAdminParticipation {
  readonly requestId: string;
  readonly requestReference: string;
  readonly sessionId: string;
  readonly places: number;
  readonly contact: IBookingContact;
  readonly state: ParticipationState;
  readonly requestedAt: Date;
  readonly version: string;
}
