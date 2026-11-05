export interface IPendingRequestCountsPort {
  pendingCounts(siteId: string, sessionIds: readonly string[]): Promise<ReadonlyMap<string, number>>;
}
