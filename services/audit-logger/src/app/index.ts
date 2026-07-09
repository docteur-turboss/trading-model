import BrokerMessage from "@trading-model/broker-message";
import { logger } from "@trading-model/common/config/logger";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { MongoConnectionManager } from "@trading-model/common/persistence/mongo-connection-manager";
import { createBootstrap } from "@trading-model/common/server/bootstrap";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { ENV } from "../config/env";
import { AuditRepository } from "../persistence/audit-repository";
import { JobRepository } from "../persistence/job-repository";
import { JobScheduler } from "../scheduler/job-scheduler";
import { WorkerProtocol } from "../worker/worker-protocol";
import { createServer } from "./server";

interface AppContext {
	mongoManager: MongoConnectionManager;
	scheduler: JobScheduler;
	workerProtocol: WorkerProtocol;
	brokerMessage: BrokerMessage;
	addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER>;
}

let _appContext: AppContext | null = null;

async function _createRepositories(
	connection: Awaited<ReturnType<MongoConnectionManager["getConnection"]>>
): Promise<{ jobRepo: JobRepository; auditRepo: AuditRepository }> {
	const db = connection.db();
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
	const server = await createServer(scheduler, auditRepo);
	const workerProtocol = _createWorkerProtocol(server, scheduler);
	scheduler.setWorkerProtocol(workerProtocol);
	await scheduler.start();
	return { scheduler, workerProtocol, server };
}

function _createWorkerProtocol(
	server: Awaited<ReturnType<typeof createServer>>,
	scheduler: JobScheduler
): WorkerProtocol {
	return new WorkerProtocol(server.raw, scheduler.workers, (workerId: string) =>
		scheduler.onWorkerDisconnect(workerId)
	);
}

async function _subscribeToAllTopics(
	brokerMessage: BrokerMessage
): Promise<void> {
	const [{ MarketEvent }, { AuditEvent }, { CertificateEvent }] =
		await Promise.all([
			import("@trading-model/common/contracts/market-events"),
			import("@trading-model/common/contracts/audit-events"),
			import("@trading-model/common/contracts/certificate-events"),
		]);
	const AllTopics = [
		...Object.values(MarketEvent),
		...Object.values(AuditEvent),
		...Object.values(CertificateEvent),
	];
	await brokerMessage.intents(AllTopics);
	logger.info("Subscribed to all event topics", {
		context: { topicCount: AllTopics.length },
	});
}

async function _initBrokerMessageConfig(): Promise<BrokerMessage> {
	const { AddressManager } = await import("../config/address-manager.js");
	return new BrokerMessage({
		addressManagerClient: AddressManager,
		tlsPaths: {
			keyPath: ENV.TLS_KEY_PATH,
			caPath: ENV.TLS_CA_PATH,
			certPath: ENV.TLS_CERT_PATH,
		},
		instanceId: ENV.INSTANCE_ID,
		serviceName: ServiceInstanceName.AuditLoggerService,
	});
}

async function _createBrokerMessage(): Promise<BrokerMessage> {
	const brokerMessage = await _initBrokerMessageConfig();
	await _subscribeToAllTopics(brokerMessage);
	return brokerMessage;
}

function _stopScheduler(scheduler: JobScheduler): void {
	scheduler.stop();
}

createBootstrap({
	name: "Audit Logger",
	createServer: async () => {
		const mongoManager = new MongoConnectionManager({
			uri: ENV.MONGODB_URI,
			dbName: "audit-logger",
		});
		const mongoClient = await mongoManager.getConnection();
		const { jobRepo, auditRepo } = await _createRepositories(mongoClient);
		const { scheduler, workerProtocol, server } =
			await _createAndStartScheduler(jobRepo, auditRepo);
		const brokerMessage = await _createBrokerMessage();

		_appContext = {
			mongoManager,
			scheduler,
			workerProtocol,
			brokerMessage,
			addressManager: null!,
		};
		return server;
	},
	onStart: () => {
		if (!_appContext) {
			return;
		}
		_appContext.addressManager = BOOTSTRAP_ADDRESS_MANAGER();
		logger.info("Audit Logger fully operational", {
			context: {
				port: ENV.PORT,
				mongoUri: ENV.MONGODB_URI,
			},
		});
	},
	onStop: async () => {
		if (!_appContext) {
			return;
		}
		const {
			brokerMessage,
			scheduler,
			workerProtocol,
			addressManager,
			mongoManager,
		} = _appContext;
		await brokerMessage.stopMessageManager();
		_stopScheduler(scheduler);
		workerProtocol.close();
		addressManager.stop();
		await mongoManager.close();
		_appContext = null;
	},
});
