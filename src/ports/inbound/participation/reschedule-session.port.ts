import type { IAdminSession } from '../../../domain/participation/participation-query.js';
import type { IRemoveSessionInput } from './remove-session.port.js';

export interface IRescheduleSessionInput extends IRemoveSessionInput {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timeZone: string;
  readonly capacity: number;
}

export interface IRescheduleSession { execute(input: IRescheduleSessionInput): Promise<IAdminSession>; }
