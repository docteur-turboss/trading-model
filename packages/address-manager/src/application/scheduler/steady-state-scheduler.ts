import type {
	DurationMs,
	InstanceId,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import {
	toInstanceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { AddressManagerClient } from "../../adapters/outbound/client/address-manager-client";
import { RedisServiceCache } from "../../adapters/outbound/discovery/redis-service-cache";
import type { ServiceHealthChecker } from "../../adapters/outbound/discovery/service-health-checker";
import type { IServiceCache } from "../../domain/discovery/service-cache.interface";
import { createRefreshJob } from "../../infrastructure/scheduler/refresh-job";
import { Scheduler } from "../../infrastructure/scheduler/scheduler";
import type { TokenManager } from "../client/token-manager";
import { CacheHealthRefresher } from "../discovery/cache-health-refresher";
import type { HeartbeatManager } from "../heartbeat-manager";

export interface SteadyStateSchedulerOptions {
	tokenManager: TokenManager;
	addressManagerClient: AddressManagerClient;
	heartbeatManager: HeartbeatManager;
	serviceCache: IServiceCache;
	healthChecker: ServiceHealthChecker;
	serviceName: ServiceId;
	instanceId: InstanceId;
	tokenRefreshIntervalMs: number;
	ttlRefreshIntervalMs: number;
	cacheTtlMs: DurationMs;
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
			createRefreshJob(
				this._options.tokenManager,
				() => this._options.tokenManager.refreshToken(),
				this._options.tokenRefreshIntervalMs
			)
		);
	}

	private _registerHeartbeat(): void {
		this._scheduler.register(
			createRefreshJob(
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
