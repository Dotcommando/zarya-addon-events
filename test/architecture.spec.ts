import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);

    return entry.isDirectory() ? sources(filename) : [filename];
  });
}

it('keeps application/domain/ports inward and imports only versioned host contracts', () => {
  const root = path.resolve('src');
  const files = sources(root).filter((filename) => filename.endsWith('.ts'));

  for (const filename of files) {
    const layer = path.relative(root, filename).split(path.sep)[0];
    const tree = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    const inspect = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
        && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;

        expect(specifier, filename).not.toMatch(/cms-zarya|\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\//);

        if (specifier.startsWith('.')) {
          const target = path.resolve(path.dirname(filename), specifier.replace(/\.js$/, '.ts'));
          const targetLayer = path.relative(root, target).split(path.sep)[0];
          const allowed = layer === 'domain' ? ['domain'] : layer === 'ports' ? ['ports', 'domain']
            : layer === 'app' ? ['app', 'ports', 'domain'] : ['infra', 'adapters', 'ports', 'domain'];

          expect(files, filename).toContain(target);
          expect(allowed, filename).toContain(targetLayer);
        } else if (['domain', 'ports', 'app'].includes(layer ?? '')) {
          expect(specifier, filename).toMatch(/^@zarya\/addon-contracts\//);
        }
      }
      ts.forEachChild(node, inspect);
    };

    inspect(tree);
  }
});
