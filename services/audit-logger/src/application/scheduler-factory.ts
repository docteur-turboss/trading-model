import type { MongoConnectionManager } from "@trading-model/common/persistence/mongo-connection-manager";
import type { AuditRepository } from "../adapters/outbound/persistence/audit-repository";
import type { JobRepository } from "../persistence/job-repository";
import { JobScheduler } from "../scheduler/job-scheduler";
import { WorkerProtocol } from "../worker/worker-protocol";
import { createServer } from "./server";

export async function createSchedulerAndWorker(
	jobRepo: JobRepository,
	auditRepo: AuditRepository,
	mongoManager: MongoConnectionManager
): Promise<{
	scheduler: JobScheduler;
	workerProtocol: WorkerProtocol;
	server: Awaited<ReturnType<typeof createServer>>;
}> {
	const scheduler = new JobScheduler(jobRepo);
	const server = await createServer(scheduler, auditRepo, mongoManager);
	const workerProtocol = new WorkerProtocol(
		server.raw,
		scheduler.workers,
		(workerId: string) => scheduler.onWorkerDisconnect(workerId)
	);
	scheduler.setWorkerProtocol(workerProtocol);
	await scheduler.start();
	return { scheduler, workerProtocol, server };
}
