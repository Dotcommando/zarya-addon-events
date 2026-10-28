export interface IParticipationDecisionInput {
  readonly siteId: string;
  readonly actorId: string;
  readonly requestId: string;
  readonly expectedRequestVersion: string;
  readonly idempotencyKey: string;
}
