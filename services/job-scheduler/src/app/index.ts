import { MongoClient } from 'mongodb';

import { logger } from '@trading-model/common/config/logger';
import { createBootstrap } from '@trading-model/common/server/bootstrap';

import { createServer } from './server';
import { bootstrapAddressManager } from '../config/address-manager';
import { env } from '../config/env';
import { JobRepository } from '../persistence/job-repository';
import { JobScheduler } from '../scheduler/job-scheduler';
import { WorkerProtocol } from '../worker/worker-protocol';

let addressManager: ReturnType<typeof bootstrapAddressManager> | null = null;
let mongoClient: MongoClient | null = null;
let scheduler: JobScheduler | null = null;
let workerProtocol: WorkerProtocol | null = null;

createBootstrap({
  name: 'Job Scheduler',
  createServer: async () => {
    mongoClient = new MongoClient(env.MONGODB_URI);
    await mongoClient.connect();
    const db = mongoClient.db();
    const repository = new JobRepository(db);
    await repository.ensureIndexes();

    scheduler = new JobScheduler(repository);

    const server = await createServer(scheduler);

    workerProtocol = new WorkerProtocol(server.raw, scheduler.workers, (workerId: string) =>
      scheduler!.onWorkerDisconnect(workerId)
    );
    scheduler.setWorkerProtocol(workerProtocol);

    await scheduler.start();

    return server;
  },
  onStart: () => {
    addressManager = bootstrapAddressManager();
    logger.info('Job Scheduler fully operational', {
      port: env.PORT,
      maxQueueDepth: env.MAX_QUEUE_DEPTH,
      ackTimeoutMs: env.ACK_TIMEOUT_MS,
    });
  },
  onStop: async () => {
    if (scheduler) await scheduler.stop();
    if (workerProtocol) workerProtocol.close();
    if (addressManager) addressManager.stop();
    if (mongoClient) await mongoClient.close();
  },
});
