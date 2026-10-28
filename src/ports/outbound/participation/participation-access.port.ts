export enum ParticipationPermission {
  CreateSession = 'CreateSession',
  ReadSessions = 'ReadSessions',
  ReadRequests = 'ReadRequests',
  Confirm = 'Confirm',
  Decline = 'Decline',
}

export interface IParticipationAccessPort {
  requirePermission(siteId: string, actorId: string, permission: ParticipationPermission): Promise<void>;
}
