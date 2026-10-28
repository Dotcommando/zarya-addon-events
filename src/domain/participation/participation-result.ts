import type { ParticipationState } from './participation-state.enum.js';

export interface IParticipationReceipt {
  readonly requestReference: string;
  readonly sessionId: string;
  readonly places: number;
  readonly state: ParticipationState.Pending;
  readonly acceptedAt: Date;
}

export interface IParticipationDecision {
  readonly requestId: string;
  readonly sessionId: string;
  readonly places: number;
  readonly requestVersion: string;
  readonly decidedAt: Date;
}

export interface IConfirmedParticipation extends IParticipationDecision {
  readonly state: ParticipationState.Confirmed;
}

export interface IDeclinedParticipation extends IParticipationDecision {
  readonly state: ParticipationState.Declined;
}
