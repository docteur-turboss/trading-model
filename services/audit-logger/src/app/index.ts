import { MongoClient } from 'mongodb';

import BrokerMessage from '@trading-model/broker-message';
import { logger } from '@trading-model/common/config/logger';
import { ServiceInstanceName } from '@trading-model/common/config/services.types';
import { createBootstrap } from '@trading-model/common/server/bootstrap';

import { createServer } from './server';
import { bootstrapAddressManager } from '../config/address-manager';
import { env } from '../config/env';
import { AuditRepository } from '../persistence/audit-repository';
import { JobRepository } from '../persistence/job-repository';
import { JobScheduler } from '../scheduler/job-scheduler';
import { WorkerProtocol } from '../worker/worker-protocol';

let addressManager: ReturnType<typeof bootstrapAddressManager> | null = null;
let mongoClient: MongoClient | null = null;
let scheduler: JobScheduler | null = null;
let workerProtocol: WorkerProtocol | null = null;
let brokerMessage: BrokerMessage | null = null;

createBootstrap({
  name: 'Audit Logger',
  createServer: async () => {
    mongoClient = new MongoClient(env.MONGODB_URI);
    await mongoClient.connect();
    const db = mongoClient.db();

    const jobRepo = new JobRepository(db);
    await jobRepo.ensureIndexes();

    const auditRepo = new AuditRepository(db);
    await auditRepo.ensureIndexes();

    scheduler = new JobScheduler(jobRepo);

    const server = await createServer(scheduler, auditRepo);

    workerProtocol = new WorkerProtocol(server.raw, scheduler.workers, (workerId: string) =>
      scheduler!.onWorkerDisconnect(workerId)
    );
    scheduler.setWorkerProtocol(workerProtocol);

    await scheduler.start();

    const { AddressManager } = await import('../config/address-manager.js');
    brokerMessage = new BrokerMessage({
      addressManagerClient: AddressManager,
      KeyCertificatPath: env.TLS_KEY_PATH,
      RootCACertPath: env.TLS_CA_PATH,
      CertificatPath: env.TLS_CERT_PATH,
      instanceId: env.INSTANCE_ID,
      serviceName: ServiceInstanceName.AuditLoggerService,
    });

    const { EnumEventMessage } = await import('@trading-model/common/config/event.types');
    const ALL_TOPICS = Object.values(EnumEventMessage);
    await brokerMessage.intents(ALL_TOPICS);
    logger.info('Subscribed to all event topics', { topicCount: ALL_TOPICS.length });

    return server;
  },
  onStart: () => {
    addressManager = bootstrapAddressManager();
    logger.info('Audit Logger fully operational', {
      port: env.PORT,
      mongoUri: env.MONGODB_URI,
    });
  },
  onStop: async () => {
    if (brokerMessage) await brokerMessage.stopMessageManager();
    if (scheduler) await scheduler.stop();
    if (workerProtocol) workerProtocol.close();
    if (addressManager) addressManager.stop();
    if (mongoClient) await mongoClient.close();
  },
});
