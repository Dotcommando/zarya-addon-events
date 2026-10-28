export interface IPublicSessionPagePort {
  isPublished(siteId: string, pageId: string): Promise<boolean>;
}
