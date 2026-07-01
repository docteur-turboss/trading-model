import { describe, it, expect, jest } from '@jest/globals';
import { fetchUrl, PORTS, e2eTestTimeout } from './helpers';

jest.setTimeout(e2eTestTimeout);

const BASE = `https://localhost:${PORTS.discovery}`;

describe('Discovery Service E2E', () => {
  const testServiceName = 'e2e-test-service';
  const testInstanceId = `e2e-instance-${Date.now()}`;

  it('should respond to ping', async () => {
    const { status } = await fetchUrl(`${BASE}/ping`);
    expect(status).toBe(200);
  });

  it('should register a service instance', async () => {
    const { status, body } = await fetchUrl(`${BASE}/register`, {
      method: 'POST',
      body: {
        serviceName: testServiceName,
        instanceId: testInstanceId,
        ip: '127.0.0.1',
        port: 9999,
        version: '1.0.0',
        ttl: 60,
      },
    });
    expect(status).toBe(201);
    const parsed = JSON.parse(body);
    expect(parsed).toHaveProperty('token');
    expect(parsed).toHaveProperty('instanceId', testInstanceId);
  });

  it('should list the registered service', async () => {
    const { status, body } = await fetchUrl(`${BASE}/services`);
    expect(status).toBe(200);
    const parsed = JSON.parse(body);
    expect(parsed).toHaveProperty(testServiceName);
  });

  it('should list instances for the registered service', async () => {
    const { status, body } = await fetchUrl(`${BASE}/services/${testServiceName}`);
    expect(status).toBe(200);
    const parsed = JSON.parse(body);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.some((i: any) => i.instanceId === testInstanceId)).toBe(true);
  });

  it('should return health info', async () => {
    const { status, body } = await fetchUrl(`${BASE}/health`);
    expect(status).toBe(200);
    const parsed = JSON.parse(body);
    expect(parsed).toHaveProperty('redis');
  });
});
