# Testing Standards

## Why

Tests are the guarantee of code reliability and regression prevention. Strict coverage thresholds ensure that critical paths are systematically tested.

## Framework

**Jest with ts-jest** — configuration per package/service (Node.js backend services).

**Vitest** — configuration per `vitest.config.ts` (frontend SPA: admin-interface). Vitest uses a Vite-compatible config with jsdom environment for React component testing. See `services/admin-interface/vitest.config.ts`.

```javascript
// jest.config.js — PER PACKAGE/SERVICE
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

## Test Structure

```
tests/
├── unit/                    # Unit tests (isolated logic)
│   ├── services/
│   │   └── user.service.spec.ts
│   ├── controllers/
│   │   └── user.controller.spec.ts
│   └── utils/
│       └── string.util.spec.ts
├── integration/             # Integration tests
│   ├── address-manager.integration.spec.ts
│   └── message-broker.integration.spec.ts
├── e2e/                     # End-to-end tests
│   └── trading-flow.e2e.spec.ts
├── fixtures/                # Reusable test data
│   ├── users.fixture.ts
│   └── orders.fixture.ts
└── helpers/                 # Test utilities
    ├── test-db.helper.ts
    └── mock-server.helper.ts
```

## Naming Conventions

| Test type     | Suffix                     | Example                               |
| ------------- | -------------------------- | ------------------------------------- |
| Unit          | `.spec.ts` (preferred)     | `user.service.spec.ts`                |
| Unit (legacy) | `.test.ts` (in transition) | `user.service.test.ts`                |
| Integration   | `.integration.spec.ts`     | `address-manager.integration.spec.ts` |
| End-to-end    | `.e2e.spec.ts`             | `trading-flow.e2e.spec.ts`            |
| Fixtures      | `.fixture.ts`              | `users.fixture.ts`                    |
| Helpers       | `.helper.ts`               | `mock-server.helper.ts`               |

> **Important**: `.spec.ts` is the preferred convention. `.test.ts` files are being progressively migrated.

### Test naming patterns

```typescript
describe('MyComponent', () => {
  // ✓ CORRECT - Descriptive and active
  it('should return user when found', () => {});
  it('should throw error when not found', () => {});
  it('should handle concurrent requests', () => {});
  it('should retry on timeout', () => {});

  // ✗ INCORRECT - Vague or passive
  it('works', () => {});
  it('user test', () => {});
  it('handles things', () => {});
});
```

## Coverage Thresholds

| Package / Service              | Branches | Functions | Lines | Statements | Framework |
| ------------------------------ | -------- | --------- | ----- | ---------- | --------- |
| @trading-model/common          | 100%     | 100%      | 100%  | 100%       | Jest      |
| discovery-server               | 100%     | 100%      | 100%  | 100%       | Jest      |
| message-manager                | 100%     | 100%      | 100%  | 100%       | Jest      |
| financial-scraper              | 100%     | 100%      | 100%  | 100%       | Jest      |
| @trading-model/address-manager | 80%      | 80%       | 80%   | 80%        | Jest      |
| @trading-model/broker-message  | 80%      | 80%       | 80%   | 80%        | Jest      |
| trader-trainer                 | 80%      | 80%       | 80%   | 80%        | Jest      |
| audit-logger                   | 100%     | 100%      | 100%  | 100%       | Jest      |
| job-scheduler                  | 100%     | 100%      | 100%  | 100%       | Jest      |
| admin-interface                | 100%     | 100%      | 100%  | 100%       | Vitest    |

Coverage is checked by Jest on every test run. Below the threshold, tests fail.

### Generate HTML report

```bash
npm test -- --coverage --coverageReporters=html
# Open coverage/index.html
```

### Ignore lines from coverage

```typescript
// Ignore single line
const debug = process.env.DEBUG; // istanbul ignore line

