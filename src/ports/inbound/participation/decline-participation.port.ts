import type { IDeclinedParticipation } from '../../../domain/participation/participation-result.js';
import type { IParticipationDecisionInput } from './participation-decision.input.js';

export interface IDeclineParticipation {
  execute(input: IParticipationDecisionInput): Promise<IDeclinedParticipation>;
}
