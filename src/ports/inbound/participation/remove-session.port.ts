export enum SessionRemovalOutcome { Removed = 'Removed', Cancelled = 'Cancelled' }

export interface IRemoveSessionInput {
  readonly siteId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly expectedVersion: string;
}

export interface IRemoveSession {
  execute(input: IRemoveSessionInput): Promise<{ readonly outcome: SessionRemovalOutcome }>;
}