// Ignore block
/* istanbul ignore if */
if (process.env.NODE_ENV === 'production') {
  // ...
}
```

## Test Patterns

### AAA (Arrange, Act, Assert)

```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UserService } from '../core/services/user.service';
import { UserRepository } from '../core/repositories/user.repository';

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepository: jest.Mocked<UserRepository>;

  beforeEach(() => {
    // ARRANGE
    mockUserRepository = {
      findById: jest.fn(),
      save: jest.fn(),
    };
    userService = new UserService(mockUserRepository);
  });

  describe('getUser', () => {
    it('should return user when found', async () => {
      // ARRANGE
      const userId = '123';
      const expectedUser = { id: userId, name: 'John' };
      mockUserRepository.findById.mockResolvedValue(expectedUser);

      // ACT
      const result = await userService.getUser(userId);

      // ASSERT
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

### Mocks in `__mocks__/`

Reusable mocks are placed in a `__mocks__/` directory next to the mocked module:

```
services/discovery-server/
├── src/
│   └── core/
│       └── lease-manager.ts
└── __mocks__/
    └── @trading-model/
        └── common.ts
```

```typescript
// __mocks__/@trading-model/common.ts
export const logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

export const createSecureServer = jest.fn();
```

### Unit Tests

```typescript
it('should subscribe to topic', async () => {
  await client.subscribe('my.topic');
  expect(httpClient.post).toHaveBeenCalled();
});

it('should throw error on failure', async () => {
  httpClient.post.mockRejected(new Error());
  await expect(client.subscribe('my.topic')).rejects.toThrow();
});
```

### Integration Tests

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { createIntegrationTestSetup } from '../helpers/integration.helper';

describe('Service A & B Integration', () => {
  let setup: IntegrationTestSetup;

  beforeEach(async () => {
    setup = createIntegrationTestSetup();
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  it('should communicate between services', async () => {
    const result = await setup.serviceA.callServiceB();
    expect(result).toBeDefined();
  });
});
```

### Testing Errors

```typescript
describe('Error Handling', () => {
  it('should throw a specific error', async () => {
    await expect(service.fail()).rejects.toThrow(CustomError);
  });

  it('should contain the correct error message', async () => {
    await expect(service.fail()).rejects.toThrow('Specific message');
  });

  it('should contain the correct error code', async () => {
    try {
      await service.fail();
    } catch (error: any) {
      expect(error.code).toBe('ERROR_CODE');
    }
  });
});
```

### Testing Events

```typescript
import { createEventObserver } from '../helpers/integration.helper';

describe('Event Emission', () => {
  it('should emit an event on success', done => {
    const observer = createEventObserver();

    EventManager.on('my.event', data => {
      observer.observe('my.event', data);
      expect(data).toEqual(expectedData);
      done();
    });

    service.triggerEvent();
  });

  it('should emit multiple events in order', async () => {
    const observer = createEventObserver();

    EventManager.on('first', () => observer.observe('first', null));
    EventManager.on('second', () => observer.observe('second', null));

    await service.triggerSequence();

    const events = observer.getEvents();
    expect(events[0].name).toBe('first');
    expect(events[1].name).toBe('second');
  });
});
```

## Running Tests

### Run all tests

```bash
npm test
```

### Run tests for a specific service

```bash
npm test -- --testPathPattern="packages/broker-message"
npm test -- --testPathPattern="packages/address-manager"
npm test -- --testPathPattern="discovery-server"
```

### Run tests in watch mode (development)

```bash
npm test -- --watch
```

### Run tests with coverage

```bash
npm test -- --coverage
```

### Run tests for a specific file

```bash
npm test -- messageManagerClient.spec.ts
npm test -- address-manager.integration.spec.ts
```

### Run tests filtered by name

```bash
npm test -- --testNamePattern="should subscribe to topics"
```

### Run tests in parallel

```bash
npm test -- --maxWorkers=4
```

## Fixtures and Helpers

### Using fixtures

```typescript
import { mockAddressManagerConfig } from '../fixtures/address-manager.fixture';

const config = mockAddressManagerConfig;

const customConfig = {
  ...mockAddressManagerConfig,
  serviceName: 'custom-service',
};
```

### Creating your own fixtures

```typescript
// tests/fixtures/my-service.fixture.ts
export const mockMyServiceConfig = {
  apiUrl: 'http://localhost:3000',
  timeout: 5000,
};

export const mockApiResponse = {
  id: '123',
  status: 'success',
  data: {
    /* ... */
  },
};

export const mockErrorResponse = {
  error: 'Not found',
  code: 'NOT_FOUND',
};
```

### Using helpers

```typescript
import {
  createMockHttpClient,
  createMockTokenManager,
  waitFor,
  delay,
  clearAllMocks,
} from '../helpers/mock.helper';

beforeEach(() => {
  const httpClient = createMockHttpClient();
  const tokenManager = createMockTokenManager();
});

await waitFor(() => condition === true, 5000, 100);
await delay(500);
clearAllMocks(mock1, mock2, mock3);
```

## Best Practices

1. **One test = one behavior** — Do not test multiple things in a single `it`
2. **Descriptive names** — `should return user when found` instead of `works`
3. **Do not test the framework** — Test your logic, not Express or Jest
4. **Strategic mocking** — Mock external dependencies, not everything
5. **Cleanup** — `jest.clearAllMocks()` in `afterEach`
6. **Edge cases** — Test empty inputs, null, extreme values, timeouts
7. **Critical paths** — 100% coverage on auth, security, core logic

### Best Practice Examples

```typescript
// ✓ CORRECT - One behavior per test
it('should subscribe to topic', async () => {
  await client.subscribe('my.topic');
  expect(httpClient.post).toHaveBeenCalled();
});

it('should throw error on failure', async () => {
  httpClient.post.mockRejected(new Error());
  await expect(client.subscribe('my.topic')).rejects.toThrow();
});

// ✗ INCORRECT - Multiple behaviors
it('should subscribe and handle errors', async () => {
  // ... too many things ...
});
```

```typescript
describe('Security Critical', () => {
  it('should include auth header', () => {});
  it('should not expose token in logs', () => {});
  it('should validate token expiry', () => {});
  it('should reject expired tokens', () => {});
});
```

### Cleanup

```typescript
describe('MyService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterAll(async () => {
    await closeConnections();
  });
});
```

## Troubleshooting

### Test timeout

```typescript
// Increase timeout per test
it('should do something slow', async () => {
  // ...
}, 10000); // 10 seconds

// Or globally
jest.setTimeout(30000);
```

### State leaking between tests

```typescript
// ✗ INCORRECT - Global state
let service;
beforeAll(() => {
  service = new MyService(); // Shared across all tests
});

// ✓ CORRECT - Per-test state
let service;
beforeEach(() => {
  service = new MyService(); // Fresh for each test
});
```

### Flaky (random) tests

```typescript
// ✗ INCORRECT - Timing dependent
it('should emit event', done => {
  setTimeout(() => done(), 100); // May fail if slow
});

// ✓ CORRECT - Wait for event
it('should emit event', done => {
  EventEmitter.once('event', () => {
    expect(true).toBe(true);
    done();
  });
  emitEvent();
});
```

## References

- [TESTING.md](./TESTING.md) — Complete testing guide
- [QUALITY.md](./QUALITY.md) — Quality standards and thresholds
- [Jest Documentation](https://jestjs.io)
