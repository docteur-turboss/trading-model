import { createBootstrap } from "@trading-model/server-utils/server/bootstrap";
import { ENV } from "../config/env";
import { LeaseManager } from "../core/lease-manager";
import { ServiceRegistry } from "../core/service-registry";
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
