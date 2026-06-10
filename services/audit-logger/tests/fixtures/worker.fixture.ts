import type { WorkerRegistration } from '../../src/types/worker.types';

export const createWorkerRegistration = (
  overrides?: Partial<WorkerRegistration>
): WorkerRegistration => ({
  workerId: 'test-worker-1',
  address: '192.168.1.10',
  port: 9000,
  capabilities: ['test-job-type', 'another-type'],
  maxConcurrency: 5,
  currentLoad: 0,
  lastHeartbeat: new Date(),
  status: 'active',
  ...overrides,
});
