import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import ix from 'eslint-plugin-import-x';
import { globalIgnores, defineConfig } from 'eslint/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/*.spec.ts',
    '**/jest.config.*',
    '**/jest.setup.ts',
    '**/setup.ts',
    '**/tests/fixtures/**',
    '**/tests/helpers/**',
    '**/docs/architecture/code/**',
  ]),
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
    },
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: { ix },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'ix/order': [
        'error',
        {
          groups: [
            ['builtin'],
            ['external'],
            ['internal'],
            ['parent', 'sibling'],
            ['index'],
          ],
          'pathGroups': [
            { pattern: '@trading-model/**', group: 'internal', position: 'after' },
          ],
          'pathGroupsExcludedImportTypes': ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
        },
      ],
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: [
            'packages/*/tsconfig.json',
            'packages/*/tsconfig.build.json',
            'services/*/tsconfig.json',
          ],
        },
      },
    },
  },
]);
