import { logger } from "@trading-model/common/config/logger";
import { toServiceId, toInstanceId } from "@trading-model/common/domain/primitives";
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

	private _registerTokenRefresh(scheduler: Scheduler): void {
		scheduler.register(
			new RefreshJob(
				this._options.tokenManager,
				() => this._options.tokenManager.refreshToken(),
				this._options.tokenRefreshIntervalMs,
			),
		);
	}

	private _registerHeartbeat(scheduler: Scheduler): void {
		scheduler.register(
			new RefreshJob(
				this._options.addressManagerClient,
				() => this._performHeartbeat(),
				this._options.ttlRefreshIntervalMs,
			),
		);
	}

	private _registerCacheRefresh(scheduler: Scheduler): void {
		if (this._options.serviceCache instanceof RedisServiceCache) {
			return;
		}
		scheduler.register(
			new CacheHealthRefresher(
				this._options.serviceCache,
				this._options.healthChecker,
				this._options.cacheTtlMs / 2,
			),
		);
	}

	private _setupSchedulers(scheduler: Scheduler): void {
		this._registerTokenRefresh(scheduler);
		this._registerHeartbeat(scheduler);
		this._registerCacheRefresh(scheduler);
	}

	private async _register(): Promise<void> {
		await this._options.registrationManager.tryStickyRegistration();
	}

	private async _performHeartbeat(): Promise<void> {
		const identity: ServiceIdentity = {
			serviceName: toServiceId(this._options.serviceName),
			instanceId: toInstanceId(this._options.instanceId),
		};
		await this._options.heartbeatManager.performHeartbeat(identity);
	}
}
