import { describe, it, expect, beforeAll, jest } from '@jest/globals';

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

jest.mock('@trading-model/common/config/logger', () => ({
  logger: mockLogger,
}));

let capturedOptions: any;

jest.mock('@trading-model/common/server/bootstrap', () => ({
  createBootstrap: jest.fn((options: any) => {
    capturedOptions = options;
    return { server: null, shutdown: jest.fn() };
  }),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    MONGODB_URI: 'mongodb://localhost:27017/audit-logger',
    PORT: 3001,
    MAX_QUEUE_DEPTH: 10000,
    ACK_TIMEOUT_MS: 30000,
    TLS_KEY_PATH: '/some/key.pem',
    TLS_CERT_PATH: '/some/cert.pem',
    TLS_CA_PATH: '/some/ca.pem',
    INSTANCE_ID: 'instance-1',
  },
}));

jest.mock('@trading-model/address-manager/create-address-manager', () => ({
  createAddressManager: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    listenExpress: jest.fn(),
  })),
}));

const mockAddressManager = { stop: jest.fn() };
jest.mock('../../../src/config/address-manager', () => ({
  bootstrapAddressManager: jest.fn(() => mockAddressManager),
  AddressManager: { stop: jest.fn() },
  AddressManagerRoutes: jest.fn(),
}));

const mockJobRepositoryInstance = {
  ensureIndexes: jest.fn<any>(),
  insert: jest.fn<any>(),
  findById: jest.fn<any>(),
  updateStatus: jest.fn<any>(),
  incrementRetry: jest.fn<any>(),
  findNonTerminal: jest.fn<any>(),
  findByWorker: jest.fn<any>(),
  findByStatus: jest.fn<any>(),
};

jest.mock('../../../src/persistence/job-repository', () => ({
  JobRepository: jest.fn(() => mockJobRepositoryInstance),
}));

const mockAuditRepositoryInstance = {
  insert: jest.fn<any>(),
  insertBatch: jest.fn<any>(),
  findById: jest.fn<any>(),
  query: jest.fn<any>(),
  getStats: jest.fn<any>(),
  ensureIndexes: jest.fn<any>(),
};

jest.mock('../../../src/persistence/audit-repository', () => ({
  AuditRepository: jest.fn(() => mockAuditRepositoryInstance),
}));

const mockSchedulerInstance = {
  workers: { register: jest.fn(), get: jest.fn(), unregister: jest.fn() },
  setWorkerProtocol: jest.fn<any>(),
  start: jest.fn<any>(),
  stop: jest.fn<any>(),
  onWorkerDisconnect: jest.fn(),
};

jest.mock('../../../src/scheduler/job-scheduler', () => ({
  JobScheduler: jest.fn(() => mockSchedulerInstance),
}));

const mockWorkerProtocolInstance = { close: jest.fn() };

jest.mock('../../../src/worker/worker-protocol', () => ({
  WorkerProtocol: jest.fn(() => mockWorkerProtocolInstance),
}));

const mockHttpServer = { raw: 'mock-raw-server' };
jest.mock('../../../src/app/server', () => ({
  createServer: jest.fn(() => mockHttpServer),
}));

const mockDb = { collection: jest.fn() };
const mockMongoClient = {
  connect: jest.fn<any>(),
  db: jest.fn(() => mockDb),
  close: jest.fn<any>(),
};

jest.mock('mongodb', () => ({
  MongoClient: jest.fn(() => mockMongoClient),
}));

const mockBrokerMessageInstance = {
  intents: jest.fn<any>(),
  stopMessageManager: jest.fn<any>(),
};

jest.mock('@trading-model/broker-message', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockBrokerMessageInstance),
  };
});

import { createBootstrap } from '@trading-model/common/server/bootstrap';
import { bootstrapAddressManager } from '../../../src/config/address-manager';
import { JobRepository } from '../../../src/persistence/job-repository';
import { AuditRepository } from '../../../src/persistence/audit-repository';
import { JobScheduler } from '../../../src/scheduler/job-scheduler';
import { WorkerProtocol } from '../../../src/worker/worker-protocol';
import { createServer } from '../../../src/app/server';

