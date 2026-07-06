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

class ServiceContext {
	private _addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER> | null = null;
	private _mongoClient: MongoClient | null = null;
	private _scheduler: JobScheduler | null = null;
	private _workerProtocol: WorkerProtocol | null = null;
	private _brokerMessage: BrokerMessage | null = null;

	set addressManager(value: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER>) {
		this._addressManager = value;
	}

	set mongoClient(value: MongoClient) {
		this._mongoClient = value;
	}

	set scheduler(value: JobScheduler) {
		this._scheduler = value;
	}

	set workerProtocol(value: WorkerProtocol) {
		this._workerProtocol = value;
	}

	set brokerMessage(value: BrokerMessage) {
		this._brokerMessage = value;
	}

	get scheduler(): JobScheduler {
		if (!this._scheduler) throw new Error("Scheduler not initialized");
		return this._scheduler;
	}

	get workerProtocol(): WorkerProtocol | null {
		return this._workerProtocol;
	}

	get mongoClient(): MongoClient | null {
		return this._mongoClient;
	}

	async stop(): Promise<void> {
		if (this._brokerMessage) {
			await this._brokerMessage.stopMessageManager();
		}
		if (this._scheduler) {
			this._scheduler.stop();
		}
		if (this._workerProtocol) {
			this._workerProtocol.close();
		}
		if (this._addressManager) {
			this._addressManager.stop();
		}
		if (this._mongoClient) {
			await this._mongoClient.close();
		}
	}
}

const ctx = new ServiceContext();

createBootstrap({
	name: "Audit Logger",
	createServer: async () => {
		const mongoClient = new MongoClient(ENV.MONGODB_URI);
		await mongoClient.connect();
		ctx.mongoClient = mongoClient;
		const db = mongoClient.db();

		const jobRepo = new JobRepository(db);
		await jobRepo.ensureIndexes();

		const auditRepo = new AuditRepository(db);
		await auditRepo.ensureIndexes();

		const scheduler = new JobScheduler(jobRepo);
		ctx.scheduler = scheduler;

		const server = await createServer(scheduler, auditRepo);

		const workerProtocol = new WorkerProtocol(
			server.raw,
			scheduler.workers,
			(workerId: string) => ctx.scheduler.onWorkerDisconnect(workerId)
		);
		ctx.workerProtocol = workerProtocol;
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
		ctx.brokerMessage = brokerMessage;

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

		return server;
	},
	onStart: () => {
		ctx.addressManager = BOOTSTRAP_ADDRESS_MANAGER();
		logger.info("Audit Logger fully operational", {
			context: {
				port: ENV.PORT,
				mongoUri: ENV.MONGODB_URI,
			},
		});
	},
	onStop: async () => {
		await ctx.stop();
	},
});
