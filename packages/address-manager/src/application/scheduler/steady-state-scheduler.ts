import type {
	DurationMs,
	InstanceId,
	ServiceId,
} from "@trading-model/primitives/primitives";
import type { AddressManagerClient } from "../../adapters/outbound/client/address-manager-client";
import type { ServiceHealthChecker } from "../../adapters/outbound/discovery/service-health-checker";
import type { ServiceCachePort } from "../../domain/ports/service-cache.port";
import { createRefreshJob } from "../../infrastructure/scheduler/refresh-job";
import { Scheduler } from "../../infrastructure/scheduler/scheduler";
import type { TokenManager } from "../client/token-manager";
import { CacheHealthRefresher } from "../discovery/cache-health-refresher";
import type { HeartbeatManager } from "../heartbeat-manager";

/** Options of SteadyStateScheduler: token, heartbeat and cache refresh settings. */
export interface SteadyStateSchedulerOptions {
	tokenManager: TokenManager;
	addressManagerClient: AddressManagerClient;
	heartbeatManager: HeartbeatManager;
	serviceCache: ServiceCachePort;
	healthChecker: ServiceHealthChecker;
	serviceName: ServiceId;
	instanceId: InstanceId;
	tokenRefreshIntervalMs: number;
	ttlRefreshIntervalMs: number;
	cacheTtlMs: DurationMs;
}

/** Schedules the periodic jobs of a registered service: token refresh, heartbeat, cache refresh. */
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
		this._scheduler.register(
			new CacheHealthRefresher(
				this._options.serviceCache,
				this._options.healthChecker,
				this._options.cacheTtlMs / 2
			)
		);
	}

	private async _performHeartbeat(): Promise<void> {
		const { serviceName, instanceId } = this._options;
		await this._options.heartbeatManager.sendHeartbeat({
			serviceName,
			instanceId,
		});
	}
}
