import type {
	InstanceId,
	ServiceId,
} from "@trading-model/primitives/primitives";
import type { AddressManagerClient } from "../client/address-manager-client";
import type { TokenManager } from "../client/token-manager";
import type { HeartbeatManager } from "../heartbeat-manager";
import { createRefreshJob } from "./refresh-job";
import { Scheduler } from "./scheduler";

/** Options of SteadyStateScheduler: token and heartbeat settings. */
export interface SteadyStateSchedulerOptions {
	tokenManager: TokenManager;
	addressManagerClient: AddressManagerClient;
	heartbeatManager: HeartbeatManager;
	serviceName: ServiceId;
	instanceId: InstanceId;
	tokenRefreshIntervalMs: number;
	ttlRefreshIntervalMs: number;
}

/** Schedules the periodic jobs of a registered service: token refresh, heartbeat. */
export class SteadyStateScheduler {
	private readonly _scheduler = new Scheduler();

	constructor(private readonly _options: SteadyStateSchedulerOptions) {}

	setup(): void {
		this._registerTokenRefresh();
		this._registerHeartbeat();
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

	private async _performHeartbeat(): Promise<void> {
		const { serviceName, instanceId } = this._options;
		await this._options.heartbeatManager.sendHeartbeat({
			serviceName,
			instanceId,
		});
	}
}
