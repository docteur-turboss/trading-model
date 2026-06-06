# Writing Standards (Code & JSDoc)

## Why

Ensure readability, maintainability, and compatibility with automated tools (ESLint, Prettier, JSDoc generation). Uniform writing conventions reduce cognitive load during code reviews and ease onboarding for new contributors.

## Code Style (Prettier)

Configuration `.prettierrc` applied across the entire monorepo:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
```

Run: `npx prettier --check .` (CI) / `npx prettier --write .` (local formatting).

## Naming Conventions

| Element                | Convention        | Example                                |
| ---------------------- | ----------------- | -------------------------------------- |
| Variables              | `camelCase`       | `const addressManager = ...`           |
| Functions              | `camelCase`       | `function validateToken() {}`          |
| Booleans               | `camelCase`       | `const isTokenExpired = true`          |
| Classes                | `PascalCase`      | `export class AddressManager {}`       |
| Interfaces             | `PascalCase`      | `export interface ServiceRegistry`     |
| Types                  | `PascalCase`      | `export type TokenPayload = {}`        |
| Enums                  | `PascalCase`      | `export enum AuthMethod {}`            |
| Files and directories  | `kebab-case`      | `address-manager.service.ts`           |
| Global constants       | `SCREAMING_SNAKE` | `export const DEFAULT_TIMEOUT = 30000` |
| Service file suffix    | `.service.ts`     | `token-manager.service.ts`             |
| Controller file suffix | `.controller.ts`  | `wallet-manager.controller.ts`         |
| Middleware file suffix | `.middleware.ts`  | `auth.middleware.ts`                   |
| Repository file suffix | `.repository.ts`  | `user.repository.ts`                   |
| Utility file suffix    | `.util.ts`        | `string.util.ts`                       |
| Test file suffix       | `.spec.ts`        | `user.service.spec.ts`                 |

### Correct vs Incorrect Examples

```typescript
// ✓ CORRECT
const addressManager = new AddressManager();
const tokenRefreshInterval = 3600000;
function validateAuthToken(token: string): boolean {}

// ✗ INCORRECT
const AddressManager = new AddressManager(); // PascalCase for a variable
const address_manager = new AddressManager(); // snake_case
const ADDRESSMANAGER = new AddressManager(); // CONSTANT (incorrect usage)
```

```typescript
// ✓ CORRECT
export class AddressManager {}
export class TokenValidator {}
export interface ServiceRegistry {}
export enum AuthMethod {
  MTLS,
  JWT,
  NONE,
}

// ✗ INCORRECT
export class addressManager {} // camelCase for a class
export interface service_registry {} // snake_case
```

```typescript
// ✓ CORRECT - Directories and files
services/discovery-server/
services/financial-scraper/        // Not "scrapper"
packages/address-manager/

// ✗ INCORRECT
services/DiscoveryServer/
services/Financial_Scrapper/       // Snake case
```

## ESLint

Configuration in **flat config** (eslint.config.mjs) — ESLint v10, shared across the monorepo:

```javascript
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
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
    languageOptions: { ecmaVersion: 'latest', globals: globals.node },
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
  },
]);
```

- **TypeScript strict** enabled
- **0 ESLint errors allowed** in CI
- Warnings are tolerated short-term but should trend toward 0

## Code Organization

The monorepo uses npm workspaces:

```
trading-model/
├── packages/     # Shared libraries (@trading-model/*)
├── services/     # Microservices (kebab-case directory names)
│   └── <service>/
│       ├── src/
│       │   ├── app/           # Entry points & routes
│       │   ├── config/        # Environment & app config
│       │   ├── core/          # Business logic (services, repositories)
│       │   ├── controllers/   # HTTP controllers
│       │   ├── middleware/    # Express middleware
│       │   └── types/         # Type definitions
│       ├── tests/
│       │   ├── unit/
│       │   ├── integration/
│       │   └── e2e/
│       └── docs/
├── docs/         # Centralized documentation
└── scripts/      # Automation scripts
```

## Import Order

```typescript
// 1. Node built-ins
import fs from 'fs';
import path from 'path';

// 2. External dependencies
import express, { Request, Response } from 'express';
import { z } from 'zod';

// 3. Workspace packages (sub-path exports)
import { logger } from '@trading-model/common';
import AddressManager from '@trading-model/address-manager';

// 4. Internal relative imports
import { ServiceRegistry } from '../core/ServiceRegistry';
import { validateToken } from '../middleware/auth.middleware';

// 5. Side effects
import './setup-tests';
```

## JSDoc

Refer to the full document: [docs/JSDOC_STANDARD.md](../JSDOC_STANDARD.md)

### Rule Summary

- **3rd person singular verb**: Returns, Parses, Validates, Creates
- **No `@param` type** — TypeScript already provides it
- **No `@returns` type** — TypeScript already provides it
- **Dash separator** for `@param`: `@param name - Description`
- **`@throws`** only for non-obvious cases
- **One line** if the description fits: `/** Parse a JWT and return the payload. */`
- **No `@typedef`** — write real TypeScript types
- **No `@example`** unless the usage is truly non-obvious

### Examples

#### Good JSDoc

```typescript
/** Fetch candle data from Binance for the given symbol and interval. */
export async function fetchCandles(symbol: string, interval: string): Promise<Candle[]> {

/**
 * Register a service instance so it can be discovered by peers.
 * Sends a POST to the discovery-server with TTL-based lease.
 *
 * @param instance - Service metadata to register.
 * @returns The server response with assigned lease duration.
 * @throws If the discovery-server is unreachable after 3 retries.
 */
export async function register(instance: ServiceInstance): Promise<RegistrationResponse> {

/**
 * Decay the learning rate over time using a cosine schedule.
 *
 * @param step - Current training step (0-indexed).
 * @param totalSteps - Total steps in the schedule.
 * @returns The decayed learning rate in [0, 1].
 */
export function cosineDecay(step: number, totalSteps: number): number {
```

#### Bad JSDoc

```typescript
/**
 * Add function
 * @param a - The first number
 * @param b - The second number
 * @returns The result
 */
export function add(a: number, b: number): number { return a + b; }
// Why: The signature says it all. JSDoc is redundant.

/**
 * @param url - Url
 * @returns Promise with data
 */
export async function get<T>(url: string): Promise<T> { ... }
// Why: Parameters and return just repeat the types.
```

### Code Examples

#### Good Code

```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
});

export const config = envSchema.parse(process.env);

export class UserService {
  constructor(private userRepository: UserRepository) {}

  async getUser(id: string) {
    return this.userRepository.findById(id);
  }
}
```

#### Bad Code

```typescript
const userRepository = new UserRepository();
export class UserService {
  async getUser(id: string) {
    return userRepository.findById(id); // Global singleton — not injectable
  }
}

const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  DATABASE_URL: process.env.DATABASE_URL,
}; // No validation — silent errors
```

## TypeScript Configuration (Strict)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "node16",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node16"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/tests/**/*", "src/**/*.test.ts"]
}
```

Path aliases (`@/`, `@lib/`, etc.) have been removed. Services use direct workspace package imports (`@trading-model/*`) or relative imports.

## References

- [docs/JSDOC_STANDARD.md](../JSDOC_STANDARD.md) — Complete JSDoc standard
- [docs/CONTRIBUTING.md](../CONTRIBUTING.md) — Contribution guide
