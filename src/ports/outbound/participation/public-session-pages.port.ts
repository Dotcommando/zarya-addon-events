export interface IPublicSessionPagesPort {
  findPublished(siteId: string, pageIds: readonly string[]): Promise<readonly string[]>;
}
