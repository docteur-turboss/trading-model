import BrokerMessage from "@trading-model/broker-message";
import { logger } from "@trading-model/common/config/logger";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { createBootstrap } from "@trading-model/common/server/bootstrap";
import { MongoClient } from "mongodb";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { ENV } from "../config/env";
import { AuditRepository } from "../persistence/audit-repository";
import { JobRepository } from "../persistence/job-repository";
import { JobScheduler } from "../scheduler/job-scheduler";
import { WorkerProtocol } from "../worker/worker-protocol";
import { createServer } from "./server";

interface AppContext {
	mongoClient: MongoClient;
	scheduler: JobScheduler;
	workerProtocol: WorkerProtocol;
	brokerMessage: BrokerMessage;
	addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER>;
}

let _appContext: AppContext | null = null;

async function _createMongoConnection(): Promise<MongoClient> {
	const client = new MongoClient(ENV.MONGODB_URI);
	await client.connect();
	return client;
}

async function _createRepositories(
	mongo: MongoClient
): Promise<{ jobRepo: JobRepository; auditRepo: AuditRepository }> {
	const db = mongo.db();
	const jobRepo = new JobRepository(db);
	await jobRepo.ensureIndexes();
	const auditRepo = new AuditRepository(db);
	await auditRepo.ensureIndexes();
	return { jobRepo, auditRepo };
}

async function _createAndStartScheduler(
	jobRepo: JobRepository,
	auditRepo: AuditRepository
): Promise<{
	scheduler: JobScheduler;
	workerProtocol: WorkerProtocol;
	server: Awaited<ReturnType<typeof createServer>>;
}> {
	const scheduler = new JobScheduler(jobRepo);
	let workerProtocol = new WorkerProtocol(
		null!,
		scheduler.workers,
		(workerId: string) => scheduler.onWorkerDisconnect(workerId)
	);
	const server = await createServer(scheduler, auditRepo);
	workerProtocol = new WorkerProtocol(
		server.raw,
		scheduler.workers,
		(workerId: string) => scheduler.onWorkerDisconnect(workerId)
	);
	scheduler.setWorkerProtocol(workerProtocol);
	await scheduler.start();
	return { scheduler, workerProtocol, server };
}

async function _createBrokerMessage(): Promise<BrokerMessage> {
	const { AddressManager } = await import("../config/address-manager.js");
	const brokerMessage = new BrokerMessage({
		addressManagerClient: AddressManager,
		tlsPaths: {
			keyPath: ENV.TLS_KEY_PATH,
			caPath: ENV.TLS_CA_PATH,
			certPath: ENV.TLS_CERT_PATH,
		},
		instanceId: ENV.INSTANCE_ID,
		serviceName: ServiceInstanceName.AuditLoggerService,
	});
	const { EnumEventMessage } = await import(
		"@trading-model/common/config/event.types"
	);
	const AllTopics = Object.values(EnumEventMessage);
	await brokerMessage.intents(AllTopics);
	logger.info("Subscribed to all event topics", {
		context: {
			topicCount: AllTopics.length,
		},
	});
	return brokerMessage;
}

async function _closeMongo(mongoClient: MongoClient): Promise<void> {
	await mongoClient.close();
}

function _stopScheduler(scheduler: JobScheduler): void {
	scheduler.stop();
}

createBootstrap({
	name: "Audit Logger",
	createServer: async () => {
		const mongoClient = await _createMongoConnection();
		const { jobRepo, auditRepo } = await _createRepositories(mongoClient);
		const { scheduler, workerProtocol, server } =
			await _createAndStartScheduler(jobRepo, auditRepo);
		const brokerMessage = await _createBrokerMessage();

		_appContext = {
			mongoClient,
			scheduler,
			workerProtocol,
			brokerMessage,
			addressManager: null!,
		};
		return server;
	},
	onStart: () => {
		if (!_appContext) return;
		_appContext.addressManager = BOOTSTRAP_ADDRESS_MANAGER();
		logger.info("Audit Logger fully operational", {
			context: {
				port: ENV.PORT,
				mongoUri: ENV.MONGODB_URI,
			},
		});
	},
	onStop: async () => {
		if (!_appContext) return;
		const {
			brokerMessage,
			scheduler,
			workerProtocol,
			addressManager,
			mongoClient,
		} = _appContext;
		await brokerMessage.stopMessageManager();
		_stopScheduler(scheduler);
		workerProtocol.close();
		addressManager.stop();
		await _closeMongo(mongoClient);
		_appContext = null;
	},
});
