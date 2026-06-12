import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockApp = {
  use: jest.fn(),
  post: jest.fn(),
};

const mockServer = {
  raw: mockApp,
};

const mockTlsConfig = {
  key: '/some/key.pem',
  cert: '/some/cert.pem',
  ca: '/some/ca.pem',
};

const mockMessageHandler = jest.fn();
const mockHealthRoutes = jest.fn();
const mockEventsRoutes = jest.fn();
jest.mock('@trading-model/common/server/create-secure-server', () => ({
  createSecureServer: jest.fn(() => Promise.resolve(mockServer)),
}));

jest.mock('@trading-model/common/server/load-tls-config', () => ({
  loadTlsConfig: jest.fn(() => mockTlsConfig),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    PORT: 3001,
    NODE_ENV: 'test',
    TLS_KEY_PATH: '/some/key.pem',
    TLS_CERT_PATH: '/some/cert.pem',
    TLS_CA_PATH: '/some/ca.pem',
    APP_NAME: 'audit-logger',
    SERVICE_NAME: 'audit',
    INSTANCE_ID: 'instance-1',
    ADDRESS_MANAGER_URL: 'https://address-manager:3000',
  },
}));

jest.mock('../../../src/routes/health.routes', () => ({
  healthRoutes: jest.fn(() => mockHealthRoutes),
}));

jest.mock('../../../src/routes/events.routes', () => ({
  eventsRoutes: jest.fn(() => mockEventsRoutes),
}));

jest.mock('../../../src/config/address-manager', () => ({
  AddressManagerRoutes: jest.fn(),
}));

jest.mock('../../../src/subscription/audit-subscriber', () => ({
  createMessageHandler: jest.fn(() => mockMessageHandler),
}));

import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';
import { createServer } from '../../../src/app/server';
import { healthRoutes } from '../../../src/routes/health.routes';
import { eventsRoutes } from '../../../src/routes/events.routes';

describe('createServer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a secure server and register all routes', async () => {
    const scheduler = {
      workers: 'workers-mock',
      queue: 'queue-mock',
      backPressure: 'back-pressure-mock',
    } as any;
    const auditRepo = { insert: jest.fn() } as any;

    const server = await createServer(scheduler, auditRepo);

    expect(server).toBe(mockServer);
    expect(createSecureServer).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 3001,
        tls: mockTlsConfig,
      })
    );

    expect(loadTlsConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        TLS_KEY_PATH: '/some/key.pem',
        TLS_CERT_PATH: '/some/cert.pem',
        TLS_CA_PATH: '/some/ca.pem',
      })
    );

    const secureServerOptions = (createSecureServer as jest.Mock).mock.calls[0][0] as any;

    secureServerOptions.routes(mockApp);

    expect(healthRoutes).toHaveBeenCalledWith(
      scheduler.queue,
      scheduler.backPressure,
      scheduler.workers
    );
    expect(eventsRoutes).toHaveBeenCalledWith(auditRepo);

    expect(mockApp.use).toHaveBeenCalledWith('/', mockHealthRoutes);
    expect(mockApp.use).toHaveBeenCalledWith('/', mockEventsRoutes);
    expect(mockApp.post).toHaveBeenCalledWith('/message', mockMessageHandler);
  });
});