const mockCreateBootstrap = createBootstrap as jest.Mock;

import '../../../src/app/index';

describe('Audit Logger entry point (index.ts)', () => {
  beforeAll(() => {
    expect(capturedOptions).toBeDefined();
  });

  it('should call createBootstrap with name "Audit Logger"', () => {
    expect(mockCreateBootstrap).toHaveBeenCalledTimes(1);
    expect(capturedOptions.name).toBe('Audit Logger');
  });

  it('should handle onStop when all resources are null', async () => {
    await capturedOptions.onStop();

    expect(mockSchedulerInstance.stop).not.toHaveBeenCalled();
    expect(mockWorkerProtocolInstance.close).not.toHaveBeenCalled();
    expect(mockAddressManager.stop).not.toHaveBeenCalled();
    expect(mockMongoClient.close).not.toHaveBeenCalled();
  });

  describe('createServer callback', () => {
    it('should create all resources and return server', async () => {
      const server = await capturedOptions.createServer();

      expect(mockMongoClient.connect).toHaveBeenCalledTimes(1);
      expect(mockMongoClient.db).toHaveBeenCalledTimes(1);
      expect(JobRepository).toHaveBeenCalledWith(mockDb);
      expect(mockJobRepositoryInstance.ensureIndexes).toHaveBeenCalledTimes(1);
      expect(AuditRepository).toHaveBeenCalledWith(mockDb);
      expect(mockAuditRepositoryInstance.ensureIndexes).toHaveBeenCalledTimes(1);
      expect(JobScheduler).toHaveBeenCalledWith(mockJobRepositoryInstance);
      expect(createServer).toHaveBeenCalledWith(
        expect.objectContaining({
          workers: mockSchedulerInstance.workers,
          setWorkerProtocol: mockSchedulerInstance.setWorkerProtocol,
          start: mockSchedulerInstance.start,
        }),
        mockAuditRepositoryInstance
      );
      expect(WorkerProtocol).toHaveBeenCalledWith(
        'mock-raw-server',
        expect.objectContaining({ register: expect.any(Function) }),
        expect.any(Function)
      );
      expect(mockSchedulerInstance.setWorkerProtocol).toHaveBeenCalledWith(
        mockWorkerProtocolInstance
      );
      expect(mockSchedulerInstance.start).toHaveBeenCalledTimes(1);
      expect(server).toBe(mockHttpServer);
    });

    it('should pass onWorkerDisconnect callback to WorkerProtocol', async () => {
      const [, , disconnectCallback] = (WorkerProtocol as unknown as jest.Mock).mock.calls[0];

      (disconnectCallback as any)('worker-1');

      expect(mockSchedulerInstance.onWorkerDisconnect).toHaveBeenCalledWith('worker-1');
    });
  });

  describe('onStart callback', () => {
    it('should bootstrap address manager and log service info', () => {
      capturedOptions.onStart();

      expect(bootstrapAddressManager).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Audit Logger fully operational',
        expect.objectContaining({
          port: 3001,
          mongoUri: 'mongodb://localhost:27017/audit-logger',
        })
      );
    });
  });

  describe('onStop callback', () => {
    it('should stop scheduler, close worker protocol, stop broker, stop address manager, close mongo client', async () => {
      await capturedOptions.onStop();

      expect(mockBrokerMessageInstance.stopMessageManager).toHaveBeenCalledTimes(1);
      expect(mockSchedulerInstance.stop).toHaveBeenCalledTimes(1);
      expect(mockWorkerProtocolInstance.close).toHaveBeenCalledTimes(1);
      expect(mockAddressManager.stop).toHaveBeenCalledTimes(1);
      expect(mockMongoClient.close).toHaveBeenCalledTimes(1);
    });

    it('should handle onStop being idempotent', async () => {
      const prevCallCount = mockBrokerMessageInstance.stopMessageManager.mock.calls.length;

      await capturedOptions.onStop();

      expect(mockBrokerMessageInstance.stopMessageManager).toHaveBeenCalledTimes(prevCallCount + 1);
    });
  });
});
