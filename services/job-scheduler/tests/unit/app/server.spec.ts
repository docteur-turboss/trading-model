import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockApp = {
  use: jest.fn(),
};

const mockServer = {
  raw: mockApp,
};

const mockTlsConfig = {
  key: '/some/key.pem',
  cert: '/some/cert.pem',
  ca: '/some/ca.pem',
};

const mockJobRoutes = jest.fn();
const mockAckRoutes = jest.fn();
const mockWorkerRoutes = jest.fn();
const mockHealthRoutes = jest.fn();
jest.mock('@trading-model/common/server/create-secure-server', () => ({
  createSecureServer: jest.fn(() => Promise.resolve(mockServer)),
}));

jest.mock('@trading-model/common/server/load-tls-config', () => ({
  loadTlsConfig: jest.fn(() => mockTlsConfig),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    PORT: 3000,
    NODE_ENV: 'test',
    TLS_KEY_PATH: '/some/key.pem',
    TLS_CERT_PATH: '/some/cert.pem',
    TLS_CA_PATH: '/some/ca.pem',
    APP_NAME: 'job-scheduler',
    SERVICE_NAME: 'jobs',
    INSTANCE_ID: 'instance-1',
    ADDRESS_MANAGER_URL: 'https://address-manager:3000',
  },
}));

jest.mock('../../../src/routes/ack.routes', () => ({
  ackRoutes: jest.fn(() => mockAckRoutes),
}));

jest.mock('../../../src/routes/health.routes', () => ({
  healthRoutes: jest.fn(() => mockHealthRoutes),
}));

jest.mock('../../../src/routes/job.routes', () => ({
  jobRoutes: jest.fn(() => mockJobRoutes),
}));

jest.mock('../../../src/routes/worker.routes', () => ({
  workerRoutes: jest.fn(() => mockWorkerRoutes),
}));

jest.mock('../../../src/config/address-manager', () => ({
  AddressManagerRoutes: jest.fn(),
}));

import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';
import { createServer } from '../../../src/app/server';
import { ackRoutes } from '../../../src/routes/ack.routes';
import { healthRoutes } from '../../../src/routes/health.routes';
import { jobRoutes } from '../../../src/routes/job.routes';
import { workerRoutes } from '../../../src/routes/worker.routes';

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

    const server = await createServer(scheduler);

    expect(server).toBe(mockServer);
    expect(createSecureServer).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 3000,
        tls: mockTlsConfig,
        trustProxy: true,
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

    expect(jobRoutes).toHaveBeenCalledWith(scheduler);
    expect(ackRoutes).toHaveBeenCalledWith(scheduler);
    expect(workerRoutes).toHaveBeenCalledWith(scheduler.workers);
    expect(healthRoutes).toHaveBeenCalledWith(
      scheduler.queue,
      scheduler.backPressure,
      scheduler.workers
    );

    expect(mockApp.use).toHaveBeenCalledWith('/', mockJobRoutes);
    expect(mockApp.use).toHaveBeenCalledWith('/', mockAckRoutes);
    expect(mockApp.use).toHaveBeenCalledWith('/', mockWorkerRoutes);
    expect(mockApp.use).toHaveBeenCalledWith('/', mockHealthRoutes);
  });
});
