import { logger } from "@trading-model/common/config/logger";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { AddressManagerClient } from "./client/address-manager-client";
import type { TokenManager } from "./client/token-manager";
import type { WebSocketClient } from "./client/websocket-client";
import { CacheHealthRefresher } from "./discovery/cache-health-refresher";
import { RedisServiceCache } from "./discovery/redis-service-cache";
import type { IServiceCache } from "./discovery/service-cache.interface";
import type { ServiceHealthChecker } from "./discovery/service-health-checker";
import type { HeartbeatManager } from "./heartbeat-manager";
import type { RegistrationManager } from "./registration-manager";
import { RefreshJob } from "./scheduler/refresh-job";
import { Scheduler } from "./scheduler/scheduler";
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
			logger.warn("AddressManager already started — returning existing handle");
			return {
				ready: Promise.resolve(),
				stop: () => {
					this._options.shutdownHandler.shutdown();
				},
			};
		}
		this._options.shutdownHandler.removeSignalHandlers();
		this._started = true;

		const scheduler = new Scheduler();

		this._setupSchedulers(scheduler);

		const registrationPromise = this._register().then(() => {
			if (!this._started) {
				return;
			}
			this._options.wsClient?.connect();
			scheduler.start();
		});

		this._options.shutdownHandler.setupSignalHandlers(scheduler);

		return {
			ready: registrationPromise,
			stop: async () => {
				this._started = false;
				this._options.shutdownHandler.removeSignalHandlers();
				scheduler.stop();
				await this._options.shutdownHandler.fullStop();
			},
		};
	}

	private _setupSchedulers(scheduler: Scheduler): void {
		const {
			tokenManager,
			addressManagerClient,
			tokenRefreshIntervalMs,
			ttlRefreshIntervalMs,
			serviceCache,
			healthChecker,
			cacheTtlMs,
		} = this._options;

		scheduler.register(
			new RefreshJob(
				tokenManager,
				(tm) => tm.refreshToken(),
				tokenRefreshIntervalMs
			)
		);

		scheduler.register(
			new RefreshJob(
				addressManagerClient,
				async () => {
					await this._performHeartbeat();
				},
				ttlRefreshIntervalMs
			)
		);

		if (!(serviceCache instanceof RedisServiceCache)) {
			scheduler.register(
				new CacheHealthRefresher(
					serviceCache,
					healthChecker,
					cacheTtlMs / 2
				)
			);
		}
	}

	private async _register(): Promise<void> {
		await this._options.registrationManager.tryStickyRegistration();
	}

	private async _performHeartbeat(): Promise<void> {
		const identity: ServiceIdentity = {
			serviceName: this._options.serviceName,
			instanceId: this._options.instanceId,
		};
		await this._options.heartbeatManager.performHeartbeat(identity);
	}
}
