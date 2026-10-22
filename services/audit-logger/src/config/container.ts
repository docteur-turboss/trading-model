import type { MongoConnectionManager } from "@trading-model/persistence/mongo-connection-manager";
import { ServiceId } from "@trading-model/primitives/primitives";
import type { AuditRepository } from "../adapters/outbound/persistence/audit-repository";
import type { JobRepository } from "../adapters/outbound/persistence/job-repository";
import { WorkerProtocol } from "../adapters/outbound/worker/worker-protocol";
import { JobScheduler } from "../application/scheduler/job-scheduler";
import { createServer } from "../application/server";
import { ENV } from "../infrastructure/config/env";
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
	const server = await createServer(scheduler, auditRepo, mongoManager);
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
