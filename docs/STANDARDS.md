# 📐 Standards Cibles - Trading Model

**Date**: 18 Mai 2026  
**Scope**: Refactorisation complète du repo  
**Timeline**: 4-6 semaines

---

## 🎯 Vue d'ensemble

Ce document définit les conventions et standards qui seront appliqués à tout le projet après refactorisation.

**Principe**: **ONE WAY OF DOING THINGS** - Une seule manière de faire chaque chose.

---

## 1️⃣ STRUCTURE DES DOSSIERS

### Standard Global

```
trading-model/                          # Monorepo root
├── .github/
│   └── workflows/                      # GitHub Actions
│       ├── lint.yml
│       ├── test.yml
│       └── build.yml
├── docs/                               # Documentation centralisée
│   ├── ARCHITECTURE.md                 # Vue d'ensemble
│   ├── API.md                          # Endpoints
│   ├── SECURITY.md
│   ├── STANDARDS.md                    # This file
│   ├── SETUP.md                        # Setup local
│   ├── TESTING.md                      # Tests standard
│   ├── deployment/                     # Guides déploiement
│   ├── packages/                       # Package docs
│   │   ├── common/
│   │   ├── address-manager/
│   │   └── broker-message/
│   └── branch-docs/                    # Branch plans
├── packages/                           # Shared libraries (npm workspaces)
│   ├── common/                         # @trading-model/common
│   ├── address-manager/                # @trading-model/address-manager
│   └── broker-message/                 # @trading-model/broker-message
├── services/                           # Microservices
│   ├── discovery-server/               # Service Discovery
│   ├── financial-scraper/              # Financial Data
│   ├── message-manager/                # Inter-service messaging
│   └── trader-trainer/                 # ML Training
├── .env.example                        # Environment template
├── .gitignore                          # Git ignore patterns
├── package.json                        # Root package.json
├── eslint.config.mjs                   # Root eslint (flat config)
├── README.md                           # Project README
└── LICENSE.md
```

### Standard Par Service

```
service-name/                           # Always kebab-case
├── src/
│   ├── app/                            # Entry point(s)
│   │   ├── index.ts                    # Main app setup
│   │   └── routes/                     # Route definitions
│   ├── config/                         # Configuration
│   │   ├── env.ts                      # Environment variables
│   │   ├── database.ts                 # DB config (if needed)
│   │   └── constants.ts                # App constants
│   ├── core/                           # Business logic
│   │   ├── services/                   # Core services
│   │   ├── repositories/               # Data access layer
│   │   └── types/                      # Domain types
│   ├── controllers/                    # HTTP controllers
│   │   └── *.controller.ts             # One controller per file
│   ├── middleware/                     # Express middleware
│   │   ├── auth.middleware.ts
│   │   ├── error-handler.middleware.ts
│   │   └── request-logger.middleware.ts
│   ├── utils/                          # Utility functions
│   │   └── *.util.ts
│   ├── types/                          # Type definitions
│   │   └── index.ts
│   └── shared/                         # Local shared code (if needed)
├── tests/                              # All test files
│   ├── unit/                           # Unit tests
│   │   ├── services/
│   │   ├── controllers/
│   │   └── utils/
│   ├── integration/                    # Integration tests
│   ├── e2e/                            # End-to-end tests
│   ├── fixtures/                       # Test data
│   └── helpers/                        # Test utilities
├── docs/                               # Service-specific docs
│   ├── API.md                          # This service's API
│   └── README.md                       # Service README
├── .env.example                        # Environment template
├── package.json
├── tsconfig.json
├── eslint.config.mjs
├── jest.config.js
└── README.md
```

### Standard Pour packages/*/ (Shared Packages)

```
packages/<name>/                        # e.g. common, address-manager, broker-message
├── src/
│   ├── config/                         # Configuration, types, constants
│   ├── middleware/                      # Express middleware (if applicable)
│   ├── server/                         # Server factories (if applicable)
│   ├── validation/                     # Zod schemas, validators
│   ├── contracts/                      # Shared DTOs/interfaces
│   ├── crypto/                         # Crypto utilities
│   ├── utils/                          # Error classes, helpers
│   └── index.ts                        # Package entry point
├── tests/                              # Unit tests (co-located in src for some)
├── docs/                               # Package documentation
│   └── README.md
├── package.json
├── tsconfig.json
├── tsconfig.build.json                 # Build-specific tsconfig
├── jest.config.js
└── README.md
```

---

