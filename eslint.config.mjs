import path from 'node:path';
import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const multilineIfConditionRule = {
  meta: {
    type: 'layout',
    docs: { description: 'Keep multiline if clauses and outer parentheses on separate lines.' },
    fixable: 'whitespace',
    schema: [],
    messages: { layout: 'Put multiline if clauses and the closing parenthesis on separate lines.' },
  },
  create(context) {
    const source = context.sourceCode;

    return {
      IfStatement(node) {
        const open = source.getTokenAfter(source.getFirstToken(node));
        const close = source.getTokenBefore(node.consequent);

        if (open.loc.start.line === close.loc.end.line) {
          return;
        }

        const newline = source.text.includes('\r\n') ? '\r\n' : '\n';
        const indent = source.lines[node.loc.start.line - 1].match(/^\s*/)[0];
        const edits = [];
        const breakBefore = (token, indentation) => {
          const before = source.getTokenBefore(token, { includeComments: true });

          if (before.loc.end.line === token.loc.start.line) {
            edits.push({ range: [before.range[1], token.range[0]], text: newline + indentation });
          }
        };
        const first = source.getTokenAfter(open, { includeComments: true });

        breakBefore(first, indent + '  ');
        breakBefore(close, indent);
        const visit = (expression) => {
          if (expression.type !== 'LogicalExpression') {
            return;
          }
          visit(expression.left);
          const operator = source.getTokenAfter(expression.left, (token) => token.value === expression.operator);
          const after = source.getTokenAfter(operator, { includeComments: true });          // Let operator-linebreak move an operator past a trailing line comment first.
          const trailingComments = source.getTokensBetween(operator, source.getFirstToken(expression.right), {
            includeComments: true,
          });

          if (trailingComments.some((token) => token.type === 'Line')) {
            visit(expression.right);

            return;
          }
          breakBefore(operator, indent + '  ');

          if (operator.loc.end.line !== after.loc.start.line) {
            edits.push({ range: [operator.range[1], after.range[0]], text: ' ' });
          }
          visit(expression.right);
        };

        visit(node.test);

        if (edits.length) {
          context.report({
            node: node.test,
            messageId: 'layout',
            fix: (fixer) => edits.map((edit) => fixer.replaceTextRange(edit.range, edit.text)),
          });
        }
      },
    };
  },
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.tmp/**',
      'data/**',
      '.serena/**',
      '.git/**',
      '.idea/**',
      '**/dist-test/**',
      '**/build/**',
      '**/generated/**',
      'plans/**',
      'experiments/results/**',
      'artifacts/**',
      '.temp/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,mts,cts,js,mjs,cjs,svelte}'],
    plugins: {
      '@stylistic': stylistic,
      'simple-import-sort': simpleImportSort,
      zarya: { rules: { 'multiline-if-condition': multilineIfConditionRule } },
    },
    rules: {
      'zarya/multiline-if-condition': 'error',
      'padding-line-between-statements': 'off',
      '@stylistic/padding-line-between-statements': [
        'error',
        {
          blankLine: 'always',
          prev: [
            'const',
            'let',
            'var',
          ],
          next: '*',
        },
        {
          blankLine: 'never',
          prev: [
            'const',
            'let',
            'var',
          ],
          next: [
            'const',
            'let',
            'var',
          ],
        },
        {
          blankLine: 'always',
          prev: '*',
          next: [
            'if',
            'for',
            'while',
            'switch',
            'try',
            'do',
          ],
        },
        {
          blankLine: 'always',
          prev: 'if',
          next: [
            'const',
            'let',
            'var',
          ],
        },
        {
          blankLine: 'always',
          prev: '*',
          next: 'return',
        },
        {
          blankLine: 'never',
          prev: 'if',
          next: 'if',
        },
        {
          blankLine: 'always',
          prev: {
            selector: 'Program > *',
          },
          next: '*',
        },
        {
          blankLine: 'any',
          prev: 'import',
          next: 'import',
        },
      ],
      '@stylistic/lines-between-class-members': [
        'error',
        {
          enforce: [
            {
              blankLine: 'always',
              prev: 'method',
              next: '*',
            },
            {
              blankLine: 'always',
              prev: '*',
              next: 'method',
            },
          ],
        },
        {
          exceptAfterSingleLine: false,
          exceptAfterOverload: false,
        },
      ],
      '@stylistic/no-multiple-empty-lines': [
        'error',
        {
          max: 1,
          maxBOF: 0,
          maxEOF: 1,
        },
      ],
      '@stylistic/keyword-spacing': [
        'error',
        {
          before: true,
          after: true,
        },
      ],
      '@stylistic/space-infix-ops': 'error',
      '@stylistic/space-before-blocks': [
        'error',
        'always',
      ],
      '@stylistic/no-multi-spaces': 'error',
      '@stylistic/quotes': [
        'error',
        'single',
        {
          avoidEscape: true,
        },
      ],
      'max-len': 'off',
      '@stylistic/operator-linebreak': [
        'error',
        'before',
        {
          overrides: {
            '=': 'after',
            '===': 'before',
            '?': 'before',
            ':': 'before',
            '&&': 'before',
            '||': 'before',
          },
        },
      ],
      '@stylistic/comma-dangle': [
        'error',
        {
          arrays: 'always-multiline',
          objects: 'always-multiline',
          imports: 'always-multiline',
          exports: 'always-multiline',
          functions: 'always-multiline',
          enums: 'always-multiline',
          tuples: 'always-multiline',
          generics: 'always-multiline',
        },
      ],
      '@stylistic/comma-spacing': [
        'error',
        {
          before: false,
          after: true,
        },
      ],
      '@stylistic/array-bracket-spacing': [
        'error',
        'never',
      ],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@stylistic/object-curly-newline': [
        'error',
        {
          ObjectExpression: {
            multiline: true,
            consistent: true,
          },
          ImportDeclaration: {
            multiline: true,
            consistent: true,
          },
          ExportDeclaration: {
            multiline: true,
            consistent: true,
          },
        },
      ],
      '@stylistic/object-property-newline': [
        'error',
        {
          allowAllPropertiesOnSameLine: true,
        },
      ],
      '@stylistic/indent': [
        'error',
        2,
        {
          SwitchCase: 1,
        },
      ],
      '@stylistic/brace-style': [
        'error',
        '1tbs',
        {
          allowSingleLine: false,
        },
      ],
      '@stylistic/max-statements-per-line': [
        'error',
        {
          max: 1,
        },
      ],
      curly: [
        'error',
        'all',
      ],
      'one-var': [
        'error',
        'never',
      ],
      '@stylistic/object-curly-spacing': [
        'error',
        'always',
      ],
      '@stylistic/type-annotation-spacing': 'error',
      '@stylistic/arrow-spacing': [
        'error',
        {
          before: true,
          after: true,
        },
      ],
      '@stylistic/key-spacing': [
        'error',
        {
          beforeColon: false,
          afterColon: true,
        },
      ],
      '@stylistic/space-in-parens': [
        'error',
        'never',
      ],
      '@stylistic/block-spacing': [
        'error',
        'always',
      ],
      '@stylistic/semi': [
        'error',
        'always',
      ],
      '@stylistic/eol-last': [
        'error',
        'always',
      ],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/function-call-spacing': [
        'error',
        'never',
      ],
      '@stylistic/max-len': [
        'error',
        {
          code: 120,
          tabWidth: 2,
          ignoreUrls: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
          ignorePattern: "^\\s*(?:(?:[?:+]\\s*)?['\"`].*['\"`][,;]?\\s*|//.*)$",
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.{ts,mts,cts,svelte}'],
    languageOptions: {
      globals: { ...globals.node },
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
        project: path.join(__dirname, 'tsconfig.eslint.json'),
        tsconfigRootDir: __dirname,
      },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off',
      '@typescript-eslint/prefer-optional-chain': [
        'error',
        {
          allowPotentiallyUnsafeFixesThatModifyTheReturnTypeIKnowWhatImDoing: true,
        },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: false,
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MethodDefinition[kind!=constructor][kind!=set] > FunctionExpression:not([returnType])',
          message: 'Methods must declare a return type.',
        },
        { selector: 'TSObjectKeyword', message: 'Use precise interfaces.' },
        {
          selector:
            'PropertyDefinition > :matches(ArrowFunctionExpression, FunctionExpression):not([returnType])',
          message: 'Methods must declare a return type.',
        },
        {
          selector:
            'Property[method=true][kind!=set] > FunctionExpression:not([returnType])',
          message: 'Methods must declare a return type.',
        },
      ],
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'never',
        },
      ],
    },
  },
  ...svelte.configs['flat/recommended'],
  {
    files: ['admin/**/*.svelte'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        parser: tsParser,
        project: path.join(__dirname, 'admin/tsconfig.json'),
        extraFileExtensions: ['.svelte'],
      },
    },
  },
  {
    files: ['admin/src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
];
