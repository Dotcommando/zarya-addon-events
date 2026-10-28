import { vi } from 'vitest';

import type { IBookingRequestState } from '../../src/domain/participation/booking-request.js';
import type { IOperationIdentity, OperationReceipt } from '../../src/domain/participation/operation-receipt.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { IParticipationIdentityPort } from '../../src/ports/outbound/participation/participation-identity.port.js';
import type { IParticipationStorePort } from '../../src/ports/outbound/participation/participation-store.port.js';
import type { IParticipationValuesPort } from '../../src/ports/outbound/participation/participation-values.port.js';
import { sessionFixture, sessionState } from './session-catalog.js';

export const participationInput = {
  siteId: 'site-1',
  sessionId: 'session-1',
  places: 3,
  idempotencyKey: 'request-key',
  contact: { name: ' Alice ', phone: ' +1 (202) 555-0100 ', email: ' Member@Example.Test ' },
};

function key(identity: IOperationIdentity): string {
  return JSON.stringify([identity.siteId, identity.operation, identity.actorId, identity.idempotencyKey]);
}

interface IParticipationFixture {
  sessions: ReturnType<typeof sessionFixture>;
  requests: Map<string, IBookingRequestState>;
  receipts: Map<string, OperationReceipt>;
  store: IParticipationStorePort;
  values: IParticipationValuesPort;
  identity: IParticipationIdentityPort;
}

export function participationFixture(): IParticipationFixture {
  const sessions = sessionFixture();

  sessions.states.set('session-1', { ...sessionState(), heldPlaces: 0, confirmedPlaces: 0 });
  const requests = new Map<string, IBookingRequestState>();
  const receipts = new Map<string, OperationReceipt>();
  let sequence = 0;
  const store: IParticipationStorePort = {
    findRequest: vi.fn(async (siteId, id) => {
      const row = requests.get(id);

      return row && row.siteId === siteId ? structuredClone(row) : null;
    }),
    listRequests: vi.fn(async (query) => {
      const rows = [...requests.values()].filter((r) => r.siteId === query.siteId && r.sessionId === query.sessionId
        && (query.state === null || r.state === query.state))
        .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime() || a.requestId.localeCompare(b.requestId))
        .filter((r) => query.cursor === null || r.requestId > query.cursor);
      const items = rows.slice(0, query.limit).map((r) => structuredClone(r));

      return { items, nextCursor: rows.length > query.limit ? items.at(-1)?.requestId ?? null : null };
    }),
    findOperationReceipt: vi.fn(async (identity) => receipts.get(key(identity)) ?? null),
    commitRequest: vi.fn(async (change) => {
      const id = change.session.sessionId;

      if (receipts.has(key(change.receipt.identity))) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Duplicate operation');
      }
      if (sessions.states.get(id)?.version !== change.expectedSessionVersion) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Session changed');
      }
      sessions.states.set(id, structuredClone(change.session));
      requests.set(change.request.requestId, structuredClone(change.request));
      receipts.set(key(change.receipt.identity), structuredClone(change.receipt));
    }),
    commitDecision: vi.fn(async (change) => {
      if (receipts.has(key(change.receipt.identity))) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Duplicate operation');
      }
      if (sessions.states.get(change.session.sessionId)?.version !== change.expectedSessionVersion
        || requests.get(change.request.requestId)?.version !== change.expectedRequestVersion) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Decision changed');
      }
      sessions.states.set(change.session.sessionId, structuredClone(change.session));
      requests.set(change.request.requestId, structuredClone(change.request));
      receipts.set(key(change.receipt.identity), structuredClone(change.receipt));
    }),
  };
  const values: IParticipationValuesPort = {
    nextId: () => 'request-' + ++sequence,
    nextVersion: () => 'version-' + ++sequence,
    nextRequestReference: () => 'reference-' + ++sequence,
    now: () => sessions.values.now(),
  };
  const identity: IParticipationIdentityPort = {
    request: (input) => JSON.stringify(input), decision: (input) => JSON.stringify(input),
  };

  return { sessions, requests, receipts, store, values, identity };
}