## 2️⃣ NAMING CONVENTIONS

### Services (Kebab-case, lowercase)
```typescript
// ✓ CORRECT
discovery-server/
financial-scraper/        // Not "scrapper"
message-manager/
trader/
trader-trainer/

// ✗ INCORRECT
DiscoveryServer/
Discovery_Server/
Financial_Scrapper/       // Snake case
```

### Files (kebab-case, lowercase)
```typescript
// ✓ CORRECT
address-manager.ts
token-manager.ts
token-refresh-job.ts
service-discovery.ts
error-handler.middleware.ts
auth.middleware.ts
wallet-manager.controller.ts

// ✗ INCORRECT
AddressManager.ts         // PascalCase
address_manager.ts        // snake_case
addressManager.ts         // camelCase
```

### Directories (kebab-case, lowercase)
```
// ✓ CORRECT
src/
src/core/
src/services/
src/repositories/
src/middleware/
src/utils/

// ✗ INCORRECT
src/Core/
src/Services/
src/Middleware/
```

### Variables & Functions (camelCase)
```typescript
// ✓ CORRECT
const addressManager = new AddressManager();
const tokenRefreshInterval = 3600000;
function validateAuthToken(token: string): boolean {}
const addressCache = new Map();
const isTokenExpired = true;

// ✗ INCORRECT
const AddressManager = new AddressManager();    // PascalCase
const address_manager = new AddressManager();   // snake_case
const ADDRESSMANAGER = new AddressManager();    // CONSTANT (wrong)
```

### Classes & Types (PascalCase)
```typescript
// ✓ CORRECT
export class AddressManager {}
export class TokenValidator {}
export interface ServiceRegistry {}
export type TokenPayload = {}
export enum AuthMethod { MTLS, JWT, NONE }

// ✗ INCORRECT
export class addressManager {}              // camelCase
export interface service_registry {}        // snake_case
export enum auth_method {}                  // snake_case
```

### Constants (SCREAMING_SNAKE_CASE)
```typescript
// ✓ CORRECT
export const DEFAULT_TIMEOUT = 30000;
export const MAX_TOKEN_LIFETIME = 3600;
export const SERVICE_DISCOVERY_PORT = 3000;

// ✗ INCORRECT
export const defaultTimeout = 30000;        // camelCase
export const DEFAULT_timeout = 30000;       // Mixed
```

### Test Files (kebab-case with .spec.ts or .test.ts)
```
// ✓ CORRECT (pick ONE and stick with it)
address-manager.spec.ts    // Jest convention
token-validator.spec.ts
service-discovery.spec.ts

// ✗ INCORRECT
address-manager.test.ts    // Mix of .test.ts and .spec.ts
AddressManager.spec.ts     // PascalCase
address_manager.spec.ts    // snake_case
```

### Suffixes (Cohérents)
```typescript
// Controllers
*.controller.ts            // address-manager.controller.ts

// Services (business logic)
*.service.ts               // token-manager.service.ts

// Repositories (data access)
*.repository.ts            // user.repository.ts

// Middleware
*.middleware.ts            // error-handler.middleware.ts

// Utilities
*.util.ts                  // string.util.ts

// Types
*.type.ts                  // or keep in types/ folder
index.ts                   // Export all types

// Configurations
*.config.ts                // database.config.ts

// Tests
*.spec.ts                  // Single convention!
```

---

## 3️⃣ CODE STYLE

### Formatter: Prettier

```json
// .prettierrc
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

### Linter: ESLint (Comprehensive)

```javascript
// eslint.config.mjs - ROOT CONFIG (flat config, shared across monorepo)
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { globalIgnores, defineConfig } from 'eslint/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: {
        projectService: true,               // Auto-discover tsconfig per file
        tsconfigRootDir: __dirname,
      },
    },
  },
  tseslint.configs.recommended,
]);
```

### TypeScript Configuration (Strict)

```json
// tsconfig.json - PER SERVICE/PACKAGE (no root tsconfig)
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "node16",                    // or "commonjs" for packages
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
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
> **Note**: Path aliases (`@/`, `@lib/`, etc.) have been removed. Services use direct workspace package imports (`@trading-model/*`) or relative imports.

### Import Ordering

```typescript
// ✓ CORRECT ORDER:
// 1. Node built-ins
import fs from 'fs';
import path from 'path';

// 2. External dependencies
import express, { Request, Response } from 'express';
import { z } from 'zod';

// 3. Workspace package imports
import { logger } from '@trading-model/common';
import AddressManager from '@trading-model/address-manager';

// 4. Internal relative imports
import { ServiceRegistry } from '../core/ServiceRegistry';
import { validateToken } from '../middleware/auth.middleware';

// 5. Side effects
import './setup-tests';
```

