import { ESLint } from 'eslint';

describe('multiline if condition formatting', () => {
  const linter = new ESLint({
    fix: true,
    overrideConfig: [{
      rules: {
        'no-undef': 'off',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
      },
    }],
  });
  const format = async (condition: string, filePath = 'scripts/condition-fixture.mjs'): Promise<string> => {
    const source = condition + ' {\n  throw new Error(\'Unavailable\');\n}\n';
    const [result] = await linter.lintText(source, { filePath });

    expect(result!.messages).toEqual([]);

    return result!.output ?? source;
  };

  it('puts every clause and the outer closing parenthesis on separate lines', async () => {
    const result = await format('if (release?.state !== Ready || !release.manifest\n'
      + '  || release.siteId !== siteId || release.releaseId !== releaseId)');

    expect(result).toBe('if (\n'
      + '  release?.state !== Ready\n'
      + '  || !release.manifest\n'
      + '  || release.siteId !== siteId\n'
      + '  || release.releaseId !== releaseId\n'
      + ') {\n  throw new Error(\'Unavailable\');\n}\n');
    const [again] = await linter.lintText(result, { filePath: 'scripts/condition-fixture.mjs' });

    expect(again!.messages).toEqual([]);
    expect(again!.output).toBeUndefined();
  });

  it('preserves compact single-line conditions', async () => {
    expect(await format('if (ready && allowed)')).toContain('if (ready && allowed) {');
  });

  it('keeps mixed precedence and explicit grouping', async () => {
    expect(await format('if (ready\n  || (allowed && enabled))')).toContain('if (\n'
      + '  ready\n'
      + '  || (allowed\n'
      + '  && enabled)\n'
      + ') {');
  });

  it('moves operators to the next clause instead of leaving them at line ends', async () => {
    expect(await format('if (ready &&\n  allowed || enabled)')).toContain('if (\n'
      + '  ready\n'
      + '  && allowed\n'
      + '  || enabled\n'
      + ') {');
  });

  it('preserves comments without commenting out operands or dropping explanations', async () => {
    expect(await format('if (/* state */ ready || // permission\n  allowed || /* fallback */ enabled)'))
      .toBe('if (\n'
        + '  /* state */ ready // permission\n'
        + '  || allowed\n'
        + '  || /* fallback */ enabled\n'
        + ') {\n  throw new Error(\'Unavailable\');\n}\n');
  });

  it('leaves boolean expressions inside nested callbacks compact', async () => {
    expect(await format('if (items.some(item => item.ready && item.allowed)\n  || fallback)'))
      .toContain('if (\n  items.some(item => item.ready && item.allowed)\n  || fallback\n) {');
  });

  it('wraps conditions that already have separate parentheses but still pack clauses together', async () => {
    expect(await format('if (\n  ready || allowed\n)'))
      .toContain('if (\n  ready\n  || allowed\n) {');
  });

  it('preserves CRLF when inserting condition line breaks', async () => {
    expect(await format('if (ready\r\n  || allowed)'))
      .toContain('if (\r\n  ready\r\n  || allowed\r\n) {');
  });

  it('formats script conditions in Svelte through the same root rule', async () => {
    const [result] = await linter.lintText('<script lang="ts">\n'
      + 'if (ready || allowed\n  || fallback) {\n  throw new Error(\'Unavailable\');\n}\n'
      + '</script>\n<div></div>\n', { filePath: 'admin/src/EventsAdmin.svelte' });

    expect(result!.messages).toEqual([]);
    expect(result!.output).toContain('if (\n  ready\n  || allowed\n  || fallback\n) {');
  });

  it('handles TypeScript conditions through the root configuration', async () => {
    expect(await format('if (entry!.ready\n  || fallback)', 'test/eslint-conditions.spec.ts'))
      .toContain('if (\n  entry!.ready\n  || fallback\n) {');
  });
});
