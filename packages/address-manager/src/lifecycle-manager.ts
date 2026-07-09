import { logger } from "@trading-model/common/config/logger";
import type { AddressManagerClient } from "./client/address-manager-client";
import type { TokenManager } from "./client/token-manager";
import type { WebSocketClient } from "./client/websocket-client";
import type { IServiceCache } from "./discovery/service-cache.interface";
import type { ServiceHealthChecker } from "./discovery/service-health-checker";
import type { HeartbeatManager } from "./heartbeat-manager";
import type { RegistrationManager } from "./registration-manager";
import { SteadyStateScheduler } from "./scheduler/steady-state-scheduler";
import type { ShutdownHandler } from "./shutdown-handler";

export interface LifecycleManagerOptions {
	registrationManager: RegistrationManager;
	heartbeatManager: HeartbeatManager;
	shutdownHandler: ShutdownHandler;
	wsClient?: WebSocketClient;
	serviceCache: IServiceCache;
	serviceName: string;
	instanceId: string;
	tokenRefreshIntervalMs: number;
	ttlRefreshIntervalMs: number;
	cacheTtlMs: number;
	tokenManager: TokenManager;
	addressManagerClient: AddressManagerClient;
	healthChecker: ServiceHealthChecker;
}

export class LifecycleManager {
	private _started = false;

	constructor(private readonly _options: LifecycleManagerOptions) {}

	start(): { stop: () => void; ready: Promise<void> } {
		if (this._started) {
			return this._returnExistingHandle();
		}
		this._options.shutdownHandler.removeSignalHandlers();
		this._started = true;

		const steadyState = this._createSteadyState();
		steadyState.setup();
		const registrationPromise = this._startRegistration(steadyState);
		this._options.shutdownHandler.setupSignalHandlers(steadyState);

		return {
			ready: registrationPromise,
			stop: this._createStopHandler(steadyState),
		};
	}

	private _createSteadyState(): SteadyStateScheduler {
		const {
			tokenManager,
			addressManagerClient,
			heartbeatManager,
			serviceCache,
			healthChecker,
			serviceName,
			instanceId,
			tokenRefreshIntervalMs,
			ttlRefreshIntervalMs,
			cacheTtlMs,
		} = this._options;
		return new SteadyStateScheduler({
			tokenManager,
			addressManagerClient,
			heartbeatManager,
			serviceCache,
			healthChecker,
			serviceName,
			instanceId,
			tokenRefreshIntervalMs,
			ttlRefreshIntervalMs,
			cacheTtlMs,
		});
	}

	private _returnExistingHandle(): { stop: () => void; ready: Promise<void> } {
		logger.warn("AddressManager already started — returning existing handle");
		return {
			ready: Promise.resolve(),
			stop: () => {
				this._options.shutdownHandler.shutdown();
			},
		};
	}

	private _startRegistration(steadyState: SteadyStateScheduler): Promise<void> {
		return this._register().then(() => {
			if (!this._started) {
				return;
			}
			this._options.wsClient?.connect();
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