---

## 4️⃣ ARCHITECTURE PATTERNS

### Dependency Injection
```typescript
// ✓ CORRECT - Constructor injection
export class UserService {
  constructor(private userRepository: UserRepository) {}
  
  async getUser(id: string) {
    return this.userRepository.findById(id);
  }
}

// ✗ INCORRECT - Global/singleton
const userRepository = new UserRepository();
export class UserService {
  async getUser(id: string) {
    return userRepository.findById(id);
  }
}
```

### Error Handling (Centralized)
```typescript
// ✓ CORRECT - Custom error class
export class ValidationError extends Error {
  constructor(public message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ✓ CORRECT - Global error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  res.status(statusCode).json({ error: message });
});
```

### Configuration Management
```typescript
// ✓ CORRECT - Zod validation + env loading
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
});

export const config = envSchema.parse(process.env);

// ✓ Usage
const port = config.PORT;
```

### Database/Repository Pattern
```typescript
// ✓ CORRECT
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

export class MongoUserRepository implements UserRepository {
  async findById(id: string) {
    return db.collection('users').findOne({ _id: id });
  }
  
  async save(user: User) {
    await db.collection('users').updateOne({ _id: user.id }, user);
  }
}
```

---

## 5️⃣ TESTING STANDARDS

### Test Structure
```
tests/
├── unit/                                # Isolated logic tests
│   ├── services/
│   │   └── user.service.spec.ts
│   ├── controllers/
│   │   └── user.controller.spec.ts
│   └── utils/
│       └── string.util.spec.ts
├── integration/                         # Service integration
│   ├── address-manager.integration.spec.ts
│   └── message-broker.integration.spec.ts
├── e2e/                                 # Full flow tests
│   └── trading-flow.e2e.spec.ts
├── fixtures/                            # Test data
│   ├── users.fixture.ts
│   └── orders.fixture.ts
└── helpers/                             # Test utilities
    ├── test-db.helper.ts
    └── mock-server.helper.ts
```

### Test Convention: .spec.ts ONLY

```typescript
// ✓ CORRECT
user.service.spec.ts
address-manager.spec.ts
token-validator.spec.ts

// ✗ INCORRECT (Never use .test.ts)
user.service.test.ts
```

### Test File Template

```typescript
// user.service.spec.ts
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { UserService } from '@core/services/user.service';
import { UserRepository } from '@core/repositories/user.repository';

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepository: jest.Mocked<UserRepository>;

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      save: jest.fn(),
    };
    userService = new UserService(mockUserRepository);
  });

  describe('getUser', () => {
    it('should return user when found', async () => {
      const userId = '123';
      const expectedUser = { id: userId, name: 'John' };
      mockUserRepository.findById.mockResolvedValue(expectedUser);

      const result = await userService.getUser(userId);

      expect(result).toEqual(expectedUser);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
    });

    it('should throw error when user not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.getUser('999')).rejects.toThrow('User not found');
    });
  });
});
```

### Jest Configuration

```javascript
// jest.config.js - PER PACKAGE/SERVICE
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec|test).[tj]s'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
```

### Coverage Threshold
```
MINIMUM: 80% (branches, functions, lines, statements)
GOAL: 90%+
CRITICAL PATHS: 100% (auth, security, core logic)
```

---

## 6️⃣ DOCUMENTATION STANDARDS

### README.md (Service)
```markdown
# Service Name

## Overview
Brief description

## Prerequisites
- Node.js 18+
- PostgreSQL 14+

## Installation
\`\`\`bash
npm install
\`\`\`

## Configuration
Copy .env.example to .env

## Running
\`\`\`bash
npm run dev
\`\`\`

## Testing
\`\`\`bash
npm test
npm run test:coverage
\`\`\`

## API Documentation
See [docs/API.md](docs/API.md)
```

### API Documentation (Service)
```markdown
# API Reference

## GET /api/users/:id
Get user by ID

### Request
- Path: /api/users/:id

### Response
\`\`\`json
{
  "id": "123",
  "name": "John",
  "email": "john@example.com"
}
\`\`\`

### Errors
- 404: User not found
- 500: Server error
```

