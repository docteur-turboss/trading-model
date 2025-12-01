import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { globalIgnores, defineConfig } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  { 
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"], 
    plugins: { js }, 
    extends: [js.configs.recommended],
    languageOptions: { 
      ecmaVersion: 'latest',
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'warn',
    },
  },
  tseslint.configs.recommended,
]);
