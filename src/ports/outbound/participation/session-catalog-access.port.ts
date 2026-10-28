export interface ISessionCatalogAccessPort {
  requireAdministrator(siteId: string, actorId: string): Promise<void>;
}