### Architecture Decision Records (ADR)
```markdown
# ADR-001: Use MongoDB for Message Manager

## Context
...

## Decision
Use MongoDB for storing messages

## Consequences
- ✓ Flexible schema
- ✗ Eventual consistency
```

---

## 7️⃣ VERSION CONTROL STANDARDS

### Commit Message Format (Conventional Commits)
```
<type>(<scope>): <subject>

<body>

<footer>

// Examples:
feat(auth): add JWT token validation
fix(scraper): handle missing data fields
docs(api): update endpoint documentation
test(wallet): add unit tests for balance calculation
refactor(core): extract token validation logic
chore(deps): update typescript to 5.0
```

### Types
```
feat:     New feature
fix:      Bug fix
docs:     Documentation
style:    Formatting (prettier, eslint)
refactor: Code restructuring (no behavior change)
perf:     Performance improvement
test:     Test additions/modifications
chore:    Dependencies, tooling
ci:       CI/CD changes
```

### Git Hooks (Husky)
```bash
# pre-commit: Run prettier + eslint
# commit-msg: Validate conventional commits
# pre-push: Run tests + build
```

---

## 8️⃣ ENVIRONMENT VARIABLES

### Standard .env.example
```env
# App
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=mongodb://localhost:27017/trading-model
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-secret-key-min-32-chars-long
MTLS_CERT_PATH=/etc/ssl/certs/
MTLS_KEY_PATH=/etc/ssl/private/

# Service Discovery
SERVICE_REGISTRY_URL=http://discovery-server:3000

# External APIs
BINANCE_API_KEY=
BINANCE_API_SECRET=

# Monitoring
SENTRY_DSN=
NEW_RELIC_LICENSE_KEY=
```

### Loading Order (Priority)
```
1. .env.local (if exists) - NOT committed
2. .env.{NODE_ENV}.local - NOT committed
3. .env.{NODE_ENV} - Committed (production values sanitized)
4. .env - Committed
5. .env.example - Reference only
```

---

## 9️⃣ MONOREPO STRUCTURE

### Root package.json (npm workspaces)
```json
{
  "name": "trading-model",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "packages/*",
    "services/*"
  ],
  "scripts": {
    "build": "npm run build:common && npm run build:address-manager && npm run build:broker-message",
    "build:common": "npm run -w @trading-model/common build",
    "build:address-manager": "npm run -w @trading-model/address-manager build",
    "build:broker-message": "npm run -w @trading-model/broker-message build",
    "test": "npm test --workspaces --if-present",
    "eslint": "npx eslint src/**/*.{ts,js}"
  },
  "devDependencies": {
    "@eslint/js": "^10.x",
    "@jest/globals": "^30.x",
    "@types/jest": "^30.x",
    "@types/node": "^25.x",
    "eslint": "^10.x",
    "globals": "^17.x",
    "jest": "^30.x",
    "prettier": "^3.x",
    "ts-jest": "^29.x",
    "typescript": "^6.x",
    "typescript-eslint": "^8.x"
  }
}
```

---

## 🔟 GITHUB ACTIONS CI/CD

### Workflow: lint.yml
```yaml
name: Lint

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
```

### Workflow: test.yml
```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

---

## 📝 SUMMARY TABLE

| Aspect | Standard | Tool | Enforcement |
|--------|----------|------|-------------|
| **Naming** | kebab-case (files), camelCase (vars), PascalCase (classes) | ESLint | Pre-commit hook |
| **Formatting** | Prettier (100 width, 2 spaces) | Prettier | Pre-commit hook |
| **Linting** | ESLint strict + TypeScript | ESLint | Pre-commit hook |
| **Type Checking** | strict: true | TypeScript | CI/CD |
| **Testing** | Jest, 80%+ coverage, .spec.ts | Jest | CI/CD + threshold |
| **Commits** | Conventional Commits | Husky | Pre-commit hook |
| **Structure** | Service/package pattern | Manual | Code review |
| **CI/CD** | GitHub Actions | GHA | Required |
| **Monorepo** | npm workspaces | npm | package.json |

---

## ✅ Implementation Status

| Item | Status | Notes |
|------|--------|-------|
| Test file naming | ❌ Pending | Mix of `.spec.ts` and `.test.ts` |
| File naming (kebab-case) | ❌ Pending | Some files not yet renamed |
| Husky git hooks | ❌ Pending | Not yet configured |
| GitHub Actions workflows | ❌ Pending | Not yet created |
| Coverage thresholds | ❌ Pending | Not yet enforced in jest configs |