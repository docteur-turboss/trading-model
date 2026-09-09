import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import { LeaseManager } from "../domain/lease-manager";
import { ServiceRegistry } from "../domain/service-registry";
import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

const REGISTRY = new ServiceRegistry();
const LEASE_MANAGER = new LeaseManager(REGISTRY, {
	cleanupIntervalMs: ENV.CLEANUP_SERVICE_INTERVAL_MS,
});

createBootstrap({
	name: "Discovery",
	createServer: () => createServer(REGISTRY),
	onStart: () => {
		LEASE_MANAGER.start();
	},
	onStop: () => {
		LEASE_MANAGER.stop();
	},
});
