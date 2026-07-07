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

createBootstrap({
	name: "Audit Logger",
	createServer: async () => {
		const mongoClient = new MongoClient(ENV.MONGODB_URI);
		await mongoClient.connect();
		const db = mongoClient.db();

		const jobRepo = new JobRepository(db);
		await jobRepo.ensureIndexes();

		const auditRepo = new AuditRepository(db);
		await auditRepo.ensureIndexes();

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
		scheduler.stop();
		workerProtocol.close();
		addressManager.stop();
		await mongoClient.close();
		_appContext = null;
	},
});
