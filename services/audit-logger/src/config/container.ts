import { MongoConnectionManager } from "@trading-model/persistence/mongo-connection-manager";
import { ServiceId, URLString } from "@trading-model/primitives/primitives";
import { createMessageHandler } from "../adapters/inbound/subscription/audit-subscriber";
import { AuditRepository } from "../adapters/outbound/persistence/audit-repository";
import { JobRepository } from "../adapters/outbound/persistence/job-repository";
import { WorkerProtocol } from "../adapters/outbound/worker/worker-protocol";
import { JobScheduler } from "../application/scheduler/job-scheduler";
import { createServer } from "../application/server";
import { ENV } from "../infrastructure/config/env";
import { createBrokerMessage } from "./broker-setup";
import { ORPHAN_JOBS_TOTAL } from "./metrics";

export async function createSchedulerAndWorker(
	jobRepo: JobRepository,
	auditRepo: AuditRepository,
	mongoManager: MongoConnectionManager
): Promise<{
	scheduler: JobScheduler;
	workerProtocol: WorkerProtocol;
	server: Awaited<ReturnType<typeof createServer>>;
}> {
	const scheduler = new JobScheduler({
		repository: jobRepo,
		config: {
			ackTimeoutMs: ENV.ACK_TIMEOUT_MS,
			maxQueueDepth: ENV.MAX_QUEUE_DEPTH,
			maxWorkerLoadRatio: ENV.MAX_WORKER_LOAD_RATIO,
			maxRetriesPerJob: ENV.MAX_RETRIES_PER_JOB,
			orphanScanIntervalMs: ENV.ORPHAN_SCAN_INTERVAL_MS,
			workerHeartbeatTtlMs: ENV.WORKER_HEARTBEAT_TTL_MS,
		},
		metrics: { incOrphanJobs: () => ORPHAN_JOBS_TOTAL.inc() },
	});
	const messageHandler = createMessageHandler(
		auditRepo,
		ENV.AUDIT_RETENTION_DAYS
	);
	const server = await createServer(
		scheduler,
		auditRepo,
		mongoManager,
		messageHandler
	);
	const workerProtocol = new WorkerProtocol(
		server.raw,
		scheduler.workers,
		(workerId: string) => scheduler.onWorkerDisconnect(workerId),
		ServiceId.of("audit-logger"),
		ENV.ENFORCE_MTLS_STRICT
	);
	scheduler.setWorkerProtocol(workerProtocol);
	await scheduler.start();
	return { scheduler, workerProtocol, server };
}

export async function createRepositories(mongoUri: string): Promise<{
	mongoManager: MongoConnectionManager;
	jobRepo: JobRepository;
	auditRepo: AuditRepository;
}> {
	const mongoManager = new MongoConnectionManager({
		uri: URLString.of(mongoUri),
		dbName: "audit-logger",
	});
	const mongoClient = await mongoManager.getConnection();
	const db = mongoClient.db();
	const jobRepo = new JobRepository(db);
	await jobRepo.ensureIndexes();
	const auditRepo = new AuditRepository(db);
	await auditRepo.ensureIndexes();
	return { mongoManager, jobRepo, auditRepo };
}

export type AuditLoggerApp = Awaited<ReturnType<typeof createAuditLoggerApp>>;

/** Wires the whole service: MongoDB repositories, job scheduler + worker protocol, HTTP server, bus subscriptions. */
export async function createAuditLoggerApp() {
	const { mongoManager, jobRepo, auditRepo } = await createRepositories(
		ENV.MONGODB_URI
	);
	const { scheduler, workerProtocol, server } = await createSchedulerAndWorker(
		jobRepo,
		auditRepo,
		mongoManager
	);
	const { brokerMessage } = await createBrokerMessage();
	return { server, mongoManager, scheduler, workerProtocol, brokerMessage };
}
