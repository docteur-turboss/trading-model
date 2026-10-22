import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { logger } from "@trading-model/http/infrastructure/logger";
import { toInstanceId } from "@trading-model/primitives/primitives";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import {
	initializeTelemetry,
	shutdownTelemetry,
} from "@trading-model/server-utils/infrastructure/telemetry";
import { BOOTSTRAP_ADDRESS_MANAGER } from "../config/address-manager";
import { type AuditLoggerApp, createAuditLoggerApp } from "../config/container";
import { ENV } from "../infrastructure/config/env";

type CleanupContext = Omit<AuditLoggerApp, "server"> & {
	addressManager: ReturnType<typeof BOOTSTRAP_ADDRESS_MANAGER>;
};

let _context: CleanupContext | null = null;

createBootstrap({
	name: "Audit Logger",
	createServer: async () => {
		const { server, ...resources } = await createAuditLoggerApp();
		_context = { ...resources, addressManager: null! };

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
