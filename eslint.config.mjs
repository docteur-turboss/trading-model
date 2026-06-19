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
    '**/jest.config.*',
    '**/jest.setup.ts',
    '**/setup.ts',
    '**/docs/architecture/code/**',
    '**/knexfile.ts',
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
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/tests/**', '**/integration/**'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.*'],
        },
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
          noWarnOnMultipleProjects: true,
        },
      },
    },
  },
  {
    files: ['**/tests/**/*.{ts,tsx}', '**/integration/**/*.{ts,tsx}'],
    ignores: ['**/node_modules/**'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-useless-assignment': 'off',
    },
  },
]);
