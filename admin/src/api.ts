import type { IAddonAdminHost } from '@zarya/addon-contracts/addons';

import type { IUtcPattern } from './calendar';

export interface IEvent {
  readonly sessionId: string;
  readonly pageId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
  readonly seriesId: string | null;
  readonly status: string;
  readonly version: string;
  readonly capacity: number;
  readonly heldPlaces: number;
  readonly confirmedPlaces: number;
  readonly availablePlaces: number;
}

export interface IRequest {
  readonly requestId: string;
  readonly version: string;
  readonly places: number;
  readonly state: string;
  readonly contact: { readonly name: string;
    readonly email: string;
    readonly phone: string };
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid response');
  }

  return Object.fromEntries(Object.entries(value));
}

export function text(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid text');
  }

  return value;
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid quantity');
  }

  return value;
}

export function event(value: unknown): IEvent {
  const row = record(value);

  return {
    sessionId: text(row.sessionId),
    pageId: text(row.pageId),
    startsAt: text(row.startsAt),
    endsAt: text(row.endsAt),
    timeZone: text(row.timeZone),
    seriesId: row.seriesId === null ? null : text(row.seriesId),
    status: text(row.status),
    version: text(row.version),
    capacity: count(row.capacity),
    heldPlaces: count(row.heldPlaces),
    confirmedPlaces: count(row.confirmedPlaces),
    availablePlaces: count(row.availablePlaces),
  };
}

export function requestRow(value: unknown): IRequest {
  const row = record(value);
  const contact = record(row.contact);

  return {
    requestId: text(row.requestId),
    version: text(row.version),
    places: count(row.places),
    state: text(row.state),
    contact: { name: text(contact.name), email: text(contact.email), phone: text(contact.phone) },
  };
}

export function page<T>(value: unknown, parse: (item: unknown) => T): {
  items: readonly T[];
  nextCursor: string | null;
} {
  const row = record(value);

  if (!Array.isArray(row.items)) {
    throw new Error('Invalid list');
  }

  return { items: row.items.map(parse), nextCursor: row.nextCursor === null ? null : text(row.nextCursor) };
}

export interface ISeries {
  seriesId: string;
  siteId: string;
  pageId: string;
  version: string;
  generatedThrough: string;
  rules: readonly { pattern: IUtcPattern;
    capacity: number;
    count: number | null }[];
}

export function series(value: unknown): ISeries {
  const row = record(value);

  if (!Array.isArray(row.rules) || !row.rules.length) {
    throw new Error('Invalid schedule');
  }

  return {
    seriesId: text(row.seriesId),
    siteId: text(row.siteId),
    pageId: text(row.pageId),
    version: text(row.version),
    generatedThrough: text(row.generatedThrough),
    rules: row.rules.map((value: unknown) => {
      const rule = record(value);
      const pattern = record(rule.pattern);

      if (!Array.isArray(pattern.weekdays)) {
        throw new Error('Invalid weekdays');
      }

      return {
        capacity: count(rule.capacity),
        count: rule.count === null ? null : count(rule.count),
        pattern: {
          startsOn: text(pattern.startsOn),
          endsOn: pattern.endsOn === null ? null : text(pattern.endsOn),
          localTime: text(pattern.localTime),
          timeZone: text(pattern.timeZone),
          everyWeeks: count(pattern.everyWeeks),
          durationMinutes: count(pattern.durationMinutes),
          weekdays: pattern.weekdays.map(count),
        },
      };
    }),
  };
}

export async function allEvents(host: IAddonAdminHost, rangeStart: string, rangeEnd: string,
  pageId?: string): Promise<readonly IEvent[]> {
  const result: IEvent[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;

  do {
    const query: URLSearchParams = new URLSearchParams({
      rangeStart,
      rangeEnd,
      limit: '100',
      ...(pageId ? { pageId } : {}),
      ...(cursor ? { cursor } : {}),
    });
    const batch: { items: readonly IEvent[];
      nextCursor: string | null } = page(await host.request('/sessions?' + query), event);

    result.push(...batch.items);
    cursor = batch.nextCursor;

    if (cursor && seen.has(cursor)) {
      throw new Error('Repeated pagination cursor');
    }
    if (cursor) {
      seen.add(cursor);
    }
  } while (cursor);

  return result;
}
