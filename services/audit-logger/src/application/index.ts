import "./telemetry";
import { logger } from "@trading-model/http/infrastructure/logger";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import { shutdownTelemetry } from "@trading-model/server-utils/infrastructure/telemetry";
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
		if (!_context) {
			return;
		}
		_context.addressManager = BOOTSTRAP_ADDRESS_MANAGER();
		_context.chainAuditScheduler.start();
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
		const { brokerMessage, addressManager, mongoManager, chainAuditScheduler } =
			_context;
		chainAuditScheduler.stop();
		await brokerMessage.stopMessageManager();
		addressManager.stop();
		await mongoManager.close();
		_context = null;
		await shutdownTelemetry();
	},
});
