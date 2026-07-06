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

let _mongoClient!: MongoClient;
let _scheduler!: JobScheduler;
let _workerProtocol!: WorkerProtocol;
let _brokerMessage!: BrokerMessage;
let _addressManager!: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER>;

createBootstrap({
	name: "Audit Logger",
	createServer: async () => {
		_mongoClient = new MongoClient(ENV.MONGODB_URI);
		await _mongoClient.connect();
		const db = _mongoClient.db();

		const jobRepo = new JobRepository(db);
		await jobRepo.ensureIndexes();

		const auditRepo = new AuditRepository(db);
		await auditRepo.ensureIndexes();

		_scheduler = new JobScheduler(jobRepo);
		_workerProtocol = new WorkerProtocol(
			null!,
			_scheduler.workers,
			(workerId: string) => _scheduler.onWorkerDisconnect(workerId)
		);

		const server = await createServer(_scheduler, auditRepo);

		_workerProtocol = new WorkerProtocol(
			server.raw,
			_scheduler.workers,
			(workerId: string) => _scheduler.onWorkerDisconnect(workerId)
		);
		_scheduler.setWorkerProtocol(_workerProtocol);

		await _scheduler.start();

		const { AddressManager } = await import("../config/address-manager.js");
		_brokerMessage = new BrokerMessage({
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
		await _brokerMessage.intents(AllTopics);
		logger.info("Subscribed to all event topics", {
			context: {
				topicCount: AllTopics.length,
			},
		});

		return server;
	},
	onStart: () => {
		_addressManager = BOOTSTRAP_ADDRESS_MANAGER();
		logger.info("Audit Logger fully operational", {
			context: {
				port: ENV.PORT,
				mongoUri: ENV.MONGODB_URI,
			},
		});
	},
	onStop: async () => {
		await _brokerMessage?.stopMessageManager();
		_scheduler?.stop();
		_workerProtocol?.close();
		_addressManager?.stop();
		await _mongoClient?.close();
	},
});
