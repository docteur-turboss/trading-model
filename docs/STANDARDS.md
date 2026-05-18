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
│   ├── TESTING.md                      # Tests standard
│   ├── SETUP.md                        # Setup local
│   ├── deployment/                     # Guides déploiement
│   └── diagrams/                       # Mermaid diagrams
├── services/                           # Microservices
│   ├── discovery-server/               # Service Discovery
│   ├── financial-scraper/              # Financial Data
│   ├── message-manager/                # Inter-service messaging
│   ├── trader/                         # Trading logic
│   └── trader-trainer/                 # ML Training
├── packages/                           # Monorepo packages
│   └── lib/                            # Shared library
├── scripts/                            # Automation scripts
│   ├── dev-setup.sh
│   ├── build-all.sh
│   └── test-all.sh
├── .env.example                        # Environment template
├── .prettierrc                         # Prettier config
├── .gitignore                          # Git ignore patterns
├── package.json                        # Root package.json
├── tsconfig.json                       # Root tsconfig
├── tsconfig.build.json                 # Build tsconfig
├── eslint.config.mjs                   # Root eslint
├── jest.config.js                      # Root jest (optional)
├── AUDIT.md                            # Audit results (this file)
├── STANDARDS.md                        # This file
├── ARCHITECTURE.md                     # High-level architecture
├── CONTRIBUTING.md                     # Contribution guide
├── README.md                           # Project README
├── LICENSE.md
└── SECURITY.md
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

### Standard Pour lib/ (Shared Package)

```
packages/lib/                           # Shared library
├── src/
│   ├── address-manager/                # Service discovery & address management
│   │   ├── client/
│   │   ├── config/
│   │   ├── discovery/
│   │   ├── http/
│   │   ├── scheduler/
│   │   ├── types/
│   │   └── index.ts
│   ├── message-broker/                 # Inter-service messaging
│   │   ├── client/
│   │   ├── handlers/
│   │   ├── types/
│   │   └── index.ts
│   ├── common/                         # Common utilities
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── types/
│   │   ├── utils/
│   │   └── index.ts
│   ├── shared/                         # Shared types/constants
│   │   ├── types/
│   │   ├── constants/
│   │   └── index.ts
│   └── index.ts                        # Main entry point
├── tests/
│   └── (same structure as services)
├── package.json
├── tsconfig.json
└── eslint.config.mjs
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
// eslint.config.mjs - ROOT CONFIG (shared)
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: 'module',
        project: ['./tsconfig.json', './services/*/tsconfig.json', './packages/*/tsconfig.json'],
      },
    },
  },
  tseslint.configs.recommended,
  tseslint.configs.strict,
  {
    rules: {
      'no-console': 'warn',
      'no-unused-vars': 'off', // TypeScript handles this
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/explicit-function-return-types': 'warn',
      '@typescript-eslint/explicit-member-accessibility': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variable',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'variableLike',
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'className',
          format: ['PascalCase'],
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
      ],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          alphabeticalOrder: true,
          caseInsensitive: true,
        },
      ],
    },
  },
  {
    ignores: ['dist', 'node_modules', 'coverage', 'build'],
  },
];
```

### TypeScript Configuration (Strict)

```json
// tsconfig.json - ROOT
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@app/*": ["src/app/*"],
      "@core/*": ["src/core/*"],
      "@controllers/*": ["src/controllers/*"],
      "@middleware/*": ["src/middleware/*"],
      "@utils/*": ["src/utils/*"],
      "@types/*": ["src/types/*"],
      "@config/*": ["src/config/*"],
      "@lib/*": ["packages/lib/src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests", "coverage"]
}
```

### Import Ordering

```typescript
// ✓ CORRECT ORDER:
// 1. Node built-ins
import fs from 'fs';
import path from 'path';

// 2. External dependencies
import express, { Request, Response } from 'express';
import axios from 'axios';

// 3. Internal absolute imports (with @ paths)
import { AddressManager } from '@lib/address-manager';
import { validate } from '@lib/common/utils';

// 4. Internal relative imports
import { UserController } from '../controllers/user.controller';
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
// jest.config.js - ROOT
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/?(*.)+(spec|test).ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@app/(.*)$': '<rootDir>/src/app/$1',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@lib/(.*)$': '<rootDir>/packages/lib/src/$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/index.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
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
  "description": "AI Trading Platform",
  "private": true,
  "workspaces": [
    "packages/lib",
    "services/discovery-server",
    "services/financial-scraper",
    "services/message-manager",
    "services/trader",
    "services/trader-trainer"
  ],
  "scripts": {
    "lint": "eslint . --max-warnings 0",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write \"**/*.{ts,js,json,md}\"",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "build": "npm run -ws build",
    "build:lib": "npm run -w packages/lib build",
    "dev": "npm run -ws dev --if-present",
    "dev:discovery": "npm run -w services/discovery-server dev",
    "clean": "rm -rf node_modules dist coverage && npm run -ws clean"
  },
  "devDependencies": {
    "@babel/preset-env": "^7.29.5",
    "@babel/preset-typescript": "^7.28.5",
    "@eslint/js": "^10.0.1",
    "@jest/globals": "^30.4.1",
    "@types/jest": "^30.0.0",
    "@types/node": "^25.6.2",
    "eslint": "^10.3.0",
    "globals": "^17.6.0",
    "husky": "^9.1.4",
    "jest": "^30.4.2",
    "lint-staged": "^15.2.7",
    "prettier": "^3.2.5",
    "ts-jest": "^29.4.9",
    "ts-node": "^10.9.2",
    "typescript": "^6.0.3",
    "typescript-eslint": "^8.59.2"
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

## ✅ Implementation Checklist

- [ ] Create `.prettierrc`
- [ ] Create `.husky/` with git hooks
- [ ] Rename all files to kebab-case
- [ ] Rewrite all imports to follow convention
- [ ] Create `.github/workflows/lint.yml`
- [ ] Create `.github/workflows/test.yml`
- [ ] Create `.env.example`
- [ ] Standardize test file names to `.spec.ts`
- [ ] Add coverage threshold to jest.config.js
- [ ] Document all APIs in `/docs`