import type { Session } from '../../../domain/participation/session.js';

export interface ICreateSessionInput {

  readonly siteId: string;
  readonly actorId: string;
  readonly pageId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timeZone: string;
  readonly capacity: number;
}

export interface ICreateSession {
  execute(input: ICreateSessionInput): Promise<Session>;
}
