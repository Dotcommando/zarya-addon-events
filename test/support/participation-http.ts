export function createdSession(value: unknown): { sessionId: string } {
  if (!value || typeof value !== 'object' || !('sessionId' in value) || typeof value.sessionId !== 'string') {
    throw new Error('Missing session response');
  }

  return { sessionId: value.sessionId };
}

export function requestList(value: unknown): { items: { requestId: string; version: string }[] } {
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)) {
    throw new Error('Missing request list');
  }

  return {
    items: value.items.map((item: unknown) => {
      if (!item || typeof item !== 'object' || !('requestId' in item) || typeof item.requestId !== 'string'
      || !('version' in item) || typeof item.version !== 'string') {
        throw new Error('Invalid request response');
      }

      return { requestId: item.requestId, version: item.version };
    }),
  };
}

export function decisionState(value: unknown): string {
  if (!value || typeof value !== 'object' || !('state' in value) || typeof value.state !== 'string') {
    throw new Error('Missing decision state');
  }

  return value.state;
}
