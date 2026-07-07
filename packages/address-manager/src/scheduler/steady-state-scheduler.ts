import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import {
	toInstanceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type { TokenManager } from "../client/token-manager";
import type { AddressManagerClient } from "../client/address-manager-client";
import { CacheHealthRefresher } from "../discovery/cache-health-refresher";
import { RedisServiceCache } from "../discovery/redis-service-cache";
import type { IServiceCache } from "../discovery/service-cache.interface";
import type { ServiceHealthChecker } from "../discovery/service-health-checker";
import type { HeartbeatManager } from "../heartbeat-manager";
import { RefreshJob } from "./refresh-job";
import { Scheduler } from "./scheduler";

export interface SteadyStateSchedulerOptions {
	tokenManager: TokenManager;
	addressManagerClient: AddressManagerClient;
	heartbeatManager: HeartbeatManager;
	serviceCache: IServiceCache;
	healthChecker: ServiceHealthChecker;
	serviceName: string;
	instanceId: string;
	tokenRefreshIntervalMs: number;
	ttlRefreshIntervalMs: number;
	cacheTtlMs: number;
}

export class SteadyStateScheduler {
	private readonly _scheduler = new Scheduler();

	constructor(private readonly _options: SteadyStateSchedulerOptions) {}

	setup(): void {
		this._registerTokenRefresh();
		this._registerHeartbeat();
		this._registerCacheRefresh();
	}

	start(): void {
		this._scheduler.start();
	}

	stop(): void {
		this._scheduler.stop();
	}

	private _registerTokenRefresh(): void {
		this._scheduler.register(
			new RefreshJob(
				this._options.tokenManager,
				() => this._options.tokenManager.refreshToken(),
				this._options.tokenRefreshIntervalMs
			)
		);
	}

	private _registerHeartbeat(): void {
		this._scheduler.register(
			new RefreshJob(
				this._options.addressManagerClient,
				() => this._performHeartbeat(),
				this._options.ttlRefreshIntervalMs
			)
		);
	}

	private _registerCacheRefresh(): void {
		if (this._options.serviceCache instanceof RedisServiceCache) {
			return;
		}
		this._scheduler.register(
			new CacheHealthRefresher(
				this._options.serviceCache,
				this._options.healthChecker,
				this._options.cacheTtlMs / 2
			)
		);
	}

	private async _performHeartbeat(): Promise<void> {
		const identity: ServiceIdentity = {
			serviceName: toServiceId(this._options.serviceName),
			instanceId: toInstanceId(this._options.instanceId),
		};
		await this._options.heartbeatManager.sendHeartbeat(identity);
	}
}
