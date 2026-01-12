import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { globalIgnores, defineConfig } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
    },
  },
  tseslint.configs.recommended,
])