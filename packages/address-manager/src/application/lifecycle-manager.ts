import { logger } from "@trading-model/http/infrastructure/logger";
import type {
	DurationMs,
	InstanceId,
	ServiceId,
} from "@trading-model/primitives/primitives";
import type { AddressManagerClient } from "../adapters/outbound/client/address-manager-client";
import type { ServiceHealthChecker } from "../adapters/outbound/discovery/service-health-checker";
import type { ServiceCachePort } from "../domain/ports/service-cache.port";
import type { ShutdownHandler } from "../infrastructure/shutdown-handler";
import type { TokenManager } from "./client/token-manager";
import type { HeartbeatManager } from "./heartbeat-manager";
import { SteadyStateScheduler } from "./scheduler/steady-state-scheduler";

export interface LifecycleManagerOptions {
	registrationManager: { tryStickyRegistration(): Promise<void> };
	heartbeatManager: HeartbeatManager;
	shutdownHandler: ShutdownHandler;
	serviceCache: ServiceCachePort;
	serviceName: ServiceId;
	instanceId: InstanceId;
	tokenRefreshIntervalMs: number;
	ttlRefreshIntervalMs: number;
	cacheTtlMs: DurationMs;
	tokenManager: TokenManager;
	addressManagerClient: AddressManagerClient;
	healthChecker: ServiceHealthChecker;
}

export interface LifecycleHandle {
	ready: Promise<void>;
	stop: () => void;
	/**
	 * Stops heartbeats and unregisters, without closing the service cache:
	 * other services can still be found. `stop` remains needed afterwards.
	 */
	leave: () => Promise<void>;
}

export class LifecycleManager {
	private _started = false;

	constructor(private readonly _options: LifecycleManagerOptions) {}

	start(): LifecycleHandle {
		if (this._started) {
			return this._returnExistingHandle();
		}
		this._options.shutdownHandler.removeSignalHandlers();
		this._started = true;

		const steadyState = new SteadyStateScheduler(this._options);
		steadyState.setup();
		const registrationPromise = this._startRegistration(steadyState);
		this._options.shutdownHandler.setupSignalHandlers(steadyState);

		return {
			ready: registrationPromise,
			stop: this._createStopHandler(steadyState),
			leave: async () => {
				steadyState.stop();
				await this._options.shutdownHandler.leaveRegistry();
			},
		};
	}

	private _returnExistingHandle(): LifecycleHandle {
		logger.warn("AddressManager already started — returning existing handle");
		return {
			ready: Promise.resolve(),
			stop: () => {
				this._options.shutdownHandler.shutdown();
			},
			leave: () => this._options.shutdownHandler.leaveRegistry(),
		};
	}

	private _startRegistration(steadyState: SteadyStateScheduler): Promise<void> {
		return this._register().then(() => {
			if (!this._started) {
				return;
			}
			steadyState.start();
		});
	}

	private _createStopHandler(
		steadyState: SteadyStateScheduler
	): () => Promise<void> {
		return async () => {
			this._started = false;
			this._options.shutdownHandler.removeSignalHandlers();
			steadyState.stop();
			await this._options.shutdownHandler.fullStop();
		};
	}

	private async _register(): Promise<void> {
		await this._options.registrationManager.tryStickyRegistration();
	}
}
