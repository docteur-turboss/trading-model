import { describe, it, expect, jest } from '@jest/globals';
import { fetchUrl, computeDlqSignature, PORTS, e2eTestTimeout } from './helpers';

jest.setTimeout(e2eTestTimeout);

const BASE = `https://localhost:${PORTS.dlq}`;
const HMAC_SECRET = process.env.HMAC_SECRET || 'test-hmac-secret';
const SERVICE_NAME = 'e2e-test-runner';

function dlqHeaders(body: unknown, method: string, path: string): Record<string, string> {
  const timestamp = Date.now().toString();
  const signature = computeDlqSignature(SERVICE_NAME, HMAC_SECRET, body, timestamp, method, path);
  return {
    'x-service-name': SERVICE_NAME,
    'x-signature': signature,
    'x-timestamp': timestamp,
  };
}

describe('DLQ Service E2E', () => {
  const testEntry = {
    topic: 'e2e.test.topic',
    message: { key: 'value', sequence: 1 },
    reason: 'E2E test - simulated failure',
    deliveryAttempt: 3,
    timestamp: new Date().toISOString(),
  };

  it('should respond to health check', async () => {
    const { status } = await fetchUrl(`${BASE}/health`);
    expect(status).toBe(200);
  });

  it('should store a dead letter entry', async () => {
    const { status, body } = await fetchUrl(`${BASE}/dlq`, {
      method: 'POST',
      body: testEntry,
      headers: { ...dlqHeaders(testEntry, 'POST', '/dlq') },
    });
    expect(status).toBe(201);
    const parsed = JSON.parse(body);
    expect(parsed).toHaveProperty('id');
    expect(parsed).toHaveProperty('acknowledged', true);
  });

  it('should list stored dead letter entries', async () => {
    const { status, body } = await fetchUrl(`${BASE}/dlq`, {
      headers: { ...dlqHeaders(null, 'GET', '/dlq') },
    });
    expect(status).toBe(200);
    const parsed = JSON.parse(body);
    expect(Array.isArray(parsed.entries || parsed)).toBe(true);
  });

  it('should reject unauthenticated requests', async () => {
    const { status } = await fetchUrl(`${BASE}/dlq`, { method: 'POST', body: testEntry });
    expect(status).toBe(401);
  });
});
