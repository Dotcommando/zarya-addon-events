import type { IConfirmedParticipation } from '../../../domain/participation/participation-result.js';
import type { IParticipationDecisionInput } from './participation-decision.input.js';

export interface IConfirmParticipation {
  execute(input: IParticipationDecisionInput): Promise<IConfirmedParticipation>;
}
