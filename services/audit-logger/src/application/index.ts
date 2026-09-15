import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { toInstanceId } from "@trading-model/common/domain/primitives";
import { logger } from "@trading-model/http/infrastructure/logger";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import {
	initializeTelemetry,
	shutdownTelemetry,
} from "@trading-model/server-utils/infrastructure/telemetry";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { ENV } from "../infrastructure/config/env";
import { createRepositories } from "../infrastructure/repository-factory";
import { createBrokerMessage } from "./broker-setup";
import { createSchedulerAndWorker } from "./scheduler-factory";

interface CleanupContext {
	mongoManager: Awaited<ReturnType<typeof createRepositories>>["mongoManager"];
	scheduler: Awaited<ReturnType<typeof createSchedulerAndWorker>>["scheduler"];
	workerProtocol: Awaited<
		ReturnType<typeof createSchedulerAndWorker>
	>["workerProtocol"];
	brokerMessage: Awaited<
		ReturnType<typeof createBrokerMessage>
	>["brokerMessage"];
	addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER>;
}

let _context: CleanupContext | null = null;

createBootstrap({
	name: "Audit Logger",
	createServer: async () => {
		const { mongoManager, jobRepo, auditRepo } = await createRepositories(
			ENV.MONGODB_URI
		);
		const { scheduler, workerProtocol, server } =
			await createSchedulerAndWorker(jobRepo, auditRepo, mongoManager);
		const { brokerMessage } = await createBrokerMessage();

		_context = {
			mongoManager,
			scheduler,
			workerProtocol,
			brokerMessage,
			addressManager: null!,
		};

		return server;
	},
	onStart: () => {
		initializeTelemetry({
			serviceName: ServiceInstanceName.AuditLoggerService,
			serviceVersion: process.env.APP_VERSION ?? "1.0.0",
			instanceId: toInstanceId(process.env.INSTANCE_ID ?? "audit-logger-1"),
			otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
		});
		if (!_context) {
			return;
		}
		_context.addressManager = BOOTSTRAP_ADDRESS_MANAGER();
		logger.info("Audit Logger fully operational", {
			context: {
				port: ENV.PORT,
				mongoUri: ENV.MONGODB_URI,
			},
		});
	},
	onStop: async () => {
		if (!_context) {
			await shutdownTelemetry();
			return;
		}
		const {
			brokerMessage,
			scheduler,
			workerProtocol,
			addressManager,
			mongoManager,
		} = _context;
		await brokerMessage.stopMessageManager();
		scheduler.stop();
		workerProtocol.close();
		addressManager.stop();
		await mongoManager.close();
		_context = null;
		await shutdownTelemetry();
	},
});
