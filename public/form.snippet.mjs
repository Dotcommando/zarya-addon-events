export const participationFormCode = `
const ids = input.pageIds ? input.pageIds.split(',').map(value => value.trim()) : [context.pageId];
const seen = new Set();
const games = (context.publishedPages || []).filter(page => ids.includes(page.pageId) && !seen.has(page.pageId) && seen.add(page.pageId))
  .map(page => ({ pageId: page.pageId, title: page.title }));
return { pageId: context.pageId, games };
`;
