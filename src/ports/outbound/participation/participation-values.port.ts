export interface IParticipationValuesPort {
  nextId(): string;
  nextVersion(): string;
  nextRequestReference(): string;
  now(): Date;
}
