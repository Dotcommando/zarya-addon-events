import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { SnapshotEntity } from '@zarya/addon-contracts/snapshot-entity';
import {
  requireCondition, requireInstant, requireInteger, requireNewVersion,
  requireText, requireTimeZone,
} from '@zarya/addon-contracts/validation';

export enum SessionStatus {
  Scheduled = 'Scheduled',
  Cancelled = 'Cancelled',
}

export interface ISessionState {
  readonly sessionId: string;
  readonly siteId: string;
  readonly pageId: string;
  readonly seriesId: string | null;
  readonly ruleId: string | null;
  readonly occurrenceNumber: number | null;
  readonly status: SessionStatus;
  readonly overridden: boolean;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timeZone: string;
  readonly capacity: number;
  readonly heldPlaces: number;
  readonly confirmedPlaces: number;
  readonly version: string;
}

export interface ISessionScheduleChange {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timeZone: string;
  readonly capacity: number;
  readonly ruleId: string | null;
  readonly occurrenceNumber: number | null;
  readonly overridden: boolean;
}

export class Session extends SnapshotEntity<ISessionState> {
  constructor(state: ISessionState) {
    for (const value of [state.sessionId, state.siteId, state.pageId, state.version]) {
      requireText(value, 'Session identity or version');
    }
    requireInstant(state.startsAt, 'startsAt');
    requireInstant(state.endsAt, 'endsAt');
    requireCondition(state.endsAt > state.startsAt, 'Session end must follow start');
    requireTimeZone(state.timeZone);
    requireCondition(Object.values(SessionStatus).includes(state.status), 'Invalid session status');
    requireCondition(typeof state.overridden === 'boolean', 'Invalid occurrence override');
    requireCondition(state.seriesId === null ? state.ruleId === null && state.occurrenceNumber === null
      : Boolean(state.ruleId) && state.occurrenceNumber !== null, 'Invalid occurrence identity');

    if (state.seriesId !== null) {
      requireText(state.seriesId, 'seriesId');
      requireText(state.ruleId ?? '', 'ruleId');
    }
    if (state.occurrenceNumber !== null) {
      requireInteger(state.occurrenceNumber, 0, 'occurrenceNumber');
    }
    requireInteger(state.capacity, 1, 'capacity');
    requireInteger(state.heldPlaces, 0, 'heldPlaces');
    requireInteger(state.confirmedPlaces, 0, 'confirmedPlaces');
    requireCondition(state.heldPlaces <= state.capacity - state.confirmedPlaces, 'Capacity exceeded');
    super(state);
  }

  get availablePlaces(): number {
    const state = this.toState();

    return state.capacity - state.heldPlaces - state.confirmedPlaces;
  }

  changePage(pageId: string, nextVersion: string): void {
    const state = this.toState();

    requireText(pageId, 'pageId');
    requireNewVersion(state.version, nextVersion);
    this.replaceState({ ...state, pageId, version: nextVersion });
  }

  reschedule(change: ISessionScheduleChange, nextVersion: string): void {
    const state = this.toState();

    requireNewVersion(state.version, nextVersion);
    const next = new Session({
      ...state,
      startsAt: change.startsAt,
      endsAt: change.endsAt,
      timeZone: change.timeZone,
      capacity: change.capacity,
      ruleId: change.ruleId,
      occurrenceNumber: change.occurrenceNumber,
      overridden: change.overridden,
      version: nextVersion,
    });

    this.replaceState(next.toState());
  }

  cancel(nextVersion: string, asException = false): void {
    const state = this.toState();

    requireNewVersion(state.version, nextVersion);
    this.replaceState({
      ...state,
      status: SessionStatus.Cancelled,
      overridden: state.overridden || asException && state.seriesId !== null,
      version: nextVersion,
    });
  }

  overlaps(rangeStart: Date, rangeEnd: Date): boolean {
    requireInstant(rangeStart, 'rangeStart');
    requireInstant(rangeEnd, 'rangeEnd');
    requireCondition(rangeEnd > rangeStart, 'Invalid calendar interval');
    const state = this.toState();

    return state.startsAt < rangeEnd && state.endsAt > rangeStart;
  }

  hold(places: number, nextVersion: string): void {
    requireInteger(places, 1, 'places');
    const state = this.toState();

    if (state.status !== SessionStatus.Scheduled) {
      throw new BusinessError(BusinessErrorCode.NotBookable, 'Session is cancelled');
    }

    requireNewVersion(state.version, nextVersion);

    if (places > this.availablePlaces) {
      throw new BusinessError(BusinessErrorCode.CapacityUnavailable, 'The entire group must fit');
    }
    this.replaceState({ ...state, heldPlaces: state.heldPlaces + places, version: nextVersion });
  }

  confirmHeld(places: number, nextVersion: string): void {
    this.changeHold(places, nextVersion, true);
  }

  releaseHeld(places: number, nextVersion: string): void {
    this.changeHold(places, nextVersion, false);
  }

  private changeHold(places: number, nextVersion: string, confirm: boolean): void {
    requireInteger(places, 1, 'places');
    const state = this.toState();

    requireNewVersion(state.version, nextVersion);
    requireCondition(places <= state.heldPlaces, 'Insufficient held places');
    this.replaceState({
      ...state,
      heldPlaces: state.heldPlaces - places,
      confirmedPlaces: state.confirmedPlaces + (confirm ? places : 0),
      version: nextVersion,
    });
  }
}
