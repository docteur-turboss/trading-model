# 🧪 Testing Guide - Trading Model

**Last updated**: May 18, 2026

---

## 📋 Table of Contents

1. [Running Tests](#running-tests)
2. [Test Structure](#test-structure)
3. [Writing New Tests](#writing-new-tests)
4. [Fixtures and Helpers](#fixtures-and-helpers)
5. [Test Coverage](#test-coverage)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## 🚀 Running Tests

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
npm test -- --testNamePattern="SubscribeToTopics"
```

### Run tests in parallel

```bash
npm test -- --maxWorkers=4
```

### Run tests with debug output

```bash
npm test -- --verbose
```

---

## 📁 Test Structure

### Test hierarchy

```text
tests/
├── fixtures/           # Test data (reusable constants)
├── helpers/            # Test utilities (mocks, setup)
├── integration/        # Integration tests (complete flows)
├── unit/               # Unit tests (isolated logic)
└── config/             # Test configuration
```

### Naming conventions

```typescript
// ✓ CORRECT
user.service.spec.ts; // Service
address - manager.spec.ts; // Client/Manager
auth.middleware.spec.ts; // Middleware
error.handler.spec.ts; // Utility

// Integration tests
address - manager.integration.spec.ts;
message - broker.integration.spec.ts;
```

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

---

## ✍️ Writing New Tests

### Basic template (unit test)

```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MyService } from '../../my-service';
import { createMockHttpClient } from '../helpers/mock.helper';

describe('MyService', () => {
  let service: MyService;
  let httpClient: any;

  beforeEach(() => {
    httpClient = createMockHttpClient();
    service = new MyService(httpClient);
  });

  describe('doSomething', () => {
    it('should successfully perform the action', async () => {
      httpClient.get.mockResolvedValue({ data: 'success' });

      const result = await service.doSomething();

      expect(result).toEqual({ data: 'success' });
      expect(httpClient.get).toHaveBeenCalledWith(expectedUrl);
    });

    it('should throw an error on failure', async () => {
      httpClient.get.mockRejectedValue(new Error('Network error'));

      await expect(service.doSomething()).rejects.toThrow('Network error');
    });
  });
});
```

### Integration test template

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { ServiceA } from '../../service-a';
import { ServiceB } from '../../service-b';
import { createIntegrationTestSetup } from '../helpers/integration.helper';

describe('Service A & B Integration', () => {
  let setup: IntegrationTestSetup;
  let serviceA: ServiceA;
  let serviceB: ServiceB;

  beforeEach(async () => {
    setup = createIntegrationTestSetup();

    serviceA = new ServiceA(setup.configs.get('serviceA'));
    serviceB = new ServiceB(setup.configs.get('serviceB'));

    setup.services.set('A', serviceA);
    setup.services.set('B', serviceB);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  it('should communicate between services', async () => {
    const result = await serviceA.callServiceB();
    expect(result).toBeDefined();
  });
});
```

### Testing errors

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

### Testing events

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

---

## 🔧 Fixtures and Helpers

### Using fixtures

```typescript
import { mockAddressManagerConfig } from '../fixtures/address-manager.fixture';

// Simple usage
const config = mockAddressManagerConfig;

// Usage with modifications
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

// Wait for a condition
await waitFor(
  () => condition === true,
  5000, // timeout ms
  100 // check interval ms
);

// Wait for a delay
await delay(500);

// Clear mocks
clearAllMocks(mock1, mock2, mock3);
```

---

## 📈 Test Coverage

### Check coverage

```bash
npm test -- --coverage
```

### Coverage targets

```typescript
// jest.config.js
coverageThreshold: {
  global: {
    branches: 100,
    functions: 100,
    lines: 100,
    statements: 100,
  },
}
```

### Generate HTML report

```bash
npm test -- --coverage --coverageReporters=html
# Open coverage/index.html
```

### Ignore lines from coverage

```typescript
// Ignore this line from coverage
const debug = process.env.DEBUG; // istanbul ignore line

// Ignore this block from coverage
/* istanbul ignore if */
if (process.env.NODE_ENV === 'production') {
  // ...
}
```

---

## ✅ Best Practices

### 1. Arrange-Act-Assert (AAA Pattern)

```typescript
it('should return user', async () => {
  // ARRANGE - Prepare
  const userId = '123';
  httpClient.get.mockResolvedValue({ id: userId, name: 'John' });

  // ACT - Execute
  const user = await service.getUser(userId);

  // ASSERT - Verify
  expect(user.name).toBe('John');
});
```

### 2. One behavior per test

```typescript
// ✓ CORRECT - One test = one behavior
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

### 3. Test critical cases

```typescript
describe('Security Critical', () => {
  // ✓ Always test
  it('should include auth header', () => {});
  it('should not expose token in logs', () => {});
  it('should validate token expiry', () => {});
  it('should handle token refresh', () => {});
  it('should reject expired tokens', () => {});
});
```

### 4. Test edge cases

```typescript
describe('Edge Cases', () => {
  it('should handle empty input', () => {});
  it('should handle null input', () => {});
  it('should handle very large input', () => {});
  it('should handle concurrent calls', () => {});
  it('should handle rapid fire calls', () => {});
  it('should handle timeout scenarios', () => {});
});
```

### 5. Do not test the framework

```typescript
// ✗ INCORRECT - Testing Express
describe('Express middleware', () => {
  it('should call res.send', () => {}); // Too low-level
});

// ✓ CORRECT - Testing logic
describe('AuthMiddleware', () => {
  it('should validate token', () => {});
  it('should extract user from token', () => {});
});
```

### 6. Strategic mocking

```typescript
// ✓ CORRECT - Mock external dependencies
const httpClient = createMockHttpClient();
httpClient.get.mockResolvedValue(data);

// ✗ INCORRECT - Mock everything
const service = jest.fn();
const everything = jest.fn();
```

### 7. Cleanup

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

---

## 🔍 Troubleshooting

### Test timeout

```typescript
// Increase timeout
it('should do something slow', async () => {
  // ...
}, 10000); // 10 seconds

// Or globally
jest.setTimeout(30000);
```

### Mock not found

```typescript
// ✗ INCORRECT
const result = await service.doSomething();
expect(httpClient.post).toHaveBeenCalled(); // Fails if not called

// ✓ CORRECT
httpClient.post.mockResolvedValue(expectedData);
const result = await service.doSomething();
expect(httpClient.post).toHaveBeenCalledWith(expectedUrl, expectedPayload);
```

### Unhandled async code

```typescript
// ✗ INCORRECT - Forgot to wait
it('should fetch data', () => {
  service.fetchData();
  expect(data).toBeDefined(); // Fails
});

// ✓ CORRECT - Await promise
it('should fetch data', async () => {
  const data = await service.fetchData();
  expect(data).toBeDefined();
});

// ✓ CORRECT - Return promise
it('should fetch data', () => {
  return service.fetchData().then(data => {
    expect(data).toBeDefined();
  });
});
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

---

## 📚 Resources

- [Jest Documentation](https://jestjs.io/?utm_source=chatgpt.com)
- [Testing Library](https://testing-library.com/?utm_source=chatgpt.com)
- `TESTING.md` - Test overview
- `STANDARDS.md` - Project standards
